import { AnthropicProvider, type AnthropicProviderOptions, isEffort } from "./anthropic";
import { HeuristicMockProvider } from "./mock";
import type { DecisionProvider, LlmProvider } from "./types";

/**
 * CAFAI_MODEL_PROVIDER=anthropic uses the Claude API (credentials resolved by the SDK); anything else uses the MOCK
 * provider, whose results carry the "mock:" id and are labeled MOCK in the UI. Default: anthropic only when
 * ANTHROPIC_API_KEY is set (REGISTER A-017).
 */
export function getProviders(env = process.env): { llm: LlmProvider; decision: DecisionProvider; mock: boolean } {
  const choice = env.CAFAI_MODEL_PROVIDER || (env.ANTHROPIC_API_KEY ? "anthropic" : "mock"); // empty means unset
  if (choice === "anthropic") {
    const p = new AnthropicProvider(anthropicOptions(env));
    return { llm: p, decision: p, mock: false };
  }
  const m = new HeuristicMockProvider();
  return { llm: m, decision: m, mock: true };
}

/** Models and effort per call from the environment; `npm run ai:check` builds its free token-counting run from the same. */
export function anthropicOptions(env = process.env): AnthropicProviderOptions {
  return {
    // An empty value (as copied from .env.example) means the default model, not a model named "".
    models: {
      understanding: env.CAFAI_MODEL_UNDERSTANDING || undefined,
      judgment: env.CAFAI_MODEL_JUDGMENT || undefined,
      explanation: env.CAFAI_MODEL_EXPLANATION || undefined,
    },
    // low | medium | high | xhigh | max; anything else keeps the default (REGISTER A-025).
    effort: {
      understanding: isEffort(env.CAFAI_EFFORT_UNDERSTANDING) ? env.CAFAI_EFFORT_UNDERSTANDING : undefined,
      judgment: isEffort(env.CAFAI_EFFORT_JUDGMENT) ? env.CAFAI_EFFORT_JUDGMENT : undefined,
      explanation: isEffort(env.CAFAI_EFFORT_EXPLANATION) ? env.CAFAI_EFFORT_EXPLANATION : undefined,
    },
  };
}

export const isMockProvider = (id: string) => id.startsWith("mock:");
