// LLM gateway interfaces (plan §17: an in-app module exposing "LLM" and "Decision" interfaces).
// LLM: understanding with concept expansion (stages 2-3) and explanation (stage 12).
// Decision: structured candidate judgment (stage 8), the part Jev may take over only if it wins the Phase 0 bake-off (§9, §25).
// Providers return raw JSON; the engine validates every field before use (closed world, §9).

export interface Usage {
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface ModelResponse {
  json: unknown;
  usage: Usage;
}

export interface TaxonomyEntryForModel {
  id: string;
  plain_name: string;
  job_phrases: string[];
  /** Curated need signals, closed world: the model may only cite these ids for implied/latent needs. */
  signals: { id: string; text: string; need_type: "implied" | "latent" }[];
}

export interface UnderstandingRequest {
  /** Redacted user text. Data, never instructions: providers must fence it as untrusted input. */
  text: string;
  declared_clients: string[];
  /** Read-back items the user edited or wrote; ground truth (§9). Re-sent on reruns. */
  user_items: { id: string; kind: string; text: string }[];
  taxonomy: TaxonomyEntryForModel[];
}

export interface CandidateForModel {
  offering_id: string;
  capability_id: string;
  plain_name: string;
  /** Curator-approved profile facts only; never raw third-party text (§9). */
  provides: string[];
  requires: string[];
  limits: string[];
  /** The offering's curated "who is this for" signals, closed world (backward direction of the two-way match, §9). */
  signals: { id: string; text: string }[];
}

export interface JudgmentRequest {
  text: string;
  /** quote: the item's verified words from the input; edited: user edit (ground truth). Code-side only for Jev. */
  items: { id: string; kind: string; text: string; quote?: string; edited?: boolean }[];
  candidates: CandidateForModel[];
}

export interface ExplanationRequest {
  items: { id: string; kind: string; text: string }[];
  picks: {
    offering_id: string;
    need_type: string;
    evidence_ids: string[];
    plain_name: string;
    what_it_is: string;
    could_help_with: string;
    skip_conditions: string[];
  }[];
}

export interface LlmProvider {
  id: string;
  understand(req: UnderstandingRequest): Promise<ModelResponse>;
  explain(req: ExplanationRequest): Promise<ModelResponse>;
}

export interface DecisionProvider {
  id: string;
  judge(req: JudgmentRequest): Promise<ModelResponse>;
}
