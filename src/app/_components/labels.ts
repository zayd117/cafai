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
export const NEED_LABEL: Record<string, string> = { needed_now: "Needed now", useful_later: "Useful later", probably_not: "Probably not" };

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

export const TRUST_LABEL: Record<string, string> = { reviewed: "Reviewed", checked: "Checked" };
