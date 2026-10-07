// Word limits keep every pick card short (2026-10-07 card redesign): the catalog loader and the explanation checker
// both count words this way, so a long line is caught before it reaches a card.

/** Whitespace-separated words, the way a reader counts them. */
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Card fields written in the catalog, with their word limits. */
export const CATALOG_WORD_LIMITS = {
  "identity.vendor_short": 3,
  "editorial.what_it_is": 18,
  // The template explanation shows these when no model writes the card: "How it helps" and the first "Skip if".
  "editorial.could_help_with": 30,
  "skip_if[0]": 14,
  "access.access_short": 14,
  "access.effort_short": 4,
  "access.first_step": 14,
  "cost.label": 4,
} as const;
