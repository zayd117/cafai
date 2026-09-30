// Phase 0 bake-off (plan §25): arms on the same labeled cases, repeated runs, and pass lines written down before
// the run (eval/bakeoff.json). Adds the three measures the Jev decision is judged on: false positives, confidence
// calibration and consistency across repeat runs. GPT/ChatGPT is the A0 baseline only (blind pairs), never an arm.
import type { Ablations } from "@/engine/pipeline";
import { summarize, type Report } from "./metrics";
import type { CaseResult, EvalCase } from "./types";

export interface ArmSpec {
  name: string;
  label: string;
  ablations: Ablations;
  /** Who makes the structured decisions (stage 8): the LLM, or Jev behind the Decision interface (§9, §17). */
  decision: "llm" | "jev";
}

export const ARMS: Record<string, ArmSpec> = {
  llm: { name: "llm", label: "A1 LLM only", ablations: {}, decision: "llm" },
  "llm+jev": { name: "llm+jev", label: "A2 LLM + Jev decisions", ablations: {}, decision: "jev" },
  no_expansion: { name: "no_expansion", label: "Ablation: no expansion (H2)", ablations: { noExpansion: true }, decision: "llm" },
  forward_only: { name: "forward_only", label: "Ablation: forward-only match (H3)", ablations: { forwardOnly: true }, decision: "llm" },
  evidence_gates_off: { name: "evidence_gates_off", label: "Ablation: evidence gates off (H4)", ablations: { noEvidenceGates: true }, decision: "llm" },
};
export const DEFAULT_ARMS = ["llm", "no_expansion", "forward_only", "evidence_gates_off"];

const useful = (c: EvalCase, p: { offering_id: string; capability_id: string }) =>
  c.labels.must_recommend.includes(p.capability_id) || c.labels.acceptable_offerings.includes(p.offering_id) || c.labels.potentially_missed.includes(p.capability_id);

/** Share of shown picks that are not useful by the labels (lower is better). */
export function falsePositiveRate(cases: EvalCase[], results: CaseResult[]): number | null {
  let picks = 0, fp = 0;
  for (const r of results) {
    const c = cases.find((x) => x.id === r.case_id)!;
    for (const p of r.picks) {
      picks++;
      if (!useful(c, p)) fp++;
    }
  }
  return picks ? fp / picks : null;
}

/**
 * Expected calibration error of the Confidence score against usefulness (lower is better): picks are grouped into
 * `bins` equal-width score bins; the error is the pick-weighted gap between mean score and useful rate per bin.
 */
export function calibrationError(cases: EvalCase[], results: CaseResult[], bins = 5): number | null {
  const pts = results.flatMap((r) => {
    const c = cases.find((x) => x.id === r.case_id)!;
    return r.picks.map((p) => ({ s: p.confidence_score, y: useful(c, p) ? 1 : 0 }));
  });
  if (!pts.length) return null;
  let err = 0;
  for (let b = 0; b < bins; b++) {
    const inBin = pts.filter((x) => Math.min(bins - 1, Math.floor(x.s * bins)) === b);
    if (!inBin.length) continue;
    const meanS = inBin.reduce((a, x) => a + x.s, 0) / inBin.length;
    const rate = inBin.reduce((a, x) => a + x.y, 0) / inBin.length;
    err += (inBin.length / pts.length) * Math.abs(meanS - rate);
  }
  return err;
}

/** Mean pairwise Jaccard similarity of each case's picked offerings across repeat runs (higher is better). */
export function consistency(repeats: CaseResult[][]): number | null {
  if (repeats.length < 2) return null;
  const caseIds = repeats[0]!.map((r) => r.case_id);
  const perCase: number[] = [];
  for (const id of caseIds) {
    const sets = repeats.map((rep) => new Set(rep.find((r) => r.case_id === id)?.picked_offerings ?? []));
    let sum = 0, n = 0;
    for (let i = 0; i < sets.length; i++) {
      for (let j = i + 1; j < sets.length; j++) {
        const a = sets[i]!, b = sets[j]!;
        const union = new Set([...a, ...b]).size;
        sum += union === 0 ? 1 : [...a].filter((x) => b.has(x)).length / union;
        n++;
      }
    }
    perCase.push(sum / n);
  }
  return perCase.reduce((a, b) => a + b, 0) / perCase.length;
}

export interface ArmReport extends Report {
  arm: string;
  repeats: number;
  false_positive_rate: number | null;
  calibration_error: number | null;
  consistency: number | null;
}

export function armReport(arm: string, cases: EvalCase[], repeats: CaseResult[][]): ArmReport {
  const all = repeats.flat();
  return {
    ...summarize(cases, all),
    cases: cases.length,
    arm,
    repeats: repeats.length,
    false_positive_rate: falsePositiveRate(cases, all),
    calibration_error: calibrationError(cases, all),
    consistency: consistency(repeats),
  };
}

