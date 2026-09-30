// The Jev-led loop: Claude writes the words, Jev weighs, rates and orders at every step, code does the arithmetic and the fetching.
//   1. Claude interprets the description into needs (items) and search queries.
//   2. Jev weighs the needs (how central each is) and rates every query; code picks the best queries overall, not a fixed few per need.
//   3. Code searches mcp.market with those queries (a plain HTTP call: a model adds cost and risk there, nothing else).
//   4. Jev rates each result per need, overall, and against the search terms that found it; code weighs that by how relevant the terms and needs were.
//   5. Jev compares the shortlist head to head (both orders); code combines the wins with the ratings and cuts the list.
//   6. Claude explains the picks (same as the classic loop).
// Every threshold here is a PLACEHOLDER (same status as JEV_THRESHOLDS, REGISTER A-040/A-043): tune on labelled cases, then freeze.
import { JEV_THRESHOLDS } from "@/engine/providers/jev";
import { noisyOr, trustOf, withEachNeed } from "./rank";
import type { DiscoverResult, Interpreter } from "./run";
import { searchMarket, type FetchLike } from "./search";
import type { Interpretation, Item, ItemScore, Listing, ListingScore, QueryScore, Ranked } from "./types";

export const LED_CONFIG = {
  /** Most queries searched in total, across all needs (every need's best query is always kept, even past this). */
  queryBudget: 18,
  /** Every need gets at least this many queries when it has that many above the query floor. */
  minPerItem: 2,
  /** No single need may take more than this many queries. */
  maxPerItem: 4,
  /** A query below this Jev score is dropped before any search. */
  minQueryScore: 0.3,
  /**
   * A need below this weight (Jev's "is it central") gets no queries. 0 = never drop a need: Jev judges centrality from the
   * needs alone, not the person's words, and in the first live runs it rated needs the person asked for by name (music, a ready-made tracker) as minor.
   */
  itemFloor: 0,
  /** A need's weight counts as itemWeightFloor + (1 - itemWeightFloor) x weight; 1 turns need weights off. */
  itemWeightFloor: 0.7,
  resultsPerQuery: 8,
  /** Search terms asked about per result (the best-scoring ones that found it). */
  termsPerListing: 2,
  /** base = fit x (termFloor + termWeight x term) x (trustFloor + trustWeight x trust). Trust only nudges. */
  termFloor: 0.7,
  termWeight: 0.3,
  trustFloor: 0.8,
  trustWeight: 0.2,
  /** Ask Jev to compare the shortlist head to head. False leaves the order to the ratings alone (for ablation tests). */
  usePairs: true,
  /** Results compared head to head. */
  shortlist: 8,
  /** final = base x (pairFloor + pairWeight x pair). Pair wins dominate when ratings tie near 100%. */
  pairFloor: 0.4,
  pairWeight: 0.6,
  /** Base score below this is cut, but at least minKeep results stay (flagged weak). */
  keepFloor: 0.3,
  minKeep: 3,
  top: 8,
  weakFit: 0.3,
};
type Cfg = typeof LED_CONFIG;

export interface LedScorer {
  scoreItems(items: Item[]): Promise<ItemScore[]>;
  scoreQueries(items: Interpretation["items"], queries: Interpretation["queries"]): Promise<QueryScore[]>;
  scoreListingsLed(items: Item[], cands: { listing: Listing; terms: string[] }[]): Promise<ListingScore[]>;
  comparePairs(items: Item[], pairs: [Listing, Listing][]): Promise<{ a: string; b: string; p_a: number }[]>;
}

export interface PickedQuery extends QueryScore {
  /** query score x need weight factor: the number queries are ranked and budgeted by. */
  rank_score: number;
}

const itemFactor = (w: number, cfg: Cfg) => cfg.itemWeightFloor + (1 - cfg.itemWeightFloor) * w;

/**
 * Jev's ranking of the queries. Drops weak queries (and needs below itemFloor), guarantees every remaining need its best query,
 * then its second, then fills the budget with the highest-ranked queries overall (at most maxPerItem per need).
 */
