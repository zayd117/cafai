// Plain-language labels (plan §8, §9 Bands). Words, never numbers, at level 1.
export const MATCH_LABEL: Record<string, string> = {
  strong: "Strong match",
  good: "Good match",
  possible: "Possible match",
  weak: "Weak match",
  skip: "Skip",
};
export const MATCH_SEGMENTS: Record<string, number> = { strong: 4, good: 3, possible: 2, weak: 1, skip: 0 };
export const CONFIDENCE_LABEL: Record<string, string> = { high: "Sure", medium: "Fairly sure", low: "Not sure yet" };
export const CONFIDENCE_DOTS: Record<string, number> = { high: 3, medium: 2, low: 1 };
/** The card's decision pill (2026-10-07): need and confidence in one word pair. See cardCopy.pickState. */
export const PILL_LABEL = { now: "Add now", later: "Add later", maybe: "Not sure" } as const;

// Level-3 offering types with a few plain words each (§8: technical terms first appear with an explanation).
// Wording is a draft pending the glossary (§24 should-have; REGISTER A-029).
export const KIND_LABEL: Record<string, string> = {
  mcp_server: "MCP server (a way for your AI tool to use another service)",
  skill: "Skill (instructions your AI tool can load when needed)",
  plugin: "Plugin (a bundle of add-ons for your AI tool)",
  api: "API (a service your app or AI tool calls)",
  library: "Library (code your project depends on)",
  play: "Practice (steps to follow; nothing to install)",
};

export const NOT_NEEDED_REASON: Record<string, string> = {
  not_relevant_yet: "Not relevant yet.",
  low_match: "Lower fit for this project.",
  thin_evidence: "Nothing in your description supports it yet.",
  held_back: "Held back.",
  over_cap: "Beyond the five-pick limit.",
};

// Where a catalog fact comes from (level 2 evidence list).
export const EVIDENCE_LABEL: Record<string, string> = { claimed: "The maker says", observed: "We checked", inferred: "Not confirmed" };

export const TRUST_LABEL: Record<string, string> = { reviewed: "Reviewed", checked: "Checked" };

// Read-back tag groups (results page): each item kind sits under a plain heading.
export const TAG_GROUP: Record<string, string> = {
  goal: "make", task: "make", problem: "make", interest: "make",
  environment: "use", current_tool: "use",
  constraint: "must",
  possible_need: "know",
};
export const TAG_GROUP_ORDER = [
  { id: "make", label: "What you’re making" },
  { id: "use", label: "What you use" },
  { id: "must", label: "Must have" },
  { id: "know", label: "Good to know" },
] as const;