// ---- Pass lines (written before the run; plan §25 "each hypothesis gets a pass line written down before its run") ----

export type Check =
  | { id: string; type: "higher"; candidate: string; reference: string; metric: keyof ArmReport; margin: number }
  | {
      id: string;
      type: "relative_reduction";
      candidate: string;
      reference: string;
      metric: keyof ArmReport;
      margin: number; // e.g. 0.2 = cut by a fifth
      guard?: { metric: keyof ArmReport; max_drop: number };
    }
  | {
      id: string;
      type: "jev_win";
      candidate: string;
      reference: string;
      margin: number; // absolute points on each measure
      min_wins: number;
      max_cost_per_run_usd: number;
    };

export interface CheckResult {
  id: string;
  verdict: "PASS" | "FAIL" | "NOT RUN" | "INSUFFICIENT DATA";
  detail: string;
}

const num = (r: ArmReport, k: keyof ArmReport) => (typeof r[k] === "number" ? (r[k] as number) : null);
const f = (x: number) => x.toFixed(3);

export function evaluateCheck(check: Check, reports: Record<string, ArmReport>): CheckResult {
  const cand = reports[check.candidate], ref = reports[check.reference];
  if (!cand || !ref) return { id: check.id, verdict: "NOT RUN", detail: `needs arms ${check.candidate} and ${check.reference}` };

  if (check.type === "higher") {
    const a = num(cand, check.metric), b = num(ref, check.metric);
    if (a === null || b === null) return { id: check.id, verdict: "INSUFFICIENT DATA", detail: `${String(check.metric)} missing` };
    const ok = a - b >= check.margin;
    return { id: check.id, verdict: ok ? "PASS" : "FAIL", detail: `${String(check.metric)} ${f(b)} → ${f(a)} (needs +${check.margin})` };
  }

  if (check.type === "relative_reduction") {
    const a = num(cand, check.metric), b = num(ref, check.metric);
    if (a === null || b === null) return { id: check.id, verdict: "INSUFFICIENT DATA", detail: `${String(check.metric)} missing` };
    const cut = b === 0 ? 0 : (b - a) / b;
    let ok = b > 0 && cut >= check.margin;
    let detail = `${String(check.metric)} ${f(b)} → ${f(a)} (cut ${(cut * 100).toFixed(0)}%, needs ${(check.margin * 100).toFixed(0)}%)`;
    if (check.guard) {
      const ga = num(cand, check.guard.metric), gb = num(ref, check.guard.metric);
      if (ga === null || gb === null) return { id: check.id, verdict: "INSUFFICIENT DATA", detail: `${String(check.guard.metric)} missing` };
      const drop = gb - ga;
      if (drop > check.guard.max_drop) ok = false;
      detail += `; ${String(check.guard.metric)} drop ${f(drop)} (max ${check.guard.max_drop})`;
    }
    if (b === 0) detail += "; reference has no false positives to cut";
    return { id: check.id, verdict: ok ? "PASS" : "FAIL", detail };
  }

  // Jev win rule (§25): beat LLM-only by the margin on at least `min_wins` of false positives, calibration and
  // consistency, with no rise in harmful picks and cost inside the cap.
  const measures: [string, number | null, number | null, boolean][] = [
    ["false_positive_rate", num(ref, "false_positive_rate"), num(cand, "false_positive_rate"), false],
    ["calibration_error", num(ref, "calibration_error"), num(cand, "calibration_error"), false],
    ["consistency", num(ref, "consistency"), num(cand, "consistency"), true],
  ];
  if (measures.some(([, r, c]) => r === null || c === null)) {
    return { id: check.id, verdict: "INSUFFICIENT DATA", detail: "needs picks in both arms and --repeats 2 or more" };
  }
  const wins = measures.filter(([, r, c, higher]) => (higher ? c! - r! : r! - c!) >= check.margin).map(([m]) => m);
  const harmfulOk = cand.harmful_picks <= ref.harmful_picks;
  const cost = cand.cost_per_run_usd;
  const costOk = cost !== null && cost <= check.max_cost_per_run_usd;
  const ok = wins.length >= check.min_wins && harmfulOk && costOk;
  return {
    id: check.id,
    verdict: ok ? "PASS" : "FAIL",
    detail: `wins on [${wins.join(", ") || "none"}] (needs ${check.min_wins}); harmful ${ref.harmful_picks} → ${cand.harmful_picks}; cost/run ${cost === null ? "unknown" : "$" + cost.toFixed(4)} (cap $${check.max_cost_per_run_usd})`,
  };
}
