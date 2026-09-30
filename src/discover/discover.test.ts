// Stub transport tests: no network, no live model. Prove request shape, validation, scoring math and the end-to-end loop.
import { describe, expect, it } from "vitest";
import { validateInterpretation } from "./claude";
import { DISCOVER_CONFIG, noisyOr, pickQueries, rank, withEachNeed } from "./rank";
import { discover, type Interpreter } from "./run";
import { JevScorer } from "./scorer";
import { toListing, searchMarket, type FetchLike } from "./search";
import type { Listing } from "./types";

const listing = (slug: string, over: Partial<Listing> = {}): Listing => ({
  slug, name: slug, title: null, description: `${slug} description`, grade: "B", grade_score: 70, certified: false, category: null, price_micros: 0, url: `https://mcp.market/server/${slug}`, ...over,
});

/** Jev stub: answers every noul question by key suffix from a script (default 0.1). */
function jevStub(script: (key: string, instructions: Record<string, unknown>) => number | undefined) {
  const calls: { questions: Record<string, { instructions: Record<string, unknown> }>; state: unknown }[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body));
    calls.push(body);
    const answers = Object.fromEntries(Object.entries(body.questions as Record<string, { instructions: Record<string, unknown> }>).map(([k, q]) => [k, { type: "noul", noul: script(k, q.instructions) ?? 0.1 }]));
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 1000, output_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

describe("search", () => {
  it("keeps only usable fields, caps and cleans text, builds the url from the slug", () => {
    const l = toListing({ slug: "a-b", name: "x\u0000y", description: "d".repeat(500), grade: "Z", gradeScore: 61, defaultPriceMicros: 20000, url: "https://evil.example/" })!;
    expect(l.url).toBe("https://mcp.market/server/a-b");
    expect(l.description).toHaveLength(300);
    expect(l.name).toBe("x y");
    expect(l.grade).toBeNull();
    expect(l.price_micros).toBe(20000);
    expect(toListing({ slug: "bad slug", description: "d" })).toBeNull();
    expect(toListing({ slug: "ok", description: "" })).toBeNull();
  });

  it("retries once, then throws", async () => {
    let n = 0;
    const f: FetchLike = async () => { n++; return new Response("no", { status: 500 }); };
    await expect(searchMarket("q", { fetch: f })).rejects.toThrow(/500/);
    expect(n).toBe(2);
    const ok: FetchLike = async (url) => {
      expect(url).toBe("https://mcp.market/api/search?q=food%20data");
      return new Response(JSON.stringify({ results: [{ slug: "s1", description: "d" }, { slug: "", description: "d" }] }), { status: 200 });
    };
    expect((await searchMarket("food data", { fetch: ok })).map((l) => l.slug)).toEqual(["s1"]);
  });
});

describe("interpretation check", () => {
  it("drops queries for unknown items and duplicates, ids the queries, rejects an empty result", () => {
    const out = validateInterpretation({ items: [{ id: "i0", text: "food data" }], queries: [{ item_id: "i0", text: "food db" }, { item_id: "i0", text: "Food DB" }, { item_id: "zz", text: "x y" }] })!;
    expect(out.queries).toEqual([{ id: "q0", item_id: "i0", text: "food db" }]);
    expect(validateInterpretation({ items: [{ id: "i0", text: "a" }, { id: "i0", text: "b" }], queries: [] })).toBeNull();
    expect(validateInterpretation({ items: [{ id: "i0", text: "a" }], queries: [{ item_id: "nope", text: "q q" }] })).toBeNull();
  });
});

describe("ranking math", () => {
  it("keeps the best two queries per item above the floor", () => {
    const scores = [
      { query_id: "a", faithful: 0.9, drift: 0, score: 0.9 }, { query_id: "b", faithful: 0.8, drift: 0, score: 0.8 },
      { query_id: "c", faithful: 0.7, drift: 0, score: 0.7 }, { query_id: "d", faithful: 0.9, drift: 0.9, score: 0.09 },
    ];
    const kept = pickQueries(scores, () => "i0");
    expect(kept.map((k) => k.query_id)).toEqual(["a", "b"]);
  });

  it("noisy-OR covers more needs; F grade is dropped; trust only nudges; unscored is never ranked", () => {
    expect(noisyOr([0.5, 0.5])).toBeCloseTo(0.75);
    const listings = [
      { listing: listing("fits"), found_by: ["q0"] },
      { listing: listing("popular", { grade: "A", grade_score: 100 }), found_by: ["q0"] },
      { listing: listing("bad", { grade: "F", grade_score: 10 }), found_by: ["q0"] },
      { listing: listing("unscored"), found_by: ["q0"] },
    ];
    const ranked = rank({
      listings,
      queryScores: new Map([["q0", 0.8]]),
      listingScores: new Map([
        ["fits", { slug: "fits", per_item: { i0: 0.9, i1: 0.8 }, useful: 0.6 }],
        ["popular", { slug: "popular", per_item: { i0: 0.2, i1: 0.1 }, useful: 0.3 }],
        ["bad", { slug: "bad", per_item: { i0: 1, i1: 1 }, useful: 1 }],
      ]),
    });
    expect(ranked.map((r) => r.listing.slug)).toEqual(["fits", "popular"]);
    expect(ranked[0]!.fit).toBeCloseTo(0.98); // 1 - 0.1 x 0.2
    expect(ranked[0]!.covers).toEqual(["i0", "i1"]);
    expect(ranked[1]!.weak).toBe(false); // fit 0.3 is not below the weak line
    expect(DISCOVER_CONFIG.trustWeight).toBeLessThan(0.5);
  });
});