export function pickQueriesLed(args: { queryScores: QueryScore[]; itemScores: ItemScore[]; itemOf: (queryId: string) => string; cfg?: Cfg }): { picked: PickedQuery[]; dropped_items: string[] } {
  const cfg = args.cfg ?? LED_CONFIG;
  const weight = new Map(args.itemScores.map((s) => [s.item_id, s.weight]));
  const dropped_items = args.itemScores.filter((s) => s.weight < cfg.itemFloor).map((s) => s.item_id);
  const pool: PickedQuery[] = args.queryScores
    .filter((s) => s.score >= cfg.minQueryScore && (weight.get(args.itemOf(s.query_id)) ?? 0) >= cfg.itemFloor)
    .map((s) => ({ ...s, rank_score: s.score * itemFactor(weight.get(args.itemOf(s.query_id)) ?? 0, cfg) }))
    .sort((a, b) => b.rank_score - a.rank_score || a.query_id.localeCompare(b.query_id, undefined, { numeric: true }));
  const taken = new Map<string, number>();
  const picked: PickedQuery[] = [];
  const take = (q: PickedQuery) => {
    picked.push(q);
    taken.set(args.itemOf(q.query_id), (taken.get(args.itemOf(q.query_id)) ?? 0) + 1);
  };
  const count = (q: PickedQuery) => taken.get(args.itemOf(q.query_id)) ?? 0;
  for (const q of pool) if (count(q) === 0) take(q);
  for (let round = 1; round < cfg.minPerItem; round++) {
    for (const q of pool) if (picked.length < cfg.queryBudget && !picked.includes(q) && count(q) === round) take(q);
  }
  for (const q of pool) if (picked.length < cfg.queryBudget && !picked.includes(q) && count(q) < cfg.maxPerItem) take(q);
  return { picked: picked.sort((a, b) => b.rank_score - a.rank_score), dropped_items };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Same description, several slugs (one author publishing twice): keep one, the better graded. */
export function dedupe<T extends { listing: Listing }>(cands: T[]): T[] {
  const best = new Map<string, T>();
  for (const c of cands) {
    const key = norm(c.listing.description);
    const cur = best.get(key);
    if (!cur || (c.listing.grade_score ?? 0) > (cur.listing.grade_score ?? 0)) best.set(key, c);
  }
  return [...best.values()];
}

/** Ratings to base scores. fit counts confident per-need hits weighted by how central the need is; terms Jev rated count by how likely the term was the right one. */
export function rankBase(args: {
  listings: { listing: Listing; found_by: string[] }[];
  listingScores: Map<string, ListingScore>;
  itemWeights: Map<string, number>;
  termRank: Map<string, number>;
  cfg?: Cfg;
}): Ranked[] {
  const cfg = args.cfg ?? LED_CONFIG;
  const out: Ranked[] = [];
  for (const { listing, found_by } of args.listings) {
    if (listing.grade === "F") continue;
    const s = args.listingScores.get(listing.slug);
    if (!s) continue; // unscored: never ranked on trust alone
    const hits = Object.entries(s.per_item).filter(([, p]) => p >= JEV_THRESHOLDS.signal);
    const cover = noisyOr(hits.map(([id, p]) => p * itemFactor(args.itemWeights.get(id) ?? 0.5, cfg)));
    const fit = Math.max(s.useful, cover);
    const term = Math.max(0, ...Object.entries(s.per_term ?? {}).map(([text, p]) => p * (args.termRank.get(text) ?? 0)));
    const trust = trustOf(listing);
    const final = fit * (cfg.termFloor + cfg.termWeight * term) * (cfg.trustFloor + cfg.trustWeight * trust);
    out.push({ listing, found_by, p_query: term, fit, trust, final, covers: hits.map(([id]) => id), weak: fit < cfg.weakFit });
  }
  return out.sort((a, b) => b.final - a.final || a.listing.slug.localeCompare(b.listing.slug));
}

/** Mean chance each shortlisted result beats the others, from Jev's head-to-head answers. */
export function pairScores(slugs: string[], results: { a: string; b: string; p_a: number }[]): Map<string, number> {
  const wins = new Map<string, number[]>(slugs.map((s) => [s, []]));
  for (const r of results) {
    wins.get(r.a)?.push(r.p_a);
    wins.get(r.b)?.push(1 - r.p_a);
  }
  return new Map(slugs.map((s) => [s, wins.get(s)!.length ? wins.get(s)!.reduce((x, y) => x + y, 0) / wins.get(s)!.length : 0.5]));
}

/** Shortlist by base score (best for every need kept), reorder by head-to-head wins, then cut the tail. */
export function finalize(ranked: Ranked[], pair: Map<string, number> | null, cfg: Cfg = LED_CONFIG): Ranked[] {
  const short = withEachNeed(ranked, cfg.shortlist);
  const scored = short
    .map((r) => {
      const p = pair?.get(r.listing.slug);
      return p === undefined ? r : { ...r, pair: p, final: r.final * (cfg.pairFloor + cfg.pairWeight * p) };
    })
    .sort((a, b) => b.final - a.final || a.listing.slug.localeCompare(b.listing.slug));
  const strong = scored.filter((r) => r.final >= cfg.keepFloor);
  const kept = strong.length >= cfg.minKeep ? strong : scored.slice(0, cfg.minKeep);
  return kept.slice(0, Math.max(cfg.top, 0));
}

export interface DiscoverLedResult extends DiscoverResult {
  itemScores: ItemScore[];
  pickedQueries: PickedQuery[];
  /** Needs Jev rated non-central: no queries were written into the search for them. */
  dropped_items: string[];
  /** Central needs that no returned result covers with confidence. */
  gaps: string[];
  /** Head-to-head comparisons asked (each in both orders). */
  pairs_asked: number;
}

export async function discoverLed(args: { text: string; claude: Interpreter; jev: LedScorer; fetch?: FetchLike; cfg?: Cfg }): Promise<DiscoverLedResult> {
  const cfg = args.cfg ?? LED_CONFIG;
  const interpretation = await args.claude.interpret(args.text);
  const { items, queries } = interpretation;

  // 2. Jev weighs the needs and rates the queries; code ranks and budgets them.
  const [itemScores, queryScores] = await Promise.all([args.jev.scoreItems(items), args.jev.scoreQueries(items, queries)]);
  const itemOf = (id: string) => queries.find((q) => q.id === id)!.item_id;
  const { picked, dropped_items } = pickQueriesLed({ queryScores, itemScores, itemOf, cfg });
  const uncovered_items = items.filter((it) => !picked.some((k) => itemOf(k.query_id) === it.id)).map((it) => it.id);

  // 3. One failed query must not sink the run; it is reported and the rest carry on.
  const searched: DiscoverResult["searched"] = [];
  const bySlug = new Map<string, { listing: Listing; found_by: string[] }>();
  await Promise.all(
    picked.map(async (k) => {
      const q = queries.find((x) => x.id === k.query_id)!;
      try {
        const found = await searchMarket(q.text, { limit: cfg.resultsPerQuery, fetch: args.fetch });
        searched.push({ query_id: q.id, text: q.text, found: found.length });
        for (const l of found) {
          const cur = bySlug.get(l.slug);
          if (cur) cur.found_by.push(q.id);
          else bySlug.set(l.slug, { listing: l, found_by: [q.id] });
        }
      } catch (e) {
        searched.push({ query_id: q.id, text: q.text, found: 0, error: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  searched.sort((a, b) => a.query_id.localeCompare(b.query_id, undefined, { numeric: true }));

  // 4. Jev rates each result against the needs and against the best search terms that found it.
  const rankOf = new Map(picked.map((p) => [p.query_id, p.rank_score]));
  const textOf = new Map(queries.map((q) => [q.id, q.text]));
  const candidates = dedupe([...bySlug.values()]);
  const withTerms = candidates.map((c) => ({
    ...c,
    terms: [...new Set(c.found_by.sort((a, b) => (rankOf.get(b) ?? 0) - (rankOf.get(a) ?? 0)).slice(0, cfg.termsPerListing).map((id) => textOf.get(id)!))],
  }));
  const listingScores = withTerms.length ? await args.jev.scoreListingsLed(items, withTerms.map((c) => ({ listing: c.listing, terms: c.terms }))) : [];
  const base = rankBase({
    listings: candidates,
    listingScores: new Map(listingScores.map((s) => [s.slug, s])),
    itemWeights: new Map(itemScores.map((s) => [s.item_id, s.weight])),
    termRank: new Map(picked.map((p) => [textOf.get(p.query_id)!, p.rank_score])),
    cfg,
  });

  // 5. Jev compares the shortlist head to head; code combines the wins with the ratings.
  const short = withEachNeed(base, cfg.shortlist);
  const pairList: [Listing, Listing][] = short.flatMap((x, i) => short.slice(i + 1).map((y): [Listing, Listing] => [x.listing, y.listing]));
  const pair = cfg.usePairs && pairList.length ? pairScores(short.map((r) => r.listing.slug), await args.jev.comparePairs(items, pairList)) : null;
  const ranked = finalize(base, pair, cfg);

  const gaps = items.filter((it) => !dropped_items.includes(it.id) && !ranked.some((r) => r.covers.includes(it.id))).map((it) => it.id);

  // 6. Words are optional; the ranking stands without them.
  let explanations = new Map<string, string>();
  if (args.claude.explain) {
    try {
      explanations = await args.claude.explain(items, ranked);
    } catch {
      // ignore
    }
  }
  return { interpretation, queryScores, searched, ranked, explanations, uncovered_items, itemScores, pickedQueries: picked, dropped_items, gaps, pairs_asked: cfg.usePairs ? pairList.length : 0 };
}
