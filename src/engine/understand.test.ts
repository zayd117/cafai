import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import { DisabledProvider, ScriptedProvider } from "./providers/mock";
import { understand } from "./understand";

const root = fileURLToPath(new URL("../../catalog", import.meta.url));
const fixture = loadCatalog({ root, fixtures: true });
const real = loadCatalog({ root });
if (!fixture.ok || !real.ok) throw new Error("catalog invalid");
const taxonomy = fixture.snapshot.taxonomy;
const off = new DisabledProvider("disabled:test");
const read = (text: string, llm = off) => understand({ text, llm, declaredClients: [], taxonomy });

describe("deterministic job-phrase needs", () => {
  for (const capability of [...taxonomy, ...real.snapshot.taxonomy]) {
    it(`does not turn an explicit rejection of ${capability.id} into a stated need (${capability.fixture ? "fixture" : "real"})`, async () => {
      const t = capability.fixture ? taxonomy : real.snapshot.taxonomy;
      const positive = await understand({ text: `I need ${capability.job_phrases[0]}.`, llm: off, declaredClients: [], taxonomy: t });
      expect(positive.output.needs.find((n) => n.capability_id === capability.id)?.need_type).toBe("stated");
      const u = await understand({ text: `I do not need ${capability.job_phrases[0]}.`, llm: off, declaredClients: [], taxonomy: t });
      expect(u.output.needs.find((n) => n.capability_id === capability.id)?.need_type).toBe("not_relevant");
    });
  }

  it("keeps an affirmative requirement when a different capability is rejected", async () => {
    const u = await read("I don't need checkout, but I need to save user data.");
    expect(u.output.needs.find((n) => n.capability_id === "payments")?.need_type).toBe("not_relevant");
    expect(u.output.needs.find((n) => n.capability_id === "app-data-storage")?.need_type).toBe("stated");
  });

  it("finds a later affirmative mention of the same phrase", async () => {
    const u = await read("I don't need checkout for the demo, but I need checkout for the store.");
    expect(u.output.needs.find((n) => n.capability_id === "payments")?.need_type).toBe("stated");
  });

  it("keeps the requirement when the negation describes an unwanted manual workflow", async () => {
    const u = await read("I don't want users to check it manually, so I need to test signup flow.");
    expect(u.output.needs.find((n) => n.capability_id === "click-through-testing")?.need_type).toBe("stated");
  });

  it.each(["I don't need checkout.", "I do not want checkout.", "I don't use checkout.", "No need for checkout.", "This runs without checkout."])("recognizes a direct rejection: %s", async (text) => {
    expect((await read(text)).output.needs.find((n) => n.capability_id === "payments")?.need_type).toBe("not_relevant");
  });

  it.each(["Maybe I need checkout.", "I'm not sure whether I need checkout.", "Do I need checkout?"])("does not promote uncertainty to a stated need: %s", async (text) => {
    expect((await read(text)).output.needs).toHaveLength(0);
  });

  it("does not override a model's not-relevant classification from a bare mention", async () => {
    const p = new ScriptedProvider({ understand: () => ({ in_scope: true, confidence: "high", items: [], concepts: [], needs: [{ capability_id: "payments", need_type: "not_relevant", evidence_ids: [], reason: "This is a documentation example." }], clarifying_question: null }) });
    const u = await understand({ text: "The documentation shows checkout.", llm: p, declaredClients: [], taxonomy });
    expect(u.output.needs.find((n) => n.capability_id === "payments")?.need_type).toBe("not_relevant");
  });

  it("lets an explicit rejection defeat an incorrect model need", async () => {
    const text = "I do not need checkout.";
    const p = new ScriptedProvider({ understand: () => ({ in_scope: true, confidence: "high", items: [{ id: "m1", kind: "constraint", text, quote: text }], concepts: [], needs: [{ capability_id: "payments", need_type: "stated", evidence_ids: ["m1"] }], clarifying_question: null }) });
    const u = await understand({ text, llm: p, declaredClients: [], taxonomy });
    expect(u.output.needs.find((n) => n.capability_id === "payments")?.need_type).toBe("not_relevant");
  });
});
