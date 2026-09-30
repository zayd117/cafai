import { describe, expect, it } from "vitest";
import { armReport, calibrationError, consistency, evaluateCheck, falsePositiveRate, type ArmReport } from "./bakeoff";
import type { CaseResult, EvalCase } from "./types";

const c: EvalCase = {
  id: "c1", fixture: true, input_type: "C", text: "t", declared_clients: [],
  labels: { must_recommend: ["a"], acceptable_offerings: [], must_not_recommend: ["o-bad"], potentially_missed: [], probably_not_needed: [] },
};
const pick = (offering_id: string, capability_id: string, confidence_score: number) =>
  ({ offering_id, capability_id, lane: "direct", match_band: "good", confidence_band: "medium", confidence_score, need_type: "implied", evidence_ok: true });
const result = (picks: ReturnType<typeof pick>[], cost = 0.02): CaseResult => ({
  case_id: "c1", input_type: "C", outcome: "picks", picked_capabilities: picks.map((p) => p.capability_id), picked_offerings: picks.map((p) => p.offering_id),
  picks, not_needed_capabilities: [], concepts_total: 0, concepts_mapped: 0, input_tokens: 0, output_tokens: 0, cost_usd: cost, latency_ms: 1, degraded: null, invalid_ids: [],
});

describe("bake-off measures", () => {
  it("false-positive rate counts picks the labels do not support", () => {
    expect(falsePositiveRate([c], [result([pick("o-a", "a", 0.9), pick("o-x", "x", 0.9)])])).toBe(0.5);
    expect(falsePositiveRate([c], [result([])])).toBeNull();
  });

  it("calibration error is zero when scores match outcomes and large when they do not", () => {
    const good = calibrationError([c], [result([pick("o-a", "a", 0.99), pick("o-x", "x", 0.01)])]);
    const bad = calibrationError([c], [result([pick("o-a", "a", 0.01), pick("o-x", "x", 0.99)])]);
    expect(good).toBeCloseTo(0.01, 2);
    expect(bad).toBeCloseTo(0.99, 2);
  });

  it("consistency is the mean pairwise overlap of picks across repeats", () => {
    const r1 = [result([pick("o-a", "a", 0.9), pick("o-b", "b", 0.9)])];
    const r2 = [result([pick("o-a", "a", 0.9)])];
    expect(consistency([r1, r1])).toBe(1);
    expect(consistency([r1, r2])).toBe(0.5);
    expect(consistency([r1])).toBeNull();
  });
});

describe("pass lines", () => {
  const rep = (over: Partial<ArmReport>, runs: CaseResult[][]) => ({ ...armReport("x", [c], runs), ...over });
  const base = [[result([pick("o-a", "a", 0.9)])], [result([pick("o-a", "a", 0.9)])]];

  it("Jev wins only on enough measures, with no rise in harmful picks and cost inside the cap", () => {
    const llm = rep({ false_positive_rate: 0.4, calibration_error: 0.3, consistency: 0.6, harmful_picks: 0, cost_per_run_usd: 0.03 }, base);
    const jevGood = rep({ false_positive_rate: 0.25, calibration_error: 0.15, consistency: 0.62, harmful_picks: 0, cost_per_run_usd: 0.031 }, base);
    const jevHarm = { ...jevGood, harmful_picks: 1 };
    const jevDear = { ...jevGood, cost_per_run_usd: 0.09 };
    const jevOne = { ...jevGood, calibration_error: 0.29 };
    const check = { id: "J", type: "jev_win" as const, candidate: "llm+jev", reference: "llm", margin: 0.1, min_wins: 2, max_cost_per_run_usd: 0.05 };
    expect(evaluateCheck(check, { llm, "llm+jev": jevGood }).verdict).toBe("PASS");
    expect(evaluateCheck(check, { llm, "llm+jev": jevHarm }).verdict).toBe("FAIL");
    expect(evaluateCheck(check, { llm, "llm+jev": jevDear }).verdict).toBe("FAIL");
    expect(evaluateCheck(check, { llm, "llm+jev": jevOne }).verdict).toBe("FAIL");
    expect(evaluateCheck(check, { llm }).verdict).toBe("NOT RUN");
    expect(evaluateCheck(check, { llm, "llm+jev": { ...jevGood, consistency: null } }).verdict).toBe("INSUFFICIENT DATA");
  });

  it("relative reduction respects its guard", () => {
    const off = rep({ false_positive_rate: 0.5, capability_recall_at_5: 0.9 }, base);
    const on = rep({ false_positive_rate: 0.35, capability_recall_at_5: 0.88 }, base);
    const onLosesRecall = { ...on, capability_recall_at_5: 0.8 };
    const check = { id: "H4", type: "relative_reduction" as const, candidate: "llm", reference: "off", metric: "false_positive_rate" as const, margin: 0.2, guard: { metric: "capability_recall_at_5" as const, max_drop: 0.05 } };
    expect(evaluateCheck(check, { llm: on, off }).verdict).toBe("PASS");
    expect(evaluateCheck(check, { llm: onLosesRecall, off }).verdict).toBe("FAIL");
  });
});
