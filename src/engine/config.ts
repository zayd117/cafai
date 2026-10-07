// Versioned engine config (plan §9: weights live in a versioned config; Phase 0 tests whether scores predict useful picks).
// EVERY NUMBER HERE IS A PLACEHOLDER. The plan names the dimensions and rules but gives no weights or cut-points
// (REGISTER A-009). Do not tune these to make a demo look good; calibrate on the labeled set with a held-out split (§25).

export const ENGINE_CONFIG = {
  version: "v0-placeholder",
  status: "PLACEHOLDER — REQUIRES VALIDATION (plan §9, §25; REGISTER A-009)",

  input: {
    /** Length cap for the description (stage 1). Plan gives no number (wireframe UNKNOWN [MAX]). */
    maxChars: 4000,
  },

  caps: {
    maxPicks: 5, // §6 hard cap, one per capability; includes the "Also worth knowing" pick (REGISTER A-013)
    maxAlsoWorthKnowing: 1, // §9
    maxLatentNeedsPerRun: 1, // §9
    topProtected: 3, // Low confidence and Checked trust never in the top three (§9, §11)
    maxShortlist: 12, // §9: candidate judgment over at most 12 shortlisted candidates
    maxClarifyingQuestions: 1, // §6
  },

  /** Match dimensions (§9 table), equal weights. */
  matchWeights: { project: 1, capability: 1, intent: 1, technical: 1, usefulness: 1, specificity: 1 },
  intentScore: { direct: 1, partial: 0.5, none: 0 },
  requirementsScore: { yes: 1, partly: 0.5, unknown: 0.5, no: 0 },
  neutral: 0.5,
  needStrength: { stated: 1, implied: 0.75, latent: 0.5 },
  matchBands: [
    { band: "strong", min: 0.85 },
    { band: "good", min: 0.7 },
    { band: "possible", min: 0.5 },
    { band: "weak", min: 0.3 },
    { band: "skip", min: 0 },
  ] as const,

  /** Confidence inputs (§9 table): evidence strength, clarity of input, rule and model agreement. */
  evidenceScore: { observed: 1, claimed: 0.6, inferred: 0.3 },
  compatibilityScore: { tested: 1, reported: 1, declared: 0.6, derived: 0.3 },
  trustScore: { reviewed: 1, checked: 0.6 },
  clarityScore: { high: 1, medium: 0.6, low: 0.3 },
  agreementScore: { both: 1, one: 0.7, evidence_not_enough: 0.3 },
  confidenceBands: [
    { band: "high", min: 0.75 },
    { band: "medium", min: 0.5 },
    { band: "low", min: 0 },
  ] as const,

  /** Staleness (§11, ASSUMPTION): 60 days lowers Confidence one band; 90 days removes from picks. */
  staleness: { lowerConfidenceAfterDays: 60, removeAfterDays: 90 },

  /** Explanation validator (§9): length limits. Plan gives no numbers. Word limits keep the card's lines short
   * (2026-10-07 card redesign: "Why it fits", "When", "Skip if"; the other two sit under More details). */
  explanation: { maxFieldChars: 280, maxWords: { why: 16, do_you_need_it: 12, skip_if: 14, how_it_helps: 30, summary: 25 } },
} as const;

export type EngineConfig = typeof ENGINE_CONFIG;
