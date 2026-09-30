// Runs labeled cases through the pipeline and collects per-case results (plan §9 Evaluation, §25 ablations).
import type { CatalogSnapshot } from "@/catalog/types";
import { runPipeline, type Ablations } from "@/engine/pipeline";
import { ScriptedProvider } from "@/engine/providers/mock";
import type { DecisionProvider, ExplanationRequest, JudgmentRequest, LlmProvider } from "@/engine/providers/types";
import { costUsd } from "./metrics";
import type { CaseResult, EvalCase } from "./types";

/** MOCK provider scripted by a fixture case: canned understanding, uniform judgments, plain explanations. */
export function scriptedFor(c: EvalCase): ScriptedProvider {
  if (!c.mock) throw new Error(`case ${c.id} has no mock script`);
  const mock = c.mock;
  return new ScriptedProvider({
    understand: () => mock.understand,
    judge: (req: JudgmentRequest) =>
      mock.judge && mock.judge !== "all_direct"
        ? mock.judge
        : {
            judgments: req.candidates.map((x) => ({
              offering_id: x.offering_id,
              capability_id: x.capability_id,
              intent_fit: "direct",
              intent_quote: "",
              requirements_met: "yes",
              fired_signal_ids: [],
              evidence_enough: true,
            })),
          },
    explain: (req: ExplanationRequest) =>
      mock.explain && mock.explain !== "template"
        ? mock.explain
        : {
            explanations: req.picks.map((p) => ({
              offering_id: p.offering_id,
              why: "It matches what you described.",
              evidence_ids: p.evidence_ids.slice(0, 1),
              how_it_helps: p.could_help_with,
              do_you_need_it: p.need_type === "latent" ? "Useful later." : "Needed now.",
              skip_if: p.skip_conditions[0] ?? "You already have this.",
              summary: p.what_it_is,
            })),
          },
  });
}

export async function runCase(args: {
  c: EvalCase;
  snapshot: CatalogSnapshot;
  providers?: { llm: LlmProvider; decision: DecisionProvider };
  ablations?: Ablations;
  now?: Date;
}): Promise<CaseResult> {
  const { c, snapshot } = args;
  const p = args.providers ?? (() => { const s = scriptedFor(c); return { llm: s, decision: s }; })();
  const start = performance.now();
  // Eval runs confirm the read-back so low-confidence cases still reach recommendation (their outcome is recorded).
  const r = await runPipeline({
    text: c.text, declaredClients: c.declared_clients, snapshot, llm: p.llm, decision: p.decision,
    confirmed: true, ablations: args.ablations, now: args.now,
  });
  const latency_ms = performance.now() - start;
  const offeringIds = new Set(snapshot.offerings.map((o) => o.id));
  const itemIds = new Set(r.readback.map((i) => i.id));
  return {
    case_id: c.id,
    input_type: c.input_type,
    outcome: r.outcome,
    picked_capabilities: r.picks.map((x) => x.capability_id),
    picked_offerings: r.picks.map((x) => x.offering_id),
    picks: r.picks.map((x) => ({
      offering_id: x.offering_id,
      capability_id: x.capability_id,
      lane: x.lane,
      match_band: x.match.band,
      confidence_band: x.confidence.band,
      confidence_score: x.confidence.score,
      need_type: x.need_type,
      evidence_ok: x.explanation.evidence_ids.length > 0 && x.explanation.evidence_ids.every((e) => itemIds.has(e)),
    })),
    not_needed_capabilities: r.not_needed.map((n) => n.capability_id),
    concepts_total: r.concepts.length,
    concepts_mapped: r.concepts.filter((x) => x.capability_id !== null).length,
    input_tokens: r.usage.reduce((a, u) => a + u.input_tokens, 0),
    output_tokens: r.usage.reduce((a, u) => a + u.output_tokens, 0),
    cost_usd: costUsd(r.usage),
    latency_ms,
    degraded: r.degraded,
    invalid_ids: r.picks.map((x) => x.offering_id).filter((id) => !offeringIds.has(id)),
  };
}
