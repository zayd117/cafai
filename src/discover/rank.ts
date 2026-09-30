// Code owns every number that decides the order (Jev supplies probabilities, Claude supplies words).
import { JEV_THRESHOLDS } from "@/engine/providers/jev";
import type { Listing, ListingScore, QueryScore, Ranked } from "./types";

/** PLACEHOLDERS: tune on real cases, then freeze (same status as JEV_THRESHOLDS, REGISTER A-040). */
export const DISCOVER_CONFIG = {
  /** Keep at most this many queries per item, best first. */
  queriesPerItem: 2,
  /** A query below this Jev score is dropped before any search. */
  minQueryScore: 0.3,
  /** Results kept per query from mcp.market. */
  resultsPerQuery: 8,
  /** final = fit x (queryFloor + queryWeight x p_query) x (trustFloor + trustWeight x trust). Trust only nudges. */
  queryFloor: 0.7,
  queryWeight: 0.3,
  trustFloor: 0.8,
  trustWeight: 0.2,
  /** fit below this is shown but flagged weak. */
  weakFit: 0.3,
  top: 8,
};

/** Top queries per item that clear the floor. Order: best score first. */
export function pickQueries(scores: QueryScore[], itemOf: (queryId: string) => string, cfg = DISCOVER_CONFIG): QueryScore[] {
  const byItem = new Map<string, QueryScore[]>();
  for (const s of scores) {
    if (s.score < cfg.minQueryScore) continue;
    const item = itemOf(s.query_id);
    byItem.set(item, [...(byItem.get(item) ?? []), s]);
  }
  return [...byItem.values()].flatMap((list) => list.sort((a, b) => b.score - a.score).slice(0, cfg.queriesPerItem));
}

/** Noisy-OR over the per-item probabilities that clear the signal threshold: covering more needs raises the score. */
export const noisyOr = (ps: number[]) => 1 - ps.reduce((acc, p) => acc * (1 - p), 1);

export function trustOf(l: Listing): number {
  if (l.grade_score === null) return 0.5;
  return Math.min(1, Math.max(0, l.grade_score / 100));
}

/**
 * Combine both Jev passes. fit = max(holistic, noisy-OR of the confident per-item hits); the query score of the best
 * query that retrieved the server scales it; the mcp.market grade only nudges. F-graded servers are dropped
 * (the gateway refuses them too).
 */
export function rank(args: {
  listings: { listing: Listing; found_by: string[] }[];
  queryScores: Map<string, number>;
  listingScores: Map<string, ListingScore>;
  cfg?: typeof DISCOVER_CONFIG;
}): Ranked[] {
  const cfg = args.cfg ?? DISCOVER_CONFIG;
  const out: Ranked[] = [];
  for (const { listing, found_by } of args.listings) {
    if (listing.grade === "F") continue;
    const s = args.listingScores.get(listing.slug);
    if (!s) continue; // unscored: never ranked on trust alone
    const hits = Object.entries(s.per_item).filter(([, p]) => p >= JEV_THRESHOLDS.signal);
    const fit = Math.max(s.useful, noisyOr(hits.map(([, p]) => p)));
    const p_query = Math.max(0, ...found_by.map((q) => args.queryScores.get(q) ?? 0));
    const trust = trustOf(listing);
    const final = fit * (cfg.queryFloor + cfg.queryWeight * p_query) * (cfg.trustFloor + cfg.trustWeight * trust);
    out.push({ listing, found_by, p_query, fit, trust, final, covers: hits.map(([id]) => id), weak: fit < cfg.weakFit });
  }
  out.sort((a, b) => b.final - a.final || a.listing.slug.localeCompare(b.listing.slug));
  return withEachNeed(out, cfg.top);
}

/**
 * Top N by score, but the best server for every item that any server covers stays in the list, so one popular need
 * cannot crowd out the rest. Reserved servers replace the lowest-ranked others; final order is by score.
 */
export function withEachNeed(sorted: Ranked[], top: number): Ranked[] {
  const reserved = new Set<Ranked>();
  const items = new Set(sorted.flatMap((r) => r.covers));
  for (const id of items) reserved.add(sorted.find((r) => r.covers.includes(id))!);
  const keep = new Set(reserved);
  for (const r of sorted) {
    if (keep.size >= Math.max(top, reserved.size)) break;
    keep.add(r);
  }
  return sorted.filter((r) => keep.has(r));
}
