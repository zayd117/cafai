// Prices per million tokens. Sonnet 5.5 and Haiku 4.5 VERIFIED in plan §3 (29 Sep 2026); Fable 5.1, Opus 5.5 and Opus 4.8 from
// the Claude API model table (25 Sep 2026), for CAFAI_MODEL_* overrides and the models a refusal fallback can route to.
// Unknown models cost null in reports so they never read as free.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  // Jev 1.13: $0.042 per million input tokens, output free (docs.typesafe.ai/models, read 30 Sep 2026).
  "jev-1.13.0": { input: 0.042, output: 0 },
  MOCK: { input: 0, output: 0 },
};

/** Cost of one call in micro-dollars; null when the model has no known price (never recorded as free). */
export function costMicros(u: { model: string; input_tokens: number; output_tokens: number }): number | null {
  const p = PRICES[u.model];
  return p ? Math.round(u.input_tokens * p.input + u.output_tokens * p.output) : null;
}

const HIGHEST = {
  input: Math.max(...Object.values(PRICES).map((p) => p.input)),
  output: Math.max(...Object.values(PRICES).map((p) => p.output)),
};

/** What the daily budget breaker counts (plan §14): the real cost, or the highest known price for an unknown model, so
 * spend is never under-counted. */
export function budgetMicros(u: { model: string; input_tokens: number; output_tokens: number }): number {
  return costMicros(u) ?? Math.round(u.input_tokens * HIGHEST.input + u.output_tokens * HIGHEST.output);
}
