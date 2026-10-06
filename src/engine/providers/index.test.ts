import { describe, expect, it } from "vitest";
import { getProviders as fromEnv } from "./index";

const getProviders = (env: Record<string, string>) => fromEnv(env as NodeJS.ProcessEnv);

describe("getProviders", () => {
  it("uses the mock without a key, and Claude with one", () => {
    expect(getProviders({}).mock).toBe(true);
    expect(getProviders({ ANTHROPIC_API_KEY: "k" }).llm.id).toBe(
      "anthropic:claude-sonnet-5-5@medium/claude-sonnet-5-5@medium/claude-sonnet-5-5@low",
    );
  });

  it("treats empty values (as copied from .env.example) as unset", () => {
    const p = getProviders({ ANTHROPIC_API_KEY: "k", CAFAI_MODEL_PROVIDER: "", CAFAI_MODEL_JUDGMENT: "", CAFAI_EFFORT_JUDGMENT: "" });
    expect(p.mock).toBe(false);
    expect(p.llm.id).toBe("anthropic:claude-sonnet-5-5@medium/claude-sonnet-5-5@medium/claude-sonnet-5-5@low");
  });

  it("applies per-call models and effort from the environment", () => {
    const p = getProviders({ ANTHROPIC_API_KEY: "k", CAFAI_MODEL_EXPLANATION: "claude-haiku-4-5", CAFAI_EFFORT_UNDERSTANDING: "low", CAFAI_EFFORT_JUDGMENT: "bogus" });
    expect(p.llm.id).toBe("anthropic:claude-sonnet-5-5@low/claude-sonnet-5-5@medium/claude-haiku-4-5@default");
  });
});
