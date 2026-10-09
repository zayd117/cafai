import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import { HeuristicMockProvider, ScriptedProvider } from "./providers/mock";
import { cleanSuggestions, cleanTag, shortTag, tagOf } from "./tags";
import { understand } from "./understand";

const res = loadCatalog({ root: fileURLToPath(new URL("../../catalog", import.meta.url)), fixtures: true });
if (!res.ok) throw new Error("fixture catalog invalid");
const taxonomy = res.snapshot.taxonomy;
const TEXT = "I'm making a calorie and macro tracker app for phones. I use Claude Code. I don't really know what I need.";

const model = (items: Record<string, unknown>[], needs: Record<string, unknown>[] = []) =>
  new ScriptedProvider({ understand: () => ({ in_scope: true, confidence: "high", items, concepts: [], needs, clarifying_question: null }) });
const ITEMS = [
  { id: "m1", kind: "goal", text: "You're making an app for phones", quote: "app for phones", tag: "Phone app", suggestions: ["iPhone app", "Phone app", "iphone app", "Website", "Android app"] },
  { id: "m2", kind: "environment", text: "You use Claude Code", quote: "I use Claude Code" },
];
const NEEDS = [
  { capability_id: "food-data-lookup", need_type: "implied", evidence_ids: ["m1"] },
  { capability_id: "project-notes-file", need_type: "implied", evidence_ids: ["m2"] },
];

describe("read-back tags", () => {
  it("cuts a short tag from a sentence when none is given", () => {
    expect(shortTag("You use Claude Code")).toBe("Claude Code");
    expect(shortTag("I'm making a calorie and macro tracker app for phones.")).toBe("Calorie and macro tracker…");
    expect(tagOf({ text: "You're building a website" })).toBe("Website");
    expect(tagOf({ text: "anything", tag: "  Phone   app. " })).toBe("Phone app");
  });

  it("rejects tags too long to read as tags, and tidies suggestions", () => {
    expect(cleanTag("x".repeat(41))).toBeNull();
    expect(cleanTag(3)).toBeNull();
    expect(cleanSuggestions(["iPhone app", "Phone app", "iphone app", "Website", "Android app"], "Phone app")).toEqual(["iPhone app", "Website", "Android app"]);
  });

  it("redacts contact details and keys before shortening labels or suggestions", () => {
    const key = "sk-CANARYcanary1234567890";
    expect(cleanTag("canary@example.com")).toBe("[redacted]");
    expect(cleanSuggestions([key, "canary@example.com", "Website"], "Phone app")).toEqual(["[redacted]", "Website"]);
    expect(shortTag(`I use ${key}`)).toBe("[redacted]");
  });

  it("keeps the model's tags and suggestions, and fills in a missing tag", async () => {
    const u = await understand({ llm: model(ITEMS, NEEDS), text: TEXT, declaredClients: [], taxonomy });
    expect(u.output.items.map((i) => i.tag)).toEqual(["Phone app", "Claude Code"]);
    expect(u.output.items[0]!.suggestions).toEqual(["iPhone app", "Website", "Android app"]);
    expect(u.output.items.some((i) => i.is_new)).toBe(false);
  });

  it("keeps a removed tag out when the read-back is sent back, along with needs only it supported", async () => {
    const userItems = [{ id: "u1", kind: "goal" as const, text: "You're making an app for phones", tag: "Phone app", quote: "app for phones", suggestions: ["Website", ""] }];
    const u = await understand({ llm: model(ITEMS, NEEDS), text: TEXT, declaredClients: [], taxonomy, userItems, locked: true });
    expect(u.output.items.map((i) => i.tag)).toEqual(["Phone app"]);
    expect(u.output.items[0]!.suggestions).toEqual(["Website"]); // still offered next time
    expect(u.output.items[0]!.quote).toBe("app for phones"); // still points at their words
    expect(u.output.needs.map((n) => n.capability_id)).not.toContain("project-notes-file");
    expect(u.output.needs.find((n) => n.capability_id === "food-data-lookup")?.evidence_ids).toEqual(["u1"]); // kept tag still counts
  });

  it("drops needs tied to a reworded tag, and lets the model's needs for kept tags through", async () => {
    const userItems = [
      { id: "u1", kind: "goal" as const, text: "You're making an app for phones", tag: "Phone app", quote: "app for phones" },
      { id: "u2", kind: "environment" as const, text: "Cursor", tag: "Cursor" },
    ];
    const u = await understand({ llm: model(ITEMS, NEEDS), text: TEXT, declaredClients: [], taxonomy, userItems, locked: true });
    expect(u.output.items.map((i) => i.tag)).toEqual(["Phone app", "Cursor"]);
    expect(u.output.needs.map((n) => n.capability_id)).toEqual(["food-data-lookup"]);
  });

  it("turns an added sentence into new tags, and only that sentence", async () => {
    const added = "People should sign in with Google.";
    const text = `${TEXT}\n${added}`;
    const userItems = [{ id: "u1", kind: "goal" as const, text: "Weight loss", tag: "Weight loss" }];
    const u = await understand({ llm: new HeuristicMockProvider(), text, declaredClients: [], taxonomy, userItems, locked: true, added });
    expect(u.output.items.map((i) => [i.tag, !!i.is_new])).toEqual([["Weight loss", false], ["People should sign in…", true]]);
    expect(u.output.items[0]!.quote).toBe("Weight loss"); // an edited tag quotes the person's edit
  });

  it("gives no tag for saying they are unsure what they need (sample mode)", async () => {
    const u = await understand({ llm: new HeuristicMockProvider(), text: TEXT, declaredClients: [], taxonomy });
    expect(u.output.items.map((i) => i.tag)).toEqual(["Calorie and macro tracker…", "Claude Code"]);
  });
});
