// Engine data contracts (plan §9 baton pass). Model outputs are untrusted until validated by code.

export type ProfileItemKind =
  | "goal"
  | "task"
  | "problem"
  | "environment"
  | "constraint"
  | "current_tool"
  | "interest" // State A: something the user named (optional signal)
  | "possible_need"; // flagged as such (§9, §12)

/** A read-back item. Evidence is a quoted span of the (redacted) user text; items without valid evidence are dropped. */
export interface ProfileItem {
  id: string; // "u1", "u2", … (evidence IDs cited by explanations)
  kind: ProfileItemKind;
  text: string; // plain words, shown in the read-back (§6)
  quote: string; // must be a substring of the redacted input
  edited?: boolean; // user edit = ground truth (§9)
  /** Short label shown as a tag in the read-back ("Phone app"). Older runs have none: the UI cuts one from text. */
  tag?: string;
  /** Up to three other tags the person can swap this one for, so nobody has to think up the right words. */
  suggestions?: string[];
  /** Came from words the person just added, so the read-back can point it out. */
  is_new?: boolean;
}

export type NeedType = "stated" | "implied" | "latent" | "present" | "not_relevant";

export interface CapabilityNeed {
  capability_id: string;
  need_type: NeedType;
  evidence_ids: string[]; // profile item ids
  source: "rule" | "model" | "rule+model" | "user_edit";
  /** For latent needs: the curated signal that fired ("<capability>#<index>"). */
  signal_id?: string;
  reason?: string; // for not_relevant: short plain reason from the model, validated
}

export interface UnderstandingOutput {
  in_scope: boolean;
  confidence: "high" | "medium" | "low";
  items: ProfileItem[];
  /** Concept expansion (stage 3): internal terms mapped to taxonomy ids or null (gap). Never shown as jargon. */
  concepts: { term: string; capability_id: string | null }[];
  needs: CapabilityNeed[];
  clarifying_question: { text: string; options: string[] } | null;
}

export type MatchBand = "strong" | "good" | "possible" | "weak" | "skip";
export type ConfidenceBand = "high" | "medium" | "low";

export interface Judgment {
  offering_id: string;
  capability_id: string; // the need it serves
  intent_fit: "direct" | "partial" | "none";
  intent_quote: string; // user's words; must be a substring of the input
  /** Backward direction: does the project meet what the offering requires (client, plan, runtime, accounts)? */
  requirements_met: "yes" | "partly" | "no" | "unknown";
  /** Which of the offering's curated signals fire on this project (ids from the request only). */
  fired_signal_ids: string[];
  evidence_enough: boolean;
}

export interface Explanation {
  offering_id: string;
  why: string;
  evidence_ids: string[];
  how_it_helps: string;
  do_you_need_it: string;
  skip_if: string;
  summary: string;
}

export type Lane = "direct" | "also_worth_knowing" | "not_needed";
export type NeedAnswer = "needed_now" | "useful_later" | "probably_not";

export interface ScoredCandidate {
  offering_id: string;
  capability_id: string;
  need_type: NeedType;
  evidence_ids: string[];
  match: { band: MatchBand; score: number; components: Record<string, number> };
  confidence: { band: ConfidenceBand; score: number; inputs: Record<string, number | string | boolean> };
  notes: string[]; // e.g. "checked_trust", "stale_verification", "thin_evidence"
}

export interface Alternative {
  offering_id: string;
  match_band: MatchBand;
  confidence_band: ConfidenceBand;
}

export interface Pick extends ScoredCandidate {
  lane: "direct" | "also_worth_knowing";
  rank: number;
  do_you_need_it: NeedAnswer;
  explanation: Explanation;
  /** Other eligible (Strong or Good) offerings for the same capability, best first ("Show alternatives", §24). */
  alternatives: Alternative[];
}

export type NotNeededReason =
  | "not_relevant_yet" // understanding marked the capability not relevant (with reason)
  | "low_match" // Possible / Weak / Skip (§9 bands)
  | "thin_evidence" // no evidence in the user's words (stage 10 evidence check)
  | "held_back" // low confidence or Checked trust with no slot below the top three (§9, §11; REGISTER A-021)
  | "over_cap"; // beyond the five-pick cap

export interface NotNeeded {
  capability_id: string;
  offering_id?: string;
  reason: NotNeededReason;
  detail?: string;
  match_band?: MatchBand;
}

export type RunOutcome =
  | "picks"
  | "needs_confirmation" // low-confidence understanding: read-back first (§9 failure table)
  | "needs_clarification" // vague input: one question (§6, §9)
  | "nothing_needed" // everything already covered (§6)
  | "no_good_pick" // needs exist but nothing clears the bar (§9)
  | "out_of_scope"; // say what Caf.ai does; recommend nothing (§9)

export interface RunResult {
  outcome: RunOutcome;
  readback: ProfileItem[];
  clarifying_question: { text: string; options: string[] } | null;
  picks: Pick[];
  not_needed: NotNeeded[];
  present: { capability_id: string; evidence_ids: string[] }[];
  /** Concept expansion (internal; shown only under "How we understood this", §9). */
  concepts: { term: string; capability_id: string | null }[];
  gaps: { unmatched_terms: string[]; capabilities_without_offering: string[] };
  degraded: "template_explanations" | "deterministic_only" | null;
  flags: { injection_suspected: boolean; input_truncated: boolean; redactions: number };
  versions: { catalog: string; config: string; prompts: string; llm: string; decision: string };
  usage: { stage: string; model: string; input_tokens: number; output_tokens: number }[];
}
