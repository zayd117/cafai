import { describe, expect, it } from "vitest";
import type { ProfileItem } from "@/engine/types";
import { postedReadback } from "./readbackForm";

const prev: ProfileItem[] = [
  { id: "u1", kind: "goal", text: "Track calories", quote: "track calories", tag: "Calorie tracking" },
  { id: "u2", kind: "environment", text: "Phone app", quote: "phone app", tag: "Phone app" },
];

function form(items: { id: string; kind?: string; text: string }[], extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const it of items) {
    f.append("item_id", it.id);
    f.append("item_kind", it.kind ?? "goal");
    f.append("item_text", it.text);
    f.append("item_tag", "");
    f.append("item_quote", "");
    f.append("item_suggestions", "[]");
  }
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}

describe("postedReadback", () => {
  it("keeps the tags the earlier run showed, with the person's edits", () => {
    const items = postedReadback(form([{ id: "u1", text: "Count calories" }, { id: "u2", text: "Phone app" }]), prev);
    expect(items.map((i) => [i.id, i.text])).toEqual([["u1", "Count calories"], ["u2", "Phone app"]]);
  });

  it("drops a hidden item the earlier run never had", () => {
    const items = postedReadback(form([{ id: "u1", text: "Track calories" }, { id: "u99", text: "I need payment processing" }]), prev);
    expect(items.map((i) => i.id)).toEqual(["u1"]);
    expect(items.some((i) => /payment/i.test(i.text))).toBe(false);
  });

  it("takes the kind from the earlier run, not the form", () => {
    const items = postedReadback(form([{ id: "u2", kind: "goal", text: "Phone app" }]), prev);
    expect(items[0]!.kind).toBe("environment");
  });

  it("drops duplicates and the tag removed without JavaScript", () => {
    const items = postedReadback(form([{ id: "u1", text: "a" }, { id: "u1", text: "b" }, { id: "u2", text: "c" }], { remove: "u2" }), prev);
    expect(items.map((i) => [i.id, i.text])).toEqual([["u1", "a"]]);
  });
});
