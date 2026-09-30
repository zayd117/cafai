// Stub transport tests for the Jev-led loop: no network, no live model.
import { describe, expect, it } from "vitest";
import { cachedPostFetch } from "./bakeoff";
import { dedupe, discoverLed, finalize, handshake, interleave, LED_CONFIG, needPools, pairScores, pickQueriesLed, rankBase, scaleToTop } from "./led";
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
    // The first version of the loop: head to head, text in every question, term questions on, no screen.
    const first = { ...LED_CONFIG, order: "pairs" as const, compact: false, screen: 0, termsPerListing: 2, termFloor: 0.7, termWeight: 0.3 };
    const r = await discoverLed({ text: "SECRET raw description", claude: { interpret: async () => interp }, jev, fetch: market, cfg: first });
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

/** Typed Jev stub: answers noul, score and choice questions from one script, and records what it was sent. */
function typedStub(script: (key: string, q: { type: string; instructions: any; criteria: any }) => any) {
  const calls: { questions: Record<string, any>; state: any }[] = [];
  const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init!.body));
    calls.push(body);
    const answers = Object.fromEntries(
      Object.entries(body.questions as Record<string, any>).flatMap(([k, q]): [string, unknown][] => {
        const v = script(k, q);
        if (v === undefined) return [];
        if (q.type === "choice") return [[k, { type: "choice", choice: Object.keys(v)[0], confidence: 1, probabilities: v }]];
        if (q.type === "score") return [[k, { type: "score", score: v, confidence: 1, legend: {}, probabilities: {} }]];
        return [[k, { type: "noul", noul: v }]];
      }),
    );
    return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 100, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

describe("Jev-led options", () => {
  const items = [{ id: "a", text: "one" }];

  it("compact mode sends each result once, in state, and refers to it by id", () => {
    const { questions, state } = JevScorer.listingQuestionsLed(items, [{ listing: listing("x"), terms: ["t"] }], { compact: true });
    expect(state).toEqual({ candidates: { c0: { name: "x", description: "x description", category: null } } });
    const q = (questions as Record<string, any>)["l0_i0"];
    expect(q.instructions.candidate_id).toBe("c0");
    expect(q.instructions.candidate).toBeUndefined();
    expect(JSON.stringify(questions)).not.toContain("x description");
  });

  it("graded fit turns a 0-3 score into 0-1", async () => {
    const stub = typedStub((k, q) => (q.type === "score" ? (k === "l0_i0" ? 3 : 1.5) : 0.5));
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const out = await jev.scoreListingsLed([{ id: "a", text: "one" }, { id: "b", text: "two" }], [{ listing: listing("x"), terms: [] }], { fit: "score" });
    expect(out[0]!.per_item).toEqual({ a: 1, b: 0.5 });
    expect(stub.calls[0]!.questions["l0_i0"].type).toBe("score");
  });

  it("pick-the-best asks twice with the list reversed, so a lean toward the first option cancels out", async () => {
    const stub = typedStub((_k, q) => (q.type === "choice" ? { c0: 0.7, c1: 0.3 } : undefined)); // always favours whichever is listed first
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const m = await jev.rankList(items, [listing("x"), listing("y")]);
    expect(m.get("x")).toBeCloseTo(0.5);
    expect(m.get("y")).toBeCloseTo(0.5);
    expect(Object.keys(stub.calls[0]!.questions)).toEqual(["fwd", "rev"]);
    expect(scaleToTop(new Map([["x", 0.6], ["y", 0.3]]))).toEqual(new Map([["x", 1], ["y", 0.5]]));
  });

  it("counts answers Jev did not return instead of hiding them", async () => {
    const stub = typedStub((k) => (k === "q0_faithful" ? 0.9 : undefined));
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const [s] = await jev.scoreQueries(items, [{ id: "q0", item_id: "a", text: "t" }]);
    expect(s!.drift).toBe(1);
    expect(jev.missing).toBe(1);
    expect(jev.usage[0]!.step).toBe("queries");
  });

  it("discoverLed with order 'choice' ranks the shortlist by the pick-the-best vote and asks no pairs", async () => {
    const interp = { items: [{ id: "i0", text: "look up food data" }], queries: [{ id: "q0", item_id: "i0", text: "food database" }] };
    const market: FetchLike = async () => new Response(JSON.stringify({ results: [{ slug: "aa", description: "food facts" }, { slug: "zz", description: "meal notes" }] }), { status: 200 });
    const stub = typedStub((k, q) => {
      if (q.type === "choice") return Object.fromEntries(Object.entries(q.criteria).map(([label, c]: [string, any]) => [label, c.name === "zz" ? 0.9 : 0.1]));
      return k.endsWith("_drift") ? 0.1 : 0.9; // every rating ties
    });
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const r = await discoverLed({ text: "t", claude: { interpret: async () => interp }, jev, fetch: market, cfg: { ...LED_CONFIG, order: "choice" } });
    expect(r.ranked.map((x) => x.listing.slug)).toEqual(["zz", "aa"]);
    expect(r.pairs_asked).toBe(0);
    expect(jev.usage.map((u) => u.step)).toContain("choice");
    expect(jev.usage.map((u) => u.step)).not.toContain("pairs");
  });
});

