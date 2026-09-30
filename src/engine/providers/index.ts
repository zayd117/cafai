import { AnthropicProvider } from "./anthropic";
import { HeuristicMockProvider } from "./mock";
import type { DecisionProvider, LlmProvider } from "./types";

/**
 * CAFAI_MODEL_PROVIDER=anthropic uses the Claude API (credentials resolved by the SDK); anything else uses the MOCK
 * provider, whose results carry the "mock:" id and are labeled MOCK in the UI. Default: anthropic only when
 * ANTHROPIC_API_KEY is set (REGISTER A-017).
 */
export function getProviders(env = process.env): { llm: LlmProvider; decision: DecisionProvider; mock: boolean } {
  const choice = env.CAFAI_MODEL_PROVIDER ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "mock");
  if (choice === "anthropic") {
    const p = new AnthropicProvider({
      models: {
        understanding: env.CAFAI_MODEL_UNDERSTANDING,
        judgment: env.CAFAI_MODEL_JUDGMENT,
        explanation: env.CAFAI_MODEL_EXPLANATION,
      },
    });
    return { llm: p, decision: p, mock: false };
  }
  const m = new HeuristicMockProvider();
  return { llm: m, decision: m, mock: true };
}

export const isMockProvider = (id: string) => id.startsWith("mock:");
