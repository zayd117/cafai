import { describe, expect, it } from "vitest";
import type { Placed } from "./assemble";
import { checkExplanation } from "./explain";
import type { Explanation } from "./types";

const pick = { offering_id: "fx-error-alerts", evidence_ids: ["u1"] } as Placed;
const ok: Explanation = {
  offering_id: "fx-error-alerts",
  evidence_ids: ["u1"],
  why: "Once testers try your app, you'll know when it breaks on their phone.",
  how_it_helps: "Each report points to the spot in your app that failed, so your AI can help fix it.",
  do_you_need_it: "Once you share your app with testers.",
  skip_if: "You already get crash reports from another tool.",
  summary: "Crash reports from your app, which your AI can read.",
};
const check = (e: Partial<Explanation>) => checkExplanation({ ...ok, ...e }, pick, new Set(["fx-error-alerts"]), new Set(["u1"]));

describe("explanation word limits (card lines)", () => {
  it("accepts lines within the limits", () => {
    expect(check({})).toEqual([]);
  });

  it("rejects a line over its word limit, so the template or a retry takes over", () => {
    expect(check({ why: "Once other people start to try your app, you will want to know when it breaks on their phone." })).toContain("why:too_long");
    expect(check({ do_you_need_it: "Add it later, once you share your app with testers and they start to use it." })).toContain("do_you_need_it:too_long");
    expect(check({ skip_if: "Skip it if you already get crash reports from another tool, such as Firebase Crashlytics or PostHog." })).toContain("skip_if:too_long");
  });
});
