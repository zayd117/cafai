// Bake-off metrics, cache, runner and the Claude rater (stub client: no network, no live model).
import { describe, expect, it } from "vitest";
import { agreement, cachedFetch, falsePositiveRate, jaccard, percentile, precisionAt, recallAt, runArm, summarize, type Arm, type ArmRun, type DiscoverCase } from "./bakeoff";
import { ClaudeScorer, recordedClaude } from "./claudeScorer";
import type { FetchLike } from "./search";
import type { Interpretation, Listing, Usage } from "./types";

const listing = (slug: string): Listing => ({ slug, name: slug, title: null, description: `${slug} description`, grade: "B", grade_score: 70, certified: false, category: null, price_micros: 0, url: `https://mcp.market/server/${slug}` });
const run = (over: Partial<ArmRun>): ArmRun => ({ case_id: "c", arm: "a", repeat: 0, ms: 100, usage: [], ranked: [], kept: [], dropped: [], ...over });

describe("metrics", () => {
  it("precision, recall, false positives and overlap", () => {
    const ranked = ["a", "b", "c", "d", "e"];
    expect(precisionAt(3, ranked, ["a", "c", "z"])).toBeCloseTo(2 / 3);
    expect(recallAt(5, ranked, ["a", "e", "z", "y"])).toBe(0.5);
    expect(falsePositiveRate(5, ranked, ["b", "q"])).toBe(0.2);
    expect(jaccard(["a", "b"], ["b", "c"])).toBeCloseTo(1 / 3);
    expect(jaccard([], [])).toBe(1);
    expect(percentile([10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([10, 20, 30, 40], 95)).toBe(40);
    expect(percentile([], 50)).toBeNull();
  });

  it("summarizes only what is labelled, treats unlabelled as no data, and never shows unknown prices as free", () => {
    const cases: DiscoverCase[] = [
      { id: "c", text: "t", relevant: ["a", "b"], irrelevant: ["x"], bad_queries: ["off topic"], good_queries: ["on topic", "also good"] },
      { id: "u", text: "t" },
    ];
    const usage: Usage[] = [{ model: "claude-sonnet-5-5", input_tokens: 1000, output_tokens: 200 }];
    const runs = [
      run({ case_id: "c", ranked: ["a", "x", "q", "b", "z"], dropped: ["Off Topic"], kept: ["on topic"], usage, ms: 200 }),
      run({ case_id: "c", repeat: 1, ranked: ["a", "b", "q", "z", "w"], dropped: [], kept: ["on topic", "also good"], usage, ms: 400 }),
      run({ case_id: "u", ranked: ["k"], usage }),
      run({ case_id: "c", repeat: 2, error: "boom" }),
    ];
    const s = summarize("a", runs, cases);
    expect(s.errors).toBe(1);
    expect(s.precision_at_3).toBeCloseTo((1 / 3 + 2 / 3) / 2);
    expect(s.recall_at_5).toBeCloseTo((1 + 1) / 2);
    expect(s.false_positive_rate).toBeCloseTo((0.2 + 0) / 2);
    expect(s.bad_query_drop_rate).toBeCloseTo(0.5);
    expect(s.good_query_keep_rate).toBeCloseTo((0.5 + 1) / 2);
    expect(s.labelled).toEqual({ ranking: 1, false_positives: 1, queries: 1 });
    expect(s.cost_per_run_usd).toBeCloseTo((1000 * 2 + 200 * 10) / 1e6);
    expect(s.latency_p50_ms).toBe(200); // ok runs only: 100, 200, 400
    expect(summarize("a", [run({ usage: [{ model: "unknown-model", input_tokens: 1, output_tokens: 1 }] })], cases).cost_per_run_usd).toBeNull();
    expect(summarize("a", [run({ case_id: "u" })], cases).precision_at_3).toBeNull();
  });

  it("consistency is the mean top-5 Jaccard between repeats; agreement pairs runs by case and repeat", () => {
    const a = [run({ ranked: ["a", "b"] }), run({ repeat: 1, ranked: ["a", "b"] })];
    expect(summarize("a", a, [{ id: "c", text: "t" }]).consistency).toBe(1);
    const b = [run({ arm: "b", ranked: ["a", "c"] }), run({ arm: "b", repeat: 1, ranked: ["a", "b"] })];
    expect(agreement(a, b)).toBeCloseTo((1 / 3 + 1) / 2);
  });
});

describe("cachedFetch", () => {
  it("hits the network once per url, returns a fresh body each time, and does not cache failures", async () => {
    let n = 0;
    const inner: FetchLike = async (url) => { n++; return url.includes("bad") ? new Response("no", { status: 500 }) : new Response(JSON.stringify({ results: [] }), { status: 200 }); };
    const f = cachedFetch(inner, new Map());
    expect(await (await f("https://x/ok")).json()).toEqual({ results: [] });
    expect(await (await f("https://x/ok")).json()).toEqual({ results: [] });
    expect(n).toBe(1);
    expect((await f("https://x/bad")).status).toBe(500);
    await f("https://x/bad");
    expect(n).toBe(3);
  });
});

describe("runArm", () => {
  const interpretation: Interpretation = {
    items: [{ id: "i0", text: "Look up food facts" }],
    queries: [{ id: "q0", item_id: "i0", text: "food db" }, { id: "q1", item_id: "i0", text: "stock prices" }],
  };
  const usage: Usage[] = [];
  const scorer = {
    scoreQueries: async (_i: unknown, qs: { id: string }[]) => {
      usage.push({ model: "MOCK", input_tokens: 10, output_tokens: 1 });
      return qs.map((q) => ({ query_id: q.id, faithful: q.id === "q0" ? 0.9 : 0.1, drift: q.id === "q0" ? 0.1 : 0.9, score: q.id === "q0" ? 0.81 : 0.01 }));
    },
    scoreListings: async (_i: unknown, ls: Listing[]) => {
      usage.push({ model: "MOCK", input_tokens: 20, output_tokens: 2 });
      return ls.map((l) => ({ slug: l.slug, per_item: { i0: l.slug === "s1" ? 0.9 : 0.2 }, useful: l.slug === "s1" ? 0.9 : 0.2 }));
    },
  };
  const arm: Arm = { name: "fake", scorer, usage: () => usage };
  const fetch: FetchLike = async (url) => {
    expect(url).toContain("food%20db"); // the dropped query is never searched
    return new Response(JSON.stringify({ results: [{ slug: "s1", description: "d" }, { slug: "s2", description: "d" }] }), { status: 200 });
  };

  it("records ranking, kept and dropped queries, and only this run's usage", async () => {
    usage.push({ model: "MOCK", input_tokens: 999, output_tokens: 999 }); // earlier run, must not be counted
    const r = await runArm({ arm, c: { id: "c", text: "t" }, interpretation, repeat: 2, fetch });
    expect(r.error).toBeUndefined();
    expect(r.ranked[0]).toBe("s1");
    expect(r.kept).toEqual(["food db"]);
    expect(r.dropped).toEqual(["stock prices"]);
    expect(r.repeat).toBe(2);
    expect(r.usage.map((u) => u.input_tokens)).toEqual([10, 20]);
    expect(r.ms).toBeGreaterThanOrEqual(0);
  });

  it("reports a scorer failure as an error run instead of throwing", async () => {
    const broken: Arm = { name: "broken", scorer: { scoreQueries: async () => { throw new Error("rater down"); }, scoreListings: async () => [] }, usage: () => [] };
    const r = await runArm({ arm: broken, c: { id: "c", text: "t" }, interpretation, repeat: 0, fetch });
    expect(r.error).toBe("rater down");
    expect(r.ranked).toEqual([]);
  });
});

describe("ClaudeScorer (stub client)", () => {
  const items = [{ id: "i0", text: "Look up food facts" }, { id: "i1", text: "Save meals" }];
  const stub = (reply: (system: string, user: string) => unknown) => {
    const calls: { system: string; user: string }[] = [];
    return {
      calls,
      id: "anthropic:stub",
      usage: [] as Usage[],
      call: async (system: string, user: string) => { calls.push({ system, user }); return reply(system, user); },
    };
  };

  it("sends items and queries as fenced data and multiplies faithful by (1 - drift)", async () => {
    const c = stub(() => ({ scores: [{ query_id: "a", faithful: 0.9, drift: 0.1 }, { query_id: "b", faithful: 2, drift: -1 }] }));
    const out = await new ClaudeScorer(c).scoreQueries(items, [{ id: "a", item_id: "i0", text: "food db" }, { id: "b", item_id: "i0", text: "stock prices" }, { id: "c", item_id: "i1", text: "missing" }]);
    expect(c.calls).toHaveLength(1);
    expect(c.calls[0]!.user).toContain('<data name="items">');
    expect(c.calls[0]!.user).toContain('<data name="queries">');
    expect(out.map((o) => +o.score.toFixed(2))).toEqual([0.81, 1, 0]); // clamped 2 -> 1 and -1 -> 0; missing answer -> faithful 0, drift 1
  });

  it("batches five listings per request, maps answers by slug, and defaults missing numbers to no signal", async () => {
    const c = stub((_s, user) => ({
      scores: [...user.matchAll(/"slug": "(s\d)"/g)].map((m) => ({ slug: m[1], per_item: [{ item_id: "i0", p: m[1] === "s1" ? 0.9 : 0.1 }], useful: m[1] === "s0" ? 0.7 : 0.2 })),
    }));
    const many = Array.from({ length: 7 }, (_, i) => listing(`s${i}`));
    const out = await new ClaudeScorer(c).scoreListings(items, many);
    expect(c.calls).toHaveLength(2); // 5 + 2
    expect(out.map((o) => o.slug)).toEqual(many.map((m) => m.slug));
    expect(out[1]!.per_item.i0).toBe(0.9);
    expect(out[1]!.per_item.i1).toBe(0); // not answered
    expect(out[0]!.useful).toBe(0.7);
  });

  it("exposes the scoring client's usage as its own", () => {
    const c = stub(() => ({}));
    c.usage.push({ model: "m", input_tokens: 1, output_tokens: 1 });
    expect(new ClaudeScorer(c).usage).toHaveLength(1);
  });
});

describe("recorded ratings (subagent arm)", () => {
  const items = [{ id: "i0", text: "Look up food facts" }];
  const rec = {
    queries: [{ query_id: "q0", faithful: 0.9, drift: 0.1 }],
    listings: [{ slug: "s0", per_item: [{ item_id: "i0", p: 0.8 }], useful: 0.7 }],
  };

  it("replays ratings through the same scorer, with no usage recorded", async () => {
    const scorer = new ClaudeScorer(recordedClaude(rec, "claude-agent"));
    expect((await scorer.scoreQueries(items, [{ id: "q0", item_id: "i0", text: "food db" }]))[0]!.score).toBeCloseTo(0.81);
    expect((await scorer.scoreListings(items, [listing("s0")]))[0]).toEqual({ slug: "s0", per_item: { i0: 0.8 }, useful: 0.7 });
    expect(scorer.usage).toEqual([]);
  });

  it("throws on a query or listing that was never rated instead of scoring it zero", async () => {
    const scorer = new ClaudeScorer(recordedClaude(rec, "claude-agent"));
    await expect(scorer.scoreQueries(items, [{ id: "q9", item_id: "i0", text: "x y" }])).rejects.toThrow(/no recorded rating for query: q9/);
    await expect(scorer.scoreListings(items, [listing("nope")])).rejects.toThrow(/no recorded rating for listing: nope/);
  });

  it("an unmetered arm shows time, tokens and cost as unknown, not zero, and a per-case scorer factory is used", async () => {
    const interpretation: Interpretation = { items, queries: [{ id: "q0", item_id: "i0", text: "food db" }] };
    const fetch: FetchLike = async () => new Response(JSON.stringify({ results: [{ slug: "s0", description: "d" }] }), { status: 200 });
    const arm: Arm = { name: "agent", measured: false, usage: () => [], scorer: () => new ClaudeScorer(recordedClaude(rec, "claude-agent")) };
    const r = await runArm({ arm, c: { id: "c", text: "t" }, interpretation, repeat: 0, fetch });
    expect(r.error).toBeUndefined();
    expect(r.ranked).toEqual(["s0"]);
    const s = summarize("agent", [r], [{ id: "c", text: "t" }]);
    expect([s.latency_p50_ms, s.latency_p95_ms, s.input_tokens_per_run, s.output_tokens_per_run, s.cost_per_run_usd]).toEqual([null, null, null, null, null]);
    const missing = await runArm({ arm: { ...arm, scorer: () => { throw new Error("no saved ratings for case c"); } }, c: { id: "c", text: "t" }, interpretation, repeat: 0, fetch });
    expect(missing.error).toMatch(/no saved ratings/);
  });
});
