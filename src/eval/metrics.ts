// Offline metrics (plan §9 Evaluation). Harmful picks and invalid IDs must both be zero.
import type { CaseResult, EvalCase } from "./types";

import { PRICES } from "@/config/pricing";

export { PRICES };

export function costUsd(usage: { model: string; input_tokens: number; output_tokens: number }[]): number {
  return usage.reduce((sum, u) => {
    const p = PRICES[u.model];
    return sum + (p ? (u.input_tokens * p.input + u.output_tokens * p.output) / 1e6 : NaN);
  }, 0);
}

const ratio = (num: number, den: number) => (den === 0 ? null : num / den);
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
export const percentile = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
};

export interface Report {
  cases: number;
  capability_recall_at_5: number | null;
  precision_at_3: number | null;
  novelty_rate: number | null; // share of useful picks that address a potentially missed need
  evidence_faithfulness: number | null; // share of picks whose cited evidence resolves to the read-back
  expansion_coverage: number | null; // share of expansion concepts mapped to a taxonomy capability
  probably_not_needed_accuracy: number | null;
  outcome_accuracy: number | null;
  useful_rate_by_match_band: Record<string, number | null>;
  useful_rate_by_confidence_band: Record<string, number | null>;
  harmful_picks: number;
  invalid_ids: number;
  cost_per_run_usd: number | null;
  latency_p95_ms: number | null;
  degraded_runs: number;
  by_input_type: Record<string, { cases: number; recall_at_5: number | null; precision_at_3: number | null }>;
}

export const isUseful = (c: EvalCase, p: { offering_id: string; capability_id: string }) =>
  c.labels.must_recommend.includes(p.capability_id) || c.labels.acceptable_offerings.includes(p.offering_id) || c.labels.potentially_missed.includes(p.capability_id);

export function perCase(c: EvalCase, r: CaseResult) {
  const top5 = r.picks.slice(0, 5);
  const top3 = r.picks.slice(0, 3);
  const recall = ratio(c.labels.must_recommend.filter((cap) => top5.some((p) => p.capability_id === cap)).length, c.labels.must_recommend.length);
  const precision = ratio(top3.filter((p) => isUseful(c, p)).length, top3.length);
  const harmful = r.picks.filter((p) => c.labels.must_not_recommend.includes(p.offering_id) || c.labels.must_not_recommend.includes(p.capability_id)).length;
  const useful = r.picks.filter((p) => isUseful(c, p));
  const novel = useful.filter((p) => c.labels.potentially_missed.includes(p.capability_id)).length;
  const pnn = ratio(
    c.labels.probably_not_needed.filter((cap) => !r.picked_capabilities.includes(cap)).length,
    c.labels.probably_not_needed.length,
  );
  const outcomeOk = c.labels.expected_outcome ? (c.labels.expected_outcome === r.outcome ? 1 : 0) : null;
  return { recall, precision, harmful, useful: useful.length, novel, pnn, outcomeOk };
}

export function summarize(cases: EvalCase[], results: CaseResult[]): Report {
  const rows = results.map((r) => ({ r, c: cases.find((c) => c.id === r.case_id)!, m: perCase(cases.find((c) => c.id === r.case_id)!, r) }));
  const allPicks = rows.flatMap(({ r, c }) => r.picks.map((p) => ({ p, useful: isUseful(c, p) })));
  const bandRate = (key: "match_band" | "confidence_band", bands: string[]) =>
    Object.fromEntries(bands.map((b) => {
      const inBand = allPicks.filter((x) => x.p[key] === b);
      return [b, ratio(inBand.filter((x) => x.useful).length, inBand.length)];
    }));
  const types = [...new Set(cases.map((c) => c.input_type))].sort();
  const usefulTotal = rows.reduce((a, x) => a + x.m.useful, 0);
  return {
    cases: results.length,
    capability_recall_at_5: avg(rows.map((x) => x.m.recall)),
    precision_at_3: avg(rows.map((x) => x.m.precision)),
    novelty_rate: ratio(rows.reduce((a, x) => a + x.m.novel, 0), usefulTotal),
    evidence_faithfulness: ratio(allPicks.filter((x) => x.p.evidence_ok).length, allPicks.length),
    expansion_coverage: ratio(results.reduce((a, r) => a + r.concepts_mapped, 0), results.reduce((a, r) => a + r.concepts_total, 0)),
    probably_not_needed_accuracy: avg(rows.map((x) => x.m.pnn)),
    outcome_accuracy: avg(rows.map((x) => x.m.outcomeOk)),
    useful_rate_by_match_band: bandRate("match_band", ["strong", "good", "possible"]),
    useful_rate_by_confidence_band: bandRate("confidence_band", ["high", "medium", "low"]),
    harmful_picks: rows.reduce((a, x) => a + x.m.harmful, 0),
    invalid_ids: results.reduce((a, r) => a + r.invalid_ids.length, 0),
    cost_per_run_usd: avg(results.map((r) => r.cost_usd)),
    latency_p95_ms: percentile(results.map((r) => r.latency_ms), 95),
    degraded_runs: results.filter((r) => r.degraded).length,
    by_input_type: Object.fromEntries(types.map((t) => {
      const sub = rows.filter((x) => x.c.input_type === t);
      return [t, { cases: sub.length, recall_at_5: avg(sub.map((x) => x.m.recall)), precision_at_3: avg(sub.map((x) => x.m.precision)) }];
    })),
  };
}

/** Release gate (§9): harmful picks and invalid ids must be zero; no tracked metric may drop versus the baseline. */
export function gate(current: Report, baseline: Report | null, tolerance = 0): string[] {
  const failures: string[] = [];
  if (current.harmful_picks > 0) failures.push(`harmful_picks ${current.harmful_picks} (must be 0)`);
  if (current.invalid_ids > 0) failures.push(`invalid_ids ${current.invalid_ids} (must be 0)`);
  if (!baseline) return failures;
  const higherIsBetter: (keyof Report)[] = [
    "capability_recall_at_5", "precision_at_3", "evidence_faithfulness", "probably_not_needed_accuracy", "outcome_accuracy",
  ];
  for (const k of higherIsBetter) {
    const cur = current[k] as number | null, base = baseline[k] as number | null;
    if (cur !== null && base !== null && cur < base - tolerance) failures.push(`${k} regressed: ${base.toFixed(3)} → ${cur.toFixed(3)}`);
  }
  return failures;
}
