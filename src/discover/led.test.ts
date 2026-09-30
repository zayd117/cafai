// Stub transport tests for the Jev-led loop: no network, no live model.
import { describe, expect, it } from "vitest";
import { dedupe, discoverLed, finalize, LED_CONFIG, pairScores, pickQueriesLed, rankBase } from "./led";
import { JevScorer } from "./scorer";
import type { FetchLike } from "./search";
import type { ItemScore, Listing, ListingScore, Ranked, QueryScore } from "./types";

const listing = (slug: string, over: Partial<Listing> = {}): Listing => ({
  slug, name: slug, title: null, description: `${slug} description`, grade: "B", grade_score: 70, certified: false, category: null, price_micros: 0, url: `https://mcp.market/server/${slug}`, ...over,
});
const item = (item_id: string, weight: number): ItemScore => ({ item_id, core: weight, extra: 0, weight });
const qs = (query_id: string, score: number): QueryScore => ({ query_id, faithful: score, drift: 0, score });

describe("pickQueriesLed", () => {
  const itemOf = (id: string) => ({ q0: "a", q1: "a", q2: "a", q3: "a", q4: "a", q5: "b", q6: "b", q7: "c" })[id]!;
  const scores = [qs("q0", 0.9), qs("q1", 0.85), qs("q2", 0.8), qs("q3", 0.75), qs("q4", 0.7), qs("q5", 0.6), qs("q6", 0.2), qs("q7", 0.9)];

  it("drops weak queries and non-central needs, keeps the best query for every remaining need, caps a need", () => {
    const { picked, dropped_items } = pickQueriesLed({ queryScores: scores, itemScores: [item("a", 1), item("b", 0.8), item("c", 0.1)], itemOf, cfg: { ...LED_CONFIG, itemFloor: 0.25 } });
    const ids = picked.map((p) => p.query_id);
    expect(dropped_items).toEqual(["c"]);
    expect(ids).not.toContain("q7"); // need c is not central
    expect(ids).not.toContain("q6"); // below the query floor
    expect(ids).toContain("q5"); // need b keeps its best query even though need a scores higher
    expect(ids.filter((id) => itemOf(id) === "a")).toHaveLength(LED_CONFIG.maxPerItem);
  });

  it("by default never drops a need and gives each one its best two queries before anyone gets a third", () => {
    const { picked, dropped_items } = pickQueriesLed({ queryScores: scores, itemScores: [item("a", 1), item("b", 0.8), item("c", 0.1)], itemOf, cfg: { ...LED_CONFIG, queryBudget: 5 } });
    expect(dropped_items).toEqual([]);
    expect(picked.map((p) => p.query_id).sort()).toEqual(["q0", "q1", "q5", "q7", "q2"].sort()); // a: q0,q1; b: q5 (q6 is below the floor); c: q7; then the best remaining (q2)
  });

  it("ranks across needs: a central need's second query beats a minor need's first-choice filler, within the budget", () => {
    const { picked } = pickQueriesLed({ queryScores: scores, itemScores: [item("a", 1), item("b", 0.3), item("c", 0.9)], itemOf, cfg: { ...LED_CONFIG, queryBudget: 4 } });
    expect(picked).toHaveLength(4);
    expect(picked.map((p) => p.query_id).sort()).toEqual(["q0", "q1", "q5", "q7"]); // one each for a, b, c, then the best remaining
  });
});

