import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import { explain } from "@/engine/explain";
import { runPipeline } from "@/engine/pipeline";
import { loadSavedExamples, sameReadback, savedProviders } from "./savedExamples";

const root = (p: string) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const res = loadCatalog({ root: root("catalog") });
if (!res.ok) throw new Error("real catalog invalid");
const snapshot = res.snapshot;
const examples = loadSavedExamples(root("catalog/examples"));
const intake = readFileSync(root("src/app/page.tsx"), "utf8");
// The day the entries were checked; staleness rules would drop them 90 days later.
const NOW = new Date("2026-10-06T12:00:00Z");

const EXPECTED: Record<string, { direct: string[]; extra: string | null; notNeeded: string[] }> = {
  "calorie-tracker": {
    direct: ["expo-app-toolkit", "usda-fooddata-central", "supabase-backend"],
    extra: "sentry-crash-alerts",
    notNeeded: ["barcode-food-lookup", "project-notes"],
  },
  "excel-change-alerts": { direct: ["ntfy-push-alerts", "chrome-devtools-mcp"], extra: "healthchecks-io", notNeeded: ["scheduled-spreadsheet-checks"] },
  "weekly-shopify-report": {
    direct: ["google-drive-connector", "shopify-connector", "claude-for-google-sheets"],
    extra: null,
    notNeeded: ["scheduled-runs"],
  },
};

describe("saved answers for the intake examples", () => {
  it("covers each intake example button, and nothing else", () => {
    expect(examples.map((e) => e.id).sort()).toEqual(Object.keys(EXPECTED).sort());
    for (const e of examples) expect(intake).toContain(JSON.stringify(e.text).slice(1, -1));
  });

  for (const ex of examples) {
    it(`${ex.id}: real picks, saved wording, nothing degraded`, async () => {
      const p = savedProviders(ex);
      const r = await runPipeline({ text: ex.text, declaredClients: ex.declared_clients, snapshot, llm: p, decision: p, now: NOW });
      const want = EXPECTED[ex.id]!;
      expect(r.outcome).toBe("picks");
      expect(r.degraded).toBeNull();
      expect(r.versions.llm).toBe(`saved:${ex.id}`);
      expect(r.picks.filter((x) => x.lane === "direct").map((x) => x.offering_id)).toEqual(want.direct);
      expect(r.picks.find((x) => x.lane === "also_worth_knowing")?.offering_id ?? null).toBe(want.extra);
      expect(r.not_needed.map((n) => n.capability_id)).toEqual(want.notNeeded);
      // Every pick uses the saved explanation (the validator rejected none) and cites a read-back item.
      for (const pick of r.picks) expect(pick.explanation.why).toBe(ex.explanations[pick.offering_id]!.why);
      const again = await explain({ llm: p, picks: r.picks, snapshot, items: r.readback });
      expect(again.rejected).toEqual({});
      // Only the person's own words are quoted back.
      for (const item of r.readback) expect(ex.text).toContain(item.quote);
    });
  }

  it("still answers when the person ticked other AI tools (Cursor only)", async () => {
    const ex = examples.find((e) => e.id === "calorie-tracker")!;
    const p = savedProviders(ex);
    const r = await runPipeline({ text: ex.text, declaredClients: ["cursor"], snapshot, llm: p, decision: p, now: NOW });
    expect(r.degraded).toBeNull();
    expect(r.picks.length).toBeGreaterThan(0);
    for (const pick of r.picks) {
      const o = snapshot.offerings.find((x) => x.id === pick.offering_id)!;
      expect(o.distributions.some((d) => d.client === "cursor" || d.client === "any")).toBe(true);
    }
  });

  it("treats an unchanged read-back as the same order, and any edit as a new one", () => {
    const readback = [{ id: "u1", kind: "goal" as const, text: "A phone app", quote: "app" }];
    expect(sameReadback([{ id: "u1", kind: "goal", text: "A phone app" }], readback)).toBe(true);
    expect(sameReadback([{ id: "u1", kind: "goal", text: "A web app" }], readback)).toBe(false);
    expect(sameReadback([{ id: "u1", kind: "goal", text: "A phone app" }, { id: "a2", kind: "task", text: "Payments" }], readback)).toBe(false);
  });
});
