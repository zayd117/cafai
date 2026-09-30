import { describe, expect, it } from "vitest";
import { makePair, scorePairs } from "./blind";
import { costUsd, gate, percentile, summarize } from "./metrics";
import type { CaseResult, EvalCase } from "./types";

const c: EvalCase = {
  id: "c1", fixture: true, input_type: "D", text: "t", declared_clients: [],
  labels: { must_recommend: ["a", "b"], acceptable_offerings: ["o-c"], must_not_recommend: ["o-bad"], potentially_missed: ["m"], probably_not_needed: ["pay"] },
};
const pick = (offering_id: string, capability_id: string, match_band = "good", confidence_band = "high") =>
  ({ offering_id, capability_id, lane: "direct", match_band, confidence_band, confidence_score: confidence_band === "high" ? 0.9 : confidence_band === "medium" ? 0.6 : 0.3, need_type: "implied", evidence_ok: true });
const result = (picks: ReturnType<typeof pick>[]): CaseResult => ({
  case_id: "c1", input_type: "D", outcome: "picks", picked_capabilities: picks.map((p) => p.capability_id), picked_offerings: picks.map((p) => p.offering_id),
  picks, not_needed_capabilities: [], concepts_total: 2, concepts_mapped: 1, input_tokens: 0, output_tokens: 0, cost_usd: 0, latency_ms: 10, degraded: null, invalid_ids: [],
});

describe("eval metrics", () => {
  it("computes recall at 5, precision at 3, novelty and expansion coverage", () => {
    const r = summarize([c], [result([pick("o-a", "a"), pick("o-x", "x"), pick("o-m", "m"), pick("o-b", "b")])]);
    expect(r.capability_recall_at_5).toBe(1);
    expect(r.precision_at_3).toBeCloseTo(2 / 3);
    expect(r.novelty_rate).toBeCloseTo(1 / 3); // one of three useful picks is a potentially missed need
    expect(r.expansion_coverage).toBe(0.5);
    expect(r.probably_not_needed_accuracy).toBe(1);
  });

  it("counts harmful picks and fails the gate on any", () => {
    const r = summarize([c], [result([pick("o-bad", "a")])]);
    expect(r.harmful_picks).toBe(1);
    expect(gate(r, null)).toContain("harmful_picks 1 (must be 0)");
  });

  it("fails the gate when a metric regresses against the baseline", () => {
    const good = summarize([c], [result([pick("o-a", "a"), pick("o-b", "b")])]);
    const worse = summarize([c], [result([pick("o-a", "a")])]);
    expect(gate(good, good)).toEqual([]);
    expect(gate(worse, good).some((f) => f.startsWith("capability_recall_at_5 regressed"))).toBe(true);
  });

  it("prices runs from the plan's verified rates and never under-counts unknown models", () => {
    expect(costUsd([{ model: "claude-sonnet-5-5", input_tokens: 2000, output_tokens: 600 }])).toBeCloseTo(0.01);
    expect(costUsd([{ model: "unknown", input_tokens: 1, output_tokens: 1 }])).toBeNaN();
    expect(percentile([1, 2, 3, 4, 100], 95)).toBe(100);
  });

  it("builds blind pairs with a separate key and scores win rate without counting ties", () => {
    const { pair, key } = makePair("c1", "input", "CAFAI", "ASSISTANT", "seed");
    expect([pair.A, pair.B].sort()).toEqual(["ASSISTANT", "CAFAI"]);
    expect(pair[key.cafai]).toBe("CAFAI");
    const other = key.cafai === "A" ? "B" : "A";
    const s = scorePairs([key], [
      { case_id: "c1", judge: "j1", winner: key.cafai },
      { case_id: "c1", judge: "j2", winner: other },
      { case_id: "c1", judge: "j3", winner: "tie" },
    ]);
    expect(s).toEqual({ wins: 1, losses: 1, ties: 1, win_rate: 0.5 });
  });
});