describe("each need keeps its best server", () => {
  it("does not let one popular need fill the whole list", () => {
    const mk = (slug: string, final: number, covers: string[]) => ({ listing: listing(slug), found_by: ["q0"], p_query: 1, fit: final, trust: 1, final, covers, weak: false });
    const sorted = [mk("a", 0.9, ["i0"]), mk("b", 0.8, ["i0"]), mk("c", 0.7, ["i0"]), mk("d", 0.2, ["i1"])];
    expect(withEachNeed(sorted, 3).map((r) => r.listing.slug)).toEqual(["a", "b", "d"]);
    expect(withEachNeed(sorted, 2).map((r) => r.listing.slug)).toEqual(["a", "d"]);
  });
});

describe("JevScorer (stub transport)", () => {
  const items = [{ id: "i0", text: "Look up food facts" }, { id: "i1", text: "Save meals" }];

  it("pass 1 sends items only, asks faithful and drift per query, and multiplies", async () => {
    const s = jevStub((k) => ({ q0_faithful: 0.9, q0_drift: 0.1, q1_faithful: 0.8, q1_drift: 0.9 })[k]);
    const scorer = new JevScorer({ apiKey: "k", fetch: s.fetch });
    const out = await scorer.scoreQueries(items, [{ id: "a", item_id: "i0", text: "food db" }, { id: "b", item_id: "i0", text: "stock prices" }]);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]!.state).toEqual({ items: [{ id: "i0", text: "Look up food facts" }, { id: "i1", text: "Save meals" }] });
    expect(Object.keys(s.calls[0]!.questions).sort()).toEqual(["q0_drift", "q0_faithful", "q1_drift", "q1_faithful"]);
    expect(s.calls[0]!.questions.q0_faithful!.instructions).toMatchObject({ query: "food db", target: "Look up food facts" });
    expect(out.map((o) => +o.score.toFixed(2))).toEqual([0.81, 0.08]);
    expect(scorer.usage).toHaveLength(1);
  });

  it("pass 2 batches five listings per request and maps answers back by slug", async () => {
    const s = jevStub((k) => (k === "l1_i0" ? 0.9 : k === "l0_useful" ? 0.7 : undefined));
    const many = Array.from({ length: 7 }, (_, i) => listing(`s${i}`));
    const out = await new JevScorer({ apiKey: "k", fetch: s.fetch }).scoreListings(items, many);
    expect(s.calls).toHaveLength(2); // 5 + 2
    expect(out.map((o) => o.slug)).toEqual(many.map((m) => m.slug));
    expect(out[1]!.per_item.i0).toBe(0.9);
    expect(out[0]!.useful).toBe(0.7);
    expect(s.calls[0]!.questions.l0_i0!.instructions.candidate).toEqual({ name: "s0", description: "s0 description", category: null });
  });
});

describe("discover (whole loop, stubbed)", () => {
  it("interprets, drops the drifting query, searches only kept queries, ranks by combined score, tolerates a failed search", async () => {
    const claude: Interpreter = {
      interpret: async () => ({
        items: [{ id: "i0", text: "Look up food facts" }],
        queries: [{ id: "q0", item_id: "i0", text: "food db" }, { id: "q1", item_id: "i0", text: "stock prices" }, { id: "q2", item_id: "i0", text: "calorie lookup" }],
      }),
      explain: async (_i, picks) => new Map(picks.map((p) => [p.listing.slug, `about ${p.listing.slug}`])),
    };
    const jev = new JevScorer({
      apiKey: "k",
      fetch: jevStub((k) => ({ q0_faithful: 0.9, q0_drift: 0.05, q1_faithful: 0.2, q1_drift: 0.8, q2_faithful: 0.8, q2_drift: 0.1, l0_i0: 0.9, l1_i0: 0.2, l0_useful: 0.8, l1_useful: 0.2 })[k]).fetch,
    });
    const searchedUrls: string[] = [];
    const fetch: FetchLike = async (url) => {
      searchedUrls.push(url);
      if (url.includes("calorie")) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify({ results: [{ slug: "good", description: "food facts" }, { slug: "meh", description: "other" }] }), { status: 200 });
    };
    const r = await discover({ text: "ignored by stubs", claude, jev, fetch });
    expect(searchedUrls.some((u) => u.includes("stock"))).toBe(false); // dropped before any search
    expect(r.searched.find((s) => s.query_id === "q2")!.error).toMatch(/500/);
    expect(r.ranked.map((x) => x.listing.slug)).toEqual(["good", "meh"]);
    expect(r.ranked[0]!.found_by).toEqual(["q0"]);
    expect(r.explanations.get("good")).toBe("about good");
    expect(r.uncovered_items).toEqual([]);
  });
});
