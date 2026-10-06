import { describe, expect, it } from "vitest";
import { budgetMicros, costMicros } from "./pricing";

describe("pricing", () => {
  it("prices known models per million tokens", () => {
    expect(costMicros({ model: "claude-sonnet-5-5", input_tokens: 1000, output_tokens: 500 })).toBe(7000);
    expect(costMicros({ model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 500 })).toBe(14000);
  });
  it("leaves unknown models unpriced in reports but counts them at the highest price for the budget", () => {
    const u = { model: "claude-something-new", input_tokens: 1000, output_tokens: 500 };
    expect(costMicros(u)).toBeNull();
    expect(budgetMicros(u)).toBe(35000);
    expect(budgetMicros({ model: "claude-haiku-4-5", input_tokens: 1000, output_tokens: 500 })).toBe(3500);
  });
});