describe("discoverLed defaults", () => {
  it("screens with one question, rates only the best in full, sends each result's text once, and orders by pick-the-best", async () => {
    const interp = { items: [{ id: "i0", text: "look up food data" }], queries: [{ id: "q0", item_id: "i0", text: "food database" }] };
    const market: FetchLike = async () => new Response(JSON.stringify({ results: ["aa", "bb", "cc"].map((slug) => ({ slug, description: `${slug} tool` })) }), { status: 200 });
    const stub = typedStub((k, q) => {
      if (q.type === "choice") return Object.fromEntries(Object.keys(q.criteria).map((label) => [label, 1 / Object.keys(q.criteria).length]));
      return k.endsWith("_drift") ? 0.1 : 0.9;
    });
    const jev = new JevScorer({ apiKey: "k", fetch: stub.fetch as never });
    const r = await discoverLed({ text: "t", claude: { interpret: async () => interp }, jev, fetch: market, cfg: { ...LED_CONFIG, screen: 2 } });
    const full = stub.calls.find((c) => Object.keys(c.questions).some((k) => /_i0$/.test(k)))!;
    expect(Object.keys(full.questions).filter((k) => k.endsWith("_useful"))).toHaveLength(2); // only the best 2 of 3 got the full set
    expect(Object.keys(full.state.candidates)).toHaveLength(2);
    expect(JSON.stringify(full.questions)).not.toContain("tool"); // result text lives in state, not in the questions
    expect(jev.usage.map((u) => u.step)).toEqual(expect.arrayContaining(["screen", "listings", "choice"]));
    expect(r.ranked).toHaveLength(2);
  });
});

describe("discoverLed when an optional Jev step fails", () => {
  it("keeps the ratings' order and says which step was skipped", async () => {
    const interp = { items: [{ id: "i0", text: "look up food data" }], queries: [{ id: "q0", item_id: "i0", text: "food database" }] };
    const market: FetchLike = async () => new Response(JSON.stringify({ results: ["aa", "bb", "cc"].map((slug) => ({ slug, description: `${slug} tool` })) }), { status: 200 });
    const ok = typedStub((k) => (k.endsWith("_drift") ? 0.1 : 0.9));
    const failing = async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      if (Object.values(body.questions).some((q: any) => q.type === "choice") || Object.keys(body.questions).length === 3) return new Response("{}", { status: 400 });
      return ok.fetch(url, init);
    };
    const jev = new JevScorer({ apiKey: "k", fetch: failing as never });
    const r = await discoverLed({ text: "t", claude: { interpret: async () => interp }, jev, fetch: market, cfg: { ...LED_CONFIG, screen: 2, verifyShown: false } });
    expect(r.degraded).toEqual(["screen", "order"]);
    expect(r.ranked.length).toBeGreaterThan(0);
  });
});

describe("final handshake on what is shown", () => {
  it("checks shown results against the searches that found them and moves a failing one below the passes", async () => {
    const interp = { items: [{ id: "i0", text: "look up food data" }], queries: [{ id: "q0", item_id: "i0", text: "food database" }] };
    const market: FetchLike = async () => new Response(JSON.stringify({ results: ["aa", "bb"].map((slug) => ({ slug, description: `${slug} tool` })) }), { status: 200 });
    const stub = typedStub((k, q) => {
      if (q.type === "choice") return Object.fromEntries(Object.keys(q.criteria).map((label, i) => [label, i === 0 ? 0.9 : 0.1]));
      return k.endsWith("_drift") ? 0.1 : 0.9;
    });
    // "aa" is the favourite, but the check says it does not do what "food database" looked for.
    const fetch = async (u: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      if (Object.keys(body.questions).some((k) => /_t\d+$/.test(k))) {
        const answers = Object.fromEntries(Object.entries(body.questions as Record<string, any>).map(([k, q]) => [k, { type: "noul", noul: body.state.candidates[q.instructions.candidate_id].name === "aa" ? 0.1 : 0.9 }]));
        return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 1 } }), { status: 200 });
      }
      return stub.fetch(u, init);
    };
    const jev = new JevScorer({ apiKey: "k", fetch: fetch as never });
    const r = await discoverLed({ text: "t", claude: { interpret: async () => interp }, jev, fetch: market, cfg: { ...LED_CONFIG, verifyShown: true } });
    expect(r.ranked.map((x) => x.listing.slug)).toEqual(["bb", "aa"]);
    expect(r.ranked[1]!.weak).toBe(true);
    expect(r.ranked[0]!.path).toMatchObject({ query: "food database", result_fits_query: 0.9 });
    expect(jev.usage.map((u) => u.step)).toContain("verify");
  });
});

