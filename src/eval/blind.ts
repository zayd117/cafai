// Blind pairwise comparison against a general assistant (plan §9 Baseline, §25): both answers in one neutral text
// format, random order; judges pick A, B or tie; the key stays separate from what judges see.
import { createHash } from "node:crypto";
import type { RunResult } from "@/engine/types";
import type { CatalogSnapshot } from "@/catalog/types";

export interface BlindPair { case_id: string; input: string; A: string; B: string }
export interface PairKey { case_id: string; cafai: "A" | "B" }
export interface Judgment { case_id: string; judge: string; winner: "A" | "B" | "tie" }

/** Caf.ai's answer as neutral plain text: names and reasons only, no bands, labels or styling that identify it. */
export function neutralText(r: RunResult, snapshot: CatalogSnapshot): string {
  if (r.picks.length === 0) return "No additions suggested.";
  const name = (id: string) => snapshot.offerings.find((o) => o.id === id)?.identity.display_name ?? id;
  const lines = r.picks.map((p, i) => `${i + 1}. ${name(p.offering_id)}: ${p.explanation.summary} ${p.explanation.why}`);
  const skip = r.not_needed.filter((n) => n.reason === "not_relevant_yet" || n.reason === "low_match");
  if (skip.length) lines.push(`Not needed now: ${skip.map((n) => snapshot.taxonomy.find((c) => c.id === n.capability_id)?.plain_name ?? n.capability_id).join(", ")}.`);
  return lines.join("\n");
}

/** Deterministic per-seed order, so an export can be reproduced; the seed is not shown to judges. */
export function makePair(caseId: string, input: string, cafai: string, assistant: string, seed: string): { pair: BlindPair; key: PairKey } {
  const cafaiFirst = createHash("sha256").update(seed + caseId).digest()[0]! % 2 === 0;
  return {
    pair: { case_id: caseId, input, A: cafaiFirst ? cafai : assistant, B: cafaiFirst ? assistant : cafai },
    key: { case_id: caseId, cafai: cafaiFirst ? "A" : "B" },
  };
}

/** Win rate for Caf.ai over decided judgments; ties are reported, not counted as wins (H7 pass line: 60%, ASSUMPTION). */
export function scorePairs(keys: PairKey[], judgments: Judgment[]) {
  const keyBy = new Map(keys.map((k) => [k.case_id, k.cafai]));
  let wins = 0, losses = 0, ties = 0;
  for (const j of judgments) {
    const side = keyBy.get(j.case_id);
    if (!side) continue;
    if (j.winner === "tie") ties++;
    else if (j.winner === side) wins++;
    else losses++;
  }
  const decided = wins + losses;
  return { wins, losses, ties, win_rate: decided ? wins / decided : null };
}