describe("rankBase", () => {
  const cands = ["x", "y"].map((s) => ({ listing: listing(s), found_by: ["q0"] }));
  const score = (slug: string, per_item: Record<string, number>, useful = 0.1, per_term: Record<string, number> = { t: 0.9 }): ListingScore => ({ slug, per_item, useful, per_term });

  it("counts a match to a central need for more than a match to a minor one", () => {
    const r = rankBase({ listings: cands, listingScores: new Map([["x", score("x", { a: 0.9 })], ["y", score("y", { b: 0.9 })]]), itemWeights: new Map([["a", 1], ["b", 0.1]]), termRank: new Map([["t", 0.8]]) });
    expect(r.map((x) => x.listing.slug)).toEqual(["x", "y"]);
    expect(r[0]!.final).toBeGreaterThan(r[1]!.final);
  });

  it("scales by how well the result matches the search terms, weighted by how likely the term was right", () => {
    const same = { a: 0.9 };
    const r = rankBase({ listings: cands, listingScores: new Map([["x", score("x", same, 0.1, { t: 0.9 })], ["y", score("y", same, 0.1, { t: 0.1 })]]), itemWeights: new Map([["a", 1]]), termRank: new Map([["t", 0.9]]) });
    expect(r[0]!.listing.slug).toBe("x");
    expect(r[0]!.p_query).toBeCloseTo(0.81);
  });

  it("drops F grades and unscored results", () => {
    const r = rankBase({ listings: [{ listing: listing("f", { grade: "F" }), found_by: [] }, { listing: listing("u"), found_by: [] }, cands[0]!], listingScores: new Map([["f", score("f", { a: 1 })], ["x", score("x", { a: 1 })]]), itemWeights: new Map(), termRank: new Map() });
    expect(r.map((x) => x.listing.slug)).toEqual(["x"]);
  });
});

describe("dedupe and pair scores", () => {
  it("keeps one of several listings with the same description, the better graded", () => {
    const out = dedupe([{ listing: listing("a", { description: "Same thing!", grade_score: 50 }) }, { listing: listing("b", { description: "same thing", grade_score: 80 }) }, { listing: listing("c") }]);
    expect(out.map((c) => c.listing.slug).sort()).toEqual(["b", "c"]);
  });

  it("averages each result's chance of beating the others", () => {
    const m = pairScores(["a", "b", "c"], [{ a: "a", b: "b", p_a: 0.8 }, { a: "a", b: "c", p_a: 0.6 }, { a: "b", b: "c", p_a: 0.5 }]);
    expect(m.get("a")).toBeCloseTo(0.7);
    expect(m.get("b")).toBeCloseTo((0.2 + 0.5) / 2);
    expect(m.get("c")).toBeCloseTo((0.4 + 0.5) / 2);
  });

  it("finalize lets head-to-head wins break a tie at 100%, and keeps at least minKeep", () => {
    const mk = (slug: string, final: number): Ranked => ({ listing: listing(slug), found_by: [], p_query: 1, fit: 1, trust: 0.7, final, covers: [], weak: false });
    const out = finalize([mk("a", 0.96), mk("b", 0.96), mk("c", 0.96)], new Map([["a", 0.2], ["b", 0.9], ["c", 0.5]]));
    expect(out.map((r) => r.listing.slug)).toEqual(["b", "c", "a"]);
    const weak = finalize([mk("a", 0.1), mk("b", 0.05), mk("c", 0.04), mk("d", 0.03)], null);
    expect(weak.map((r) => r.listing.slug)).toEqual(["a", "b", "c"]);
  });
});

/** Jev stub: answers by question-key suffix from a script (default 0.1) and records what it was sent. */
function jevStub(script: (key: string, instructions: Record<string, any>) => number | undefined) {
  const calls: { questions: Record<string, { instructions: Record<string, any> }>; state: any }[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body));
    calls.push(body);
    const answers = Object.fromEntries(Object.entries(body.questions as Record<string, { instructions: Record<string, any> }>).map(([k, q]) => [k, { type: "noul", noul: script(k, q.instructions) ?? 0.1 }]));
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 1000, output_tokens: 10 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

