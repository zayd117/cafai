// Prices per million tokens, VERIFIED in plan §3 (29 Sep 2026). Unknown models cost NaN so reports never under-count.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  MOCK: { input: 0, output: 0 },
};

/** Cost of one call in micro-dollars; null when the model has no known price (never recorded as free). */
export function costMicros(u: { model: string; input_tokens: number; output_tokens: number }): number | null {
  const p = PRICES[u.model];
  return p ? Math.round(u.input_tokens * p.input + u.output_tokens * p.output) : null;
}