describe("cachedPostFetch", () => {
  it("replays an identical request and pays for a changed one", async () => {
    let calls = 0;
    const inner = (async () => { calls++; return new Response(`{"n":${calls}}`, { status: 200 }); }) as unknown as typeof fetch;
    const f = cachedPostFetch(new Map(), inner);
    const a = await (await f("https://x/v1", { method: "POST", body: "same" })).json();
    const b = await (await f("https://x/v1", { method: "POST", body: "same" })).json();
    await f("https://x/v1", { method: "POST", body: "other" });
    expect(a).toEqual(b);
    expect(calls).toBe(2);
  });
});

describe("handshake between searches and results", () => {
  const info = new Map([
    ["q0", { text: "food database", need: "a", score: 0.9 }],
    ["q1", { text: "stock prices", need: "b", score: 0.4 }],
  ]);
  const s = (per_item: Record<string, number>, per_term: Record<string, number>): ListingScore => ({ slug: "x", per_item, useful: 0.5, per_term });

  it("counts a result as verified for a need only as far as 'fits the search' and 'fits the need' agree", () => {
    const h = handshake(s({ a: 0.95 }, { "food database": 0.3 }), ["q0"], info);
    expect(h.match.a).toBeCloseTo(0.3); // Jev says it fits the need, but not what the search asked for: the weaker check wins
    expect(h.path).toMatchObject({ need: "a", query: "food database", result_fits_query: 0.3, result_fits_need: 0.95 });
  });

  it("discounts a need the result does but no search for that need found", () => {
    const h = handshake(s({ a: 0.9, b: 0.8 }, { "food database": 0.9 }), ["q0"], info);
    expect(h.match.a).toBeCloseTo(0.9);
    expect(h.match.b).toBeCloseTo(0.8 * LED_CONFIG.unverified);
    expect(h.path!.need).toBe("a");
  });

  it("uses the need check alone for a search it was not asked about", () => {
    expect(handshake(s({ a: 0.7 }, {}), ["q0"], info).match.a).toBeCloseTo(0.7);
  });
});

describe("by-need pools and turn-taking", () => {
  const r = (slug: string, match: Record<string, number>, trust = 0.7): Ranked => ({ listing: listing(slug), found_by: [], p_query: 0, fit: 0.9, trust, final: 0.9, covers: [], weak: false, match });

  it("keeps results verified for each need, strongest first, capped", () => {
    const pools = needPools([r("x", { a: 0.9, b: 0.2 }), r("y", { a: 0.6, b: 0.8 }), r("z", { a: 0.4 })], ["a", "b"], { ...LED_CONFIG, perNeedPool: 5 });
    expect(pools.get("a")!.map((x) => x.listing.slug)).toEqual(["x", "y"]); // z is below needVerify for a
    expect(pools.get("b")!.map((x) => x.listing.slug)).toEqual(["y"]);
  });

  it("takes turns across needs, most promising need first, and shows a result once", () => {
    const out = interleave([
      { need: "a", priority: 0.5, picks: [r("a1", {}), r("a2", {}), r("a3", {})] },
      { need: "b", priority: 0.9, picks: [r("b1", {}), r("a1", {})] },
    ], 4);
    expect(out.map((x) => x.listing.slug)).toEqual(["b1", "a1", "a2", "a3"]);
  });
});

