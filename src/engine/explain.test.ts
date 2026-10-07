import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import { wordCount } from "@/lib/words";
import type { Placed } from "./assemble";
import { ENGINE_CONFIG } from "./config";
import { checkExplanation, templateExplanation } from "./explain";
import type { Explanation, ProfileItem } from "./types";

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

describe("template explanation (no model, AI off, or a rejected line)", () => {
  it("keeps every card line within its word limit for every real tool, even for a long sentence", () => {
    const res = loadCatalog({ root: fileURLToPath(new URL("../../catalog", import.meta.url)) });
    if (!res.ok) throw new Error("catalog did not load");
    const quote = "I'm writing a Tampermonkey script that reads visible Excel cells in Chrome and notifies me on my phone when something changes.";
    const items: ProfileItem[] = [{ id: "u1", kind: "goal", text: quote, quote }];
    for (const o of res.snapshot.offerings) {
      for (const need_type of ["stated", "latent"] as const) {
        const placed = { offering_id: o.id, capability_id: o.capabilities[0], evidence_ids: ["u1"], need_type, do_you_need_it: need_type === "latent" ? "useful_later" : "needed_now" } as unknown as Placed;
        const e = templateExplanation(placed, res.snapshot, items);
        for (const f of ["why", "how_it_helps", "do_you_need_it", "skip_if", "summary"] as const) {
          expect(wordCount(e[f]), `${o.id} ${f}: ${e[f]}`).toBeLessThanOrEqual(ENGINE_CONFIG.explanation.maxWords[f]);
        }
        expect(e.skip_if, o.id).not.toBe("");
      }
    }
  });
});
