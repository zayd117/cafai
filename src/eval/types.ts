// Labeled evaluation case (plan §9 Evaluation, §25 Phase 0 design).
export type InputType = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface EvalCase {
  id: string;
  /** FIXTURE cases exercise the harness only; real cases come from concierge runs (REGISTER A-008). */
  fixture: boolean;
  input_type: InputType;
  text: string;
  declared_clients: string[];
  adversarial?: "injection" | "nonsense" | "non_english";
  labels: {
    must_recommend: string[]; // capability ids
    acceptable_offerings: string[]; // offering ids
    must_not_recommend: string[]; // offering ids or capability ids; any hit is a harmful pick
    potentially_missed: string[]; // capability ids (latent needs worth surfacing)
    probably_not_needed: string[]; // capability ids that belong under "Not needed now"
    expected_outcome?: string; // e.g. "nothing_needed", "out_of_scope"
  };
  /** Scripted model outputs for deterministic MOCK runs (fixture cases only). */
  mock?: { understand: unknown; judge?: "all_direct" | unknown; explain?: "template" | unknown };
  /**
   * A0 baseline (plan §9 Baseline, §25): a general assistant's answer to the same input, saved by a person for the
   * blind comparison. GPT/ChatGPT and Claude chat are baselines only, never pipeline arms (REGISTER A-041).
   */
  baseline?: {
    assistant: string; // e.g. "ChatGPT" or "Claude", as the person used it
    model_or_plan?: string; // what the app showed, if anything
    collected_on: string; // YYYY-MM-DD
    prompt: string; // exactly what was asked, e.g. the description + "What tools should I add?"
    answer: string; // pasted as-is
  };
}

export interface CaseResult {
  case_id: string;
  input_type: InputType;
  outcome: string;
  picked_capabilities: string[];
  picked_offerings: string[];
  picks: { offering_id: string; capability_id: string; lane: string; match_band: string; confidence_band: string; confidence_score: number; need_type: string; evidence_ok: boolean }[];
  not_needed_capabilities: string[];
  concepts_total: number;
  concepts_mapped: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  degraded: string | null;
  invalid_ids: string[];
}
