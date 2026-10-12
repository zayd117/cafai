// The read-back form as posted back to `rerun` (plan §9: edits are ground truth). Only tags the earlier run showed
// can come back: a posted id that run never had is dropped, so hidden fields can't add evidence the person never gave.
// New words arrive only through "Add something we missed", which joins their text and is checked like the rest.
import type { UserItem } from "@/engine/understand";
import type { ProfileItem } from "@/engine/types";

/** A posted JSON list of strings; anything else reads as empty. */
function parseList(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw.slice(0, 1000));
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** The tags still shown, in order. Kind always comes from the earlier run; the tag's words may be the person's own. */
export function postedReadback(form: FormData, prev: ProfileItem[]): UserItem[] {
  const known = new Map(prev.map((i) => [i.id, i]));
  const ids = form.getAll("item_id").map(String);
  const texts = form.getAll("item_text").map(String);
  const tags = form.getAll("item_tag").map(String);
  const quotes = form.getAll("item_quote").map(String);
  const suggestions = form.getAll("item_suggestions").map(String);
  const removed = String(form.get("remove") || ""); // the × on a tag, when the page runs without JavaScript
  const items: UserItem[] = [];
  ids.forEach((id, i) => {
    const before = known.get(id);
    const t = (texts[i] ?? "").trim().slice(0, 300);
    if (!before || id === removed || !t || items.some((x) => x.id === id)) return;
    const tag = (tags[i] ?? "").trim().slice(0, 60);
    const quote = (quotes[i] ?? "").trim().slice(0, 1000);
    const swap = parseList(suggestions[i] ?? "");
    items.push({ id, kind: before.kind, text: t, ...(tag ? { tag } : {}), ...(quote ? { quote } : {}), suggestions: swap });
  });
  return items;
}
