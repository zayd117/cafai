// Read-back tags: the short labels people see for each understood item ("Phone app", "Claude Code").
// The model writes them; code checks their length and falls back to a label cut from the item's own words.
import { redact } from "./redact";

export const TAG_MAX = 40;
export const SUGGESTIONS_MAX = 3;

const LEAD = /^(?:you(?:'|’)re|you are|you use|you want to|you need|you have|you(?:'|’)d like to|i(?:'|’)m|i am|i use|i want to|i need|i have|we(?:'|’)re|we are|we use|we want to|we need)\s+/i;
const VERB = /^(?:making|building|writing|working on|trying to|also)\s+/i;
const ARTICLE = /^(?:a|an|the|my|your|our)\s+/i;

/** A short label cut from a sentence: drops "You're making a", keeps four words. */
export function shortTag(text: string): string {
  text = redact(text, 400).text;
  const s = text.trim().replace(/\s+/g, " ").replace(/[.!?]+$/, "").replace(LEAD, "").replace(VERB, "").replace(ARTICLE, "");
  const words = s.split(" ").filter(Boolean);
  let out = words.slice(0, 4).join(" ");
  if (words.length > 4) out += "…";
  if (out.length > TAG_MAX) out = `${out.slice(0, TAG_MAX - 1).trimEnd()}…`;
  return out ? out.charAt(0).toUpperCase() + out.slice(1) : text.trim().slice(0, TAG_MAX);
}

/** A model or form tag, tidied; null when missing or too long to read as a tag. */
export function cleanTag(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const t = redact(tag, Infinity).text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return t && t.length <= TAG_MAX ? t : null;
}

/** Up to three other tags to offer in place of this one; never the tag itself, never twice. */
export function cleanSuggestions(list: unknown, tag: string): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set([tag.toLowerCase()]);
  const out: string[] = [];
  for (const s of list) {
    const t = cleanTag(s);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length === SUGGESTIONS_MAX) break;
  }
  return out;
}

/** The label to show for an item; runs stored before tags existed get one cut from their text. */
export const tagOf = (item: { tag?: string; text: string }) => cleanTag(item.tag) ?? shortTag(item.text);
