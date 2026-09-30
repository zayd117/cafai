// Stage 11 (plan §9): picks assembled by code. Ranking orders by Match, one pick per capability, at most five
// (including the one "Also worth knowing" pick, REGISTER A-013). Low confidence and Checked trust never sit in the
// top three (§9, §11). Possible / Weak / Skip go under "Not needed now" with the reason.
import { ENGINE_CONFIG as C } from "./config";
import type { NeedAnswer, NotNeeded, ScoredCandidate } from "./types";

const MATCH_ORDER = { strong: 0, good: 1, possible: 2, weak: 3, skip: 4 } as const;
const CONF_ORDER = { high: 0, medium: 1, low: 2 } as const;

const better = (a: ScoredCandidate, b: ScoredCandidate) =>
  MATCH_ORDER[a.match.band] - MATCH_ORDER[b.match.band] ||
  b.match.score - a.match.score ||
  CONF_ORDER[a.confidence.band] - CONF_ORDER[b.confidence.band] ||
  b.confidence.score - a.confidence.score ||
  a.offering_id.localeCompare(b.offering_id);

/** Kept out of the top three: low confidence (thin evidence) or trust resting on automated checks only. */
const keptFromTop = (s: ScoredCandidate) => s.confidence.band === "low" || s.notes.includes("checked_trust");
const heldDetail = (s: ScoredCandidate) =>
  s.confidence.band === "low" ? "looks relevant, but not enough evidence to be confident" : "trust rests on automated checks only";

export interface Placed extends ScoredCandidate {
  lane: "direct" | "also_worth_knowing";
  rank: number;
  do_you_need_it: NeedAnswer;
}

/** §8 part 6: need type and skip rules → needed now, useful later, probably not. */
export function doYouNeedIt(s: ScoredCandidate): NeedAnswer {
  if (s.need_type === "stated" || s.need_type === "implied") return "needed_now";
  if (s.need_type === "latent") return "useful_later";
  return "probably_not";
}

export function assemble(scored: ScoredCandidate[]): { picks: Placed[]; notNeeded: NotNeeded[] } {
  const notNeeded: NotNeeded[] = [];
  const drop = (s: ScoredCandidate, reason: NotNeeded["reason"], detail?: string) =>
    notNeeded.push({ capability_id: s.capability_id, offering_id: s.offering_id, reason, match_band: s.match.band, ...(detail ? { detail } : {}) });

  // One pick per capability: the best candidate for each.
  const bestByCap = new Map<string, ScoredCandidate>();
  for (const s of [...scored].sort(better)) if (!bestByCap.has(s.capability_id)) bestByCap.set(s.capability_id, s);

  const eligible: ScoredCandidate[] = [];
  for (const s of bestByCap.values()) {
    if (s.match.band === "strong" || s.match.band === "good") eligible.push(s);
    else drop(s, "low_match");
  }

  // "Also worth knowing": latent need, Good or better, at least Medium confidence, at most one (§9 Bands).
  let awk: ScoredCandidate | null = null;
  for (const s of eligible.filter((e) => e.need_type === "latent").sort(better)) {
    if (s.confidence.band === "low") drop(s, "held_back", heldDetail(s));
    else if (!awk) awk = s;
    else drop(s, "over_cap");
  }

  const direct = eligible.filter((s) => s.need_type !== "latent").sort(better);
  const directCap = C.caps.maxPicks - (awk ? 1 : 0);
  const picks: Placed[] = [];
  const place = (s: ScoredCandidate, lane: Placed["lane"]) => picks.push({ ...s, lane, rank: picks.length + 1, do_you_need_it: doYouNeedIt(s) });

  // Unrestricted direct picks first, then those kept from the top three (only from rank 4 on).
  for (const s of [...direct.filter((d) => !keptFromTop(d)), ...direct.filter(keptFromTop)]) {
    if (picks.length >= directCap) drop(s, "over_cap");
    else if (keptFromTop(s) && picks.length < C.caps.topProtected) drop(s, "held_back", heldDetail(s)); // REGISTER A-021
    else place(s, "direct");
  }
  if (awk) {
    if (keptFromTop(awk) && picks.length < C.caps.topProtected) drop(awk, "held_back", heldDetail(awk));
    else place(awk, "also_worth_knowing");
  }
  return { picks, notNeeded };
}
