// The baton pass (plan §9): 14 stages; this runs 1-12. Stage 13 (setup handoff) renders from the catalog in the UI;
// stage 14 (feedback) is stored per run. Deterministic code owns candidates, eligibility, scoring and every fact.
import type { CatalogSnapshot } from "@/catalog/types";
import { assemble } from "./assemble";
import { ENGINE_CONFIG } from "./config";
import { explain } from "./explain";
import { ACTIONABLE, discoverAndFilter, evidenceCheck, judge, score, shortlist, type Constraints } from "./match";
import type { DecisionProvider, LlmProvider, Usage } from "./providers/types";
import { looksLikeInjection, redact } from "./redact";
import type { Pick, RunResult } from "./types";
import { understand, type UserItem } from "./understand";

export const PROMPTS_VERSION = "prompts-v0";

export interface Ablations {
  /** H2: drop needs the model inferred (implied/latent); keep what the user stated. */
  noExpansion?: boolean;
  /** H3: forward-only matching. */
  forwardOnly?: boolean;
  /** H4: evidence gates off (evidence check and low-confidence hold-back skipped). */
  noEvidenceGates?: boolean;
}

export interface RunInput {
  text: string;
  declaredClients: string[];
  constraints?: Constraints;
  userItems?: UserItem[]; // read-back edits: ground truth, rerun stages 3-13 (§9)
  /** The user confirmed a low-confidence read-back (§9 failure table). */
  confirmed?: boolean;
  snapshot: CatalogSnapshot;
  llm: LlmProvider;
  decision: DecisionProvider;
  now?: Date;
  ablations?: Ablations;
}

export async function runPipeline(input: RunInput): Promise<RunResult> {
  const { snapshot, llm, decision } = input;
  const now = input.now ?? new Date();
  const ab = input.ablations ?? {};
  const usage: (Usage & { stage: string })[] = [];

  // 1. User context
  const red = redact(input.text, ENGINE_CONFIG.input.maxChars);
  const userItems = (input.userItems ?? []).map((u) => ({ ...u, text: redact(u.text, 400).text }));
  const declaredClients = input.declaredClients.filter((c) => snapshot.clients.some((k) => k.id === c));

  // 2-4. Understanding, concept expansion, potential needs
  const u = await understand({ llm, text: red.text, declaredClients, taxonomy: snapshot.taxonomy, userItems });
  usage.push(...u.usage.map((x) => ({ ...x, stage: "understanding" })));
  const understanding = u.output;
  if (ab.noExpansion) understanding.needs = understanding.needs.filter((n) => n.need_type !== "implied" && n.need_type !== "latent");

  const base: RunResult = {
    outcome: "picks",
    readback: understanding.items,
    clarifying_question: understanding.clarifying_question,
    picks: [],
    not_needed: understanding.needs
      .filter((n) => n.need_type === "not_relevant")
      .map((n) => ({ capability_id: n.capability_id, reason: "not_relevant_yet" as const, ...(n.reason ? { detail: n.reason } : {}) })),
    present: understanding.needs.filter((n) => n.need_type === "present").map((n) => ({ capability_id: n.capability_id, evidence_ids: n.evidence_ids })),
    gaps: { unmatched_terms: understanding.concepts.filter((c) => c.capability_id === null).map((c) => c.term), capabilities_without_offering: [] },
    degraded: u.failed ? "deterministic_only" : null,
    flags: {
      injection_suspected: looksLikeInjection(red.text),
      input_truncated: red.truncated,
      redactions: red.redactions.reduce((a, r) => a + r.count, 0),
    },
    versions: { catalog: snapshot.version, config: ENGINE_CONFIG.version, prompts: PROMPTS_VERSION, llm: llm.id, decision: decision.id },
    usage,
  };

  if (!understanding.in_scope) return { ...base, outcome: "out_of_scope" };
  const actionable = understanding.needs.filter((n) => ACTIONABLE.includes(n.need_type));
  if (understanding.items.length === 0 || (actionable.length === 0 && base.present.length === 0 && understanding.clarifying_question))
    return { ...base, outcome: "needs_clarification" };
  if (understanding.confidence === "low" && !input.confirmed) return { ...base, outcome: "needs_confirmation" };
  if (actionable.length === 0) return { ...base, outcome: base.present.length ? "nothing_needed" : "no_good_pick" };

  // 5-7. Discovery (catalog only), resource profiles, candidate filter
  const f = discoverAndFilter({ snapshot, needs: actionable, declaredClients, constraints: input.constraints ?? {}, now });
  base.gaps.capabilities_without_offering = f.capabilitiesWithoutOffering;

  // 8. Two-way match (one schema-bound call over at most 12)
  const short = shortlist(f.candidates);
  const j = await judge({ decision, text: red.text, items: understanding.items, candidates: short });
  usage.push(...j.usage.map((x) => ({ ...x, stage: "judgment" })));
  if (j.failed) base.degraded = "deterministic_only";

  // 9-10. Score (Match and Confidence, never merged), evidence check
  let scored = short.map((c) =>
    score({ candidate: c, judgment: j.judgments.get(`${c.offering.id}|${c.need.capability_id}`), understanding, declaredClients, ablations: ab }),
  );
  if (!ab.noEvidenceGates) {
    const ev = evidenceCheck(scored, understanding.items);
    scored = ev.kept;
    base.not_needed.push(...ev.dropped);
  } else {
    scored = scored.map((s) => (s.confidence.band === "low" ? { ...s, confidence: { ...s.confidence, band: "medium" as const } } : s));
  }

  // 11. Recommendation
  const a = assemble(scored);
  base.not_needed.push(...a.notNeeded);
  if (a.picks.length === 0) {
    return { ...base, outcome: "no_good_pick" };
  }

  // 12. Explanation (validated; template fallback)
  const ex = await explain({ llm, picks: a.picks, snapshot, items: understanding.items });
  usage.push(...ex.usage.map((x) => ({ ...x, stage: "explanation" })));
  if (ex.degraded && !base.degraded) base.degraded = "template_explanations";
  const picks: Pick[] = a.picks.map((p) => ({ ...p, explanation: ex.explanations.get(p.offering_id)! }));
  return { ...base, picks };
}