describe("JevScorer, Jev-led questions", () => {
  it("asks two questions per need, sends items as state, and treats missing answers as neutral", async () => {
    const stub = jevStub((k) => (k === "i0_core" ? 0.9 : k === "i0_extra" ? 0.2 : undefined));
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const out = await jev.scoreItems([{ id: "a", text: "one" }, { id: "b", text: "two" }]);
    expect(out[0]).toMatchObject({ item_id: "a", core: 0.9, extra: 0.2 });
    expect(out[0]!.weight).toBeCloseTo(0.9 * 0.9);
    expect(Object.keys(stub.calls[0]!.questions)).toEqual(["i0_core", "i0_extra", "i1_core", "i1_extra"]);
    expect(stub.calls[0]!.state).toEqual({ items: [{ id: "a", text: "one" }, { id: "b", text: "two" }] });
  });

  it("rates a result against each search term that found it", async () => {
    const stub = jevStub((k) => (k === "l0_t0" ? 0.8 : k === "l0_t1" ? 0.3 : undefined));
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const [s] = await jev.scoreListingsLed([{ id: "a", text: "one" }], [{ listing: listing("x"), terms: ["food data", "calorie lookup"] }]);
    expect(s!.per_term).toEqual({ "food data": 0.8, "calorie lookup": 0.3 });
    expect(stub.calls[0]!.questions["l0_t0"]!.instructions.term).toBe("food data");
  });

  it("asks each pair in both orders and cancels a lean toward whichever is named first", async () => {
    const lean = jevStub(() => 0.9); // says yes to both orders
    const jev = new JevScorer({ apiKey: "k", fetch: lean.fetch as never });
    const [r] = await jev.comparePairs([{ id: "a", text: "one" }], [[listing("x"), listing("y")]]);
    expect(r!.p_a).toBeCloseTo(0.5);
    const real = jevStub((k, ins) => (k.endsWith("_ab") ? (ins.a.name === "x" ? 0.9 : 0.1) : (ins.a.name === "y" ? 0.1 : 0.9)));
    const jev2 = new JevScorer({ apiKey: "k", fetch: real.fetch as never });
    const [r2] = await jev2.comparePairs([{ id: "a", text: "one" }], [[listing("x"), listing("y")]]);
    expect(r2!.p_a).toBeGreaterThan(0.85);
  });
});

describe("discoverLed end to end", () => {
  const interp = {
    items: [{ id: "i0", text: "look up food data" }, { id: "i1", text: "an extra nobody asked for" }],
    queries: [
      { id: "q0", item_id: "i0", text: "food database" },
      { id: "q1", item_id: "i0", text: "calorie lookup" },
      { id: "q2", item_id: "i1", text: "stock prices" },
    ],
  };
  const market: FetchLike = async (url) => {
    const q = decodeURIComponent(url.split("q=")[1]!);
    const results = q === "food database" ? [{ slug: "good", description: "food facts" }, { slug: "ok", description: "meal notes" }] : [{ slug: "good", description: "food facts" }];
    return new Response(JSON.stringify({ results }), { status: 200 });
  };

  it("weighs needs, searches only the picked queries, rates against terms, orders by head-to-head, and never sends the raw text to Jev", async () => {
    const stub = jevStub((k, ins) => {
      if (k === "i0_core") return 0.95;
      if (k === "i1_core") return 0.05;
      if (k.endsWith("_faithful")) return 0.9;
      if (k.endsWith("_drift")) return 0.1;
      if (/^l\d+_i0$/.test(k) || /^l\d+_useful$/.test(k)) return ins.candidate?.name === "good" ? 0.95 : 0.6;
      if (/^l\d+_t\d+$/.test(k)) return 0.9;
      if (k.endsWith("_ab")) return ins.a.name === "good" ? 0.9 : 0.1;
      if (k.endsWith("_ba")) return ins.a.name === "good" ? 0.9 : 0.1;
      return undefined;
    });
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const r = await discoverLed({ text: "SECRET raw description", claude: { interpret: async () => interp }, jev, fetch: market });
    expect(r.itemScores.map((s) => s.item_id)).toEqual(["i0", "i1"]);
    expect(r.dropped_items).toEqual([]); // needs are weighed, never dropped, by default
    expect(r.searched.map((s) => s.text).sort()).toEqual(["calorie lookup", "food database", "stock prices"]);
    expect(r.ranked.map((x) => x.listing.slug)).toEqual(["good", "ok"]);
    expect(r.ranked[0]!.pair).toBeGreaterThan(r.ranked[1]!.pair!);
    expect(r.pairs_asked).toBe(1);
    expect(r.gaps).toEqual(["i1"]); // nothing returned covers the second need with confidence
    expect(JSON.stringify(stub.calls)).not.toContain("SECRET");
  });
});
