// What a pick card says at a glance (2026-10-07 redesign): a decision pill, one facts line and short labelled lines.
// Catalog snapshots saved before the redesign lack the short fields, so each one falls back to the longer field.
import type { Offering } from "@/catalog/types";

export type PickState = "now" | "later" | "maybe";

/** Add now, Add later, or Not sure: low confidence always reads "Not sure", whatever the need. */
export function pickState(p: { confidence_band: string; do_you_need_it: string }): PickState {
  if (p.confidence_band === "low" || p.do_you_need_it === "probably_not") return "maybe";
  return p.do_you_need_it === "needed_now" ? "now" : "later";
}

/** Only "Add now" picks start in the order; the rest wait for a tick. */
export const startsInOrder = (p: { confidence_band: string; do_you_need_it: string }) => pickState(p) === "now";

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Catalog text says "your AI"; when the person named one AI tool, the card says its name instead. */
export function forClient(text: string, clientNames: string[]): string {
  if (clientNames.length !== 1) return text;
  return text.replace(/\b[Yy]our AI(?: tool)?\b/g, clientNames[0]!);
}

/** The "When" line. Older explanations open with "Add it now" or "Add it later", which the pill already says. */
export function whenLine(text: string): string {
  return capitalise(text.trim().replace(/^add it (now|later)\b/i, (_, w: string) => capitalise(w.toLowerCase())));
}

/** The "Skip if" line: the condition only. Older explanations open with "Skip it if". */
export function skipLine(text: string): string {
  return capitalise(text.trim().replace(/^skip (?:it|this)(?: if)?:?\s*/i, ""));
}

export function vendorShort(o: Offering): string {
  return o.identity.vendor_short ?? o.identity.vendor;
}

/** Older entries say "Free" even with a plan_required: it can mean a free tier or a free add-on to a paid plan. */
export function costLabel(o: Offering): string {
  if (o.cost.label) return o.cost.label;
  if (o.cost.model === "free") return "Free";
  return o.cost.model === "paid" ? "Paid" : "Pay as you go";
}

/** "About 20 min", or nothing when an older entry gives no minutes. */
export function effortShort(o: Offering): string {
  if (o.access.effort_short) return o.access.effort_short;
  const m = /^about (\d+) minutes?\b/i.exec(o.access.effort_plain.trim());
  return m ? `About ${m[1]} min` : "";
}

/** The "It can see" line. Older entries show the full access text: never shorten access by guessing. */
export function accessShort(o: Offering): string {
  return o.access.access_short ?? o.access.access_plain;
}