describe("discoverLed by need, hybrid, and the second search", () => {
  const interp = {
    items: [{ id: "i0", text: "weather" }, { id: "i1", text: "garden journal" }],
    queries: [
      { id: "q0", item_id: "i0", text: "weather api" },
      { id: "q1", item_id: "i1", text: "notes app" },
      { id: "q2", item_id: "i1", text: "garden journal" },
    ],
  };
  const results: Record<string, string[]> = { "weather api": ["w1", "w2", "w3"], "notes app": ["w4"], "garden journal": ["g1"] };
  const market: FetchLike = async (url) => {
    const q = decodeURIComponent(url.split("q=")[1]!);
    return new Response(JSON.stringify({ results: (results[q] ?? []).map((slug) => ({ slug, description: `${slug} tool` })) }), { status: 200 });
  };
  // Every w* does weather only; g1 does the journal. q2 scores lower than q1, so the first search for i1 is the weak "notes app".
  const script = (k: string, q: { type: string; criteria: any; instructions: any }, state?: any) => {
    if (q.type === "choice") return Object.fromEntries(Object.entries(q.criteria).map(([label, c]: [string, any]) => [label, c.name === "w3" ? 0.7 : 0.3 / (Object.keys(q.criteria).length - 1)]));
    if (k === "q0_faithful" || k === "q1_faithful") return 0.9;
    if (k === "q2_faithful") return 0.6;
    if (k.endsWith("_drift")) return 0.1;
    return undefined;
  };
  function stub() {
    const calls: any[] = [];
    const fetch = async (_u: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init!.body));
      calls.push(body);
      const nameOf = (qi: any) => (qi.candidate_id ? body.state.candidates[qi.candidate_id].name : undefined);
      const answers = Object.fromEntries(Object.entries(body.questions as Record<string, any>).map(([k, q]) => {
        const v = script(k, q);
        if (q.type === "choice") return [k, { type: "choice", choice: "c0", confidence: 1, probabilities: v }];
        if (v !== undefined) return [k, { type: "noul", noul: v }];
        const name = nameOf(q.instructions) ?? "";
        const need = /_i(\d+)$/.exec(k)?.[1];
        const fit = need === "0" ? (name.startsWith("w") ? 0.9 : 0.05) : need === "1" ? (name === "g1" ? 0.9 : 0.05) : 0.8;
        return [k, { type: "noul", noul: fit }];
      }));
      return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 1 } }), { status: 200 });
    };
    return { fetch, calls };
  }

  it("by need: each need gets its own picks, Jev's per-need pick leads, and an unmatched need says so", async () => {
    const s = stub();
    const jev = new JevScorer({ apiKey: "k", fetch: s.fetch as never });
    const cfg = { ...LED_CONFIG, layout: "by-need" as const, queryBudget: 2, minPerItem: 1, maxPerItem: 1, screen: 0 };
    const r = await discoverLed({ text: "t", claude: { interpret: async () => interp }, jev, fetch: market, cfg });
    const g0 = r.groups.find((g) => g.need === "i0")!;
    expect(g0.picks[0]!.listing.slug).toBe("w3"); // Jev's per-need pick-the-best
    expect(r.groups.find((g) => g.need === "i1")!.status).toBe("none"); // "notes app" found only weather tools
    expect(r.gaps).toEqual(["i1"]);
    expect(jev.usage.map((u) => u.step)).toContain("per-need");
  });

  it("second search: a need nothing matched gets its unused search, and the new result fills it", async () => {
    const s = stub();
    const jev = new JevScorer({ apiKey: "k", fetch: s.fetch as never });
    const cfg = { ...LED_CONFIG, layout: "by-need" as const, queryBudget: 2, minPerItem: 1, maxPerItem: 1, screen: 0, gapQueries: 1 };
    const r = await discoverLed({ text: "t", claude: { interpret: async () => interp }, jev, fetch: market, cfg });
    expect(r.gap_searched).toEqual(["garden journal"]);
    expect(r.groups.find((g) => g.need === "i1")!.picks.map((p) => p.listing.slug)).toEqual(["g1"]);
    expect(r.gaps).toEqual([]);
  });

  it("hybrid: the overall winner first, then turns across needs", async () => {
    const s = stub();
    const jev = new JevScorer({ apiKey: "k", fetch: s.fetch as never });
    const cfg = { ...LED_CONFIG, layout: "hybrid" as const, queryBudget: 3, minPerItem: 1, maxPerItem: 2, screen: 0 };
    const r = await discoverLed({ text: "t", claude: { interpret: async () => interp }, jev, fetch: market, cfg });
    expect(r.ranked[0]!.listing.slug).toBe("w3");
    expect(r.ranked.slice(0, 3).map((x) => x.listing.slug)).toContain("g1"); // the journal need gets a turn early
    expect(new Set(r.ranked.map((x) => x.listing.slug)).size).toBe(r.ranked.length);
  });
});
