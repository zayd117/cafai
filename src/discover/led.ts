// The Jev-led loop: Claude writes the words, Jev weighs, rates and orders at every step, code does the arithmetic and the fetching.
//   1. Claude interprets the description into needs (items) and search queries.
//   2. Jev weighs the needs (how central each is) and rates every query; code picks the best queries overall, not a fixed few per need.
//   3. Code searches mcp.market with those queries (a plain HTTP call: a model adds cost and risk there, nothing else).
//   4. Jev screens every result with one question, then rates the best per need and overall (and, optionally, against the search terms that found it).
//   5. Jev orders the shortlist with one pick-the-best question asked twice (list reversed the second time); code combines that with the ratings and cuts the list.
// Defaults (tuned on the known-item test, docs/DISCOVER_BAKEOFF.md): results are screened with one question and only the best 20 get the
// full set; each result's text goes once per request; the term questions are off. Same accuracy as the first version, about a third of the tokens.
// Before the list goes out, the handshake checks each shown result against the searches that found it (verifyShown); the full handshake
// inside the ranking and the by-need / hybrid layouts are switches (docs/JEV_USAGE.md has what each did in the tests).
//   6. Claude explains the picks (same as the classic loop).
// Every threshold here is a PLACEHOLDER (same status as JEV_THRESHOLDS, REGISTER A-040/A-043): tune on labelled cases, then freeze.
import { JEV_THRESHOLDS } from "@/engine/providers/jev";
import { noisyOr, trustOf, withEachNeed } from "./rank";
import type { DiscoverResult, Interpreter } from "./run";
import { searchMarket, type FetchLike } from "./search";
import type { HandshakePath, Interpretation, Item, ItemScore, Listing, ListingScore, QueryScore, Ranked } from "./types";

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
  /**
   * Search terms asked about per result (the best-scoring ones that found it). Off by default: in the known-item test the term
   * questions changed nothing measurable and cost about 13% of the rating tokens. 2 / 0.7 / 0.3 turns them back on.
   */
  termsPerListing: 0,
  /** base = fit x (termFloor + termWeight x term) x (trustFloor + trustWeight x trust). Trust only nudges. */
  termFloor: 1,
  termWeight: 0,
  trustFloor: 0.8,
  trustWeight: 0.2,
  /**
   * How Jev orders the shortlist: "pairs" = every pair head to head, both orders (n(n-1) questions); "choice" = one pick-the-best
   * question over the whole shortlist, asked twice with the order reversed (2 questions); "both" = the two averaged; "none" = ratings only.
   */
  order: "choice" as "pairs" | "choice" | "both" | "none",
  /** Send each result's text once per request (in state) instead of inside every question about it. */
  compact: true,
  /** Per-need fit as a yes/no probability ("noul") or a 0-3 graded score scaled to 0-1 ("score"). */
  fit: "noul" as "noul" | "score",
  /** Screen every result with one quick question first and ask the full set only about the best this many (0 = full set for all). */
  screen: 20,
  /** Results Jev orders at the end. */
  shortlist: 8,
  /** final = base x (pairFloor + pairWeight x standing). Jev's ordering dominates when ratings tie near 100%. */
  pairFloor: 0.4,
  pairWeight: 0.6,
  /** Base score below this is cut, but at least minKeep results stay (flagged weak). */
  keepFloor: 0.3,
  minKeep: 3,
  top: 8,
  weakFit: 0.3,
  /**
   * The handshake. On: each result is also asked "does it do what this search looked for?" for the best search of each need that found it,
   * and a result counts as verified for a need only as far as both checks agree (the lower of result-fits-search and result-fits-need).
   * A result that does a need but was found by another need's search counts its fit times `unverified`. Needs termsPerListing >= 1.
   */
  handshake: false,
  unverified: 0.85,
  /** Flat layout with the handshake on: base x (hsFloor + hsWeight x the result's strongest path). */
  hsFloor: 0.6,
  hsWeight: 0.4,
  /**
   * "flat": one list, ordered by an overall pick-the-best. "by-need": each need gets its own verified candidates, Jev picks the best within
   * each need (both orders), and the list takes turns across needs so one crowded need cannot fill it. "hybrid": the overall pick-the-best
   * winner first, then turns across the needs; `groups` carries each need's picks either way.
   */
  layout: "flat" as "flat" | "by-need" | "hybrid",
  /** A result counts as a match for a need at or above this. */
  needVerify: 0.5,
  /** Candidates Jev compares per need, and picks kept per need. */
  perNeedPool: 5,
  perNeed: 3,
  /**
   * Final handshake on what is shown: before the list goes out, Jev checks each shown result against the best search of each need that
   * found it. A result whose strongest path is below needVerify moves below the ones that pass and is flagged weak. Cheaper than the full
   * handshake (only the shown results are asked).
   */
  verifyShown: true,
  /** Second search: a need nothing matches gets its best unused searches (already written and rated), up to this many. 0 = off. */
  gapQueries: 0,
};
type Cfg = typeof LED_CONFIG;

export interface LedScorer {
  scoreItems(items: Item[]): Promise<ItemScore[]>;
  scoreQueries(items: Interpretation["items"], queries: Interpretation["queries"]): Promise<QueryScore[]>;
  scoreListingsLed(items: Item[], cands: { listing: Listing; terms: string[] }[], opts?: { compact?: boolean; fit?: "noul" | "score" }): Promise<ListingScore[]>;
  scoreTerms(items: Item[], cands: { listing: Listing; terms: string[] }[], opts?: { compact?: boolean }): Promise<Map<string, Record<string, number>>>;
  comparePairs(items: Item[], pairs: [Listing, Listing][]): Promise<{ a: string; b: string; p_a: number }[]>;
  rankList(items: Item[], listings: Listing[]): Promise<Map<string, number>>;
  screenListings(items: Item[], listings: Listing[], opts?: { compact?: boolean }): Promise<Map<string, number>>;
  rankPerNeed(items: Item[], groups: { item: Item; listings: Listing[] }[]): Promise<Map<string, Map<string, number>>>;
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

/** Each result's share of the pick-the-best vote, scaled so the favourite is 1. */
export function scaleToTop(shares: Map<string, number>): Map<string, number> {
  const top = Math.max(0, ...shares.values());
  return new Map([...shares].map(([slug, v]) => [slug, top > 0 ? v / top : 0.5]));
}

/** Shortlist by base score (best for every need kept), reorder by Jev's standing, then cut the tail. */
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

/**
 * The handshake between what was searched for and what came back. For each need: through every search for that need that found the
 * result, the weaker of "the result does what the search looked for" and "the result does what the need asks" (only the need check when
 * the search check was not asked); a result no search for that need found counts its need fit times `unverified`. Returns the best per
 * need and the strongest path overall.
 */
export function handshake(s: ListingScore, found_by: string[], queryInfo: Map<string, { text: string; need: string; score: number }>, cfg: Cfg = LED_CONFIG): { match: Record<string, number>; path: HandshakePath | undefined } {
  const match: Record<string, number> = {};
  let best: HandshakePath | undefined;
  for (const [need, fit] of Object.entries(s.per_item)) {
    let path: HandshakePath = { need, query: null, query_fits_need: 0, result_fits_query: null, result_fits_need: fit, strength: fit * cfg.unverified };
    for (const id of found_by) {
      const q = queryInfo.get(id);
      if (!q || q.need !== need) continue;
      const term = s.per_term?.[q.text];
      const strength = term === undefined ? fit : Math.min(term, fit);
      if (path.query === null || strength > path.strength) path = { need, query: q.text, query_fits_need: q.score, result_fits_query: term ?? null, result_fits_need: fit, strength };
    }
    match[need] = path.strength;
    if (!best || path.strength > best.strength) best = path;
  }
  return { match, path: best };
}

/** Candidates per need: results verified for it at or above needVerify, strongest first, at most perNeedPool. */
export function needPools(rated: Ranked[], needs: string[], cfg: Cfg = LED_CONFIG): Map<string, Ranked[]> {
  return new Map(
    needs.map((n) => [
      n,
      rated
        .filter((r) => (r.match?.[n] ?? 0) >= cfg.needVerify)
        .sort((a, b) => b.match![n]! * (cfg.trustFloor + cfg.trustWeight * b.trust) - a.match![n]! * (cfg.trustFloor + cfg.trustWeight * a.trust) || b.fit - a.fit || a.listing.slug.localeCompare(b.listing.slug))
        .slice(0, cfg.perNeedPool),
    ]),
  );
}

/** Take turns across needs (most promising need first): each need's best, then each need's second, and so on. A result shows once. */
export function interleave(groups: { need: string; priority: number; picks: Ranked[] }[], top: number): Ranked[] {
  const order = [...groups].sort((a, b) => b.priority - a.priority || a.need.localeCompare(b.need));
  const out: Ranked[] = [];
  const seen = new Set<string>();
  for (let round = 0; out.length < top && order.some((g) => g.picks.length > round); round++) {
    for (const g of order) {
      const r = g.picks[round];
      if (!r || seen.has(r.listing.slug)) continue;
      seen.add(r.listing.slug);
      out.push(r);
      if (out.length >= top) break;
    }
  }
  return out;
}

export interface NeedGroup {
  need: string;
  /** good: a match at or above 0.7; weak: only matches between needVerify and 0.7; none: nothing matched, even after the second search. */
  status: "good" | "weak" | "none";
  picks: Ranked[];
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
  /** Every result Jev rated, with its ratings (for evaluation and debugging). */
  listingScores: ListingScore[];
  /** Optional Jev steps that failed and were skipped ("screen", "order"); the ranking stands on the ratings. Empty when all ran. */
  degraded: string[];
  /** Where results went: every candidate after merging duplicates, those rated in full, the order the ratings gave, the shortlist Jev ordered. */
  trace: { candidates: string[]; rated: string[]; base: string[]; shortlist: string[] };
  /** By-need layout: each need's picks and whether anything matched it. Empty in the flat layout. */
  groups: NeedGroup[];
  /** Searches run in the second round for needs nothing matched. */
  gap_searched: string[];
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

  const weightOf = new Map(itemScores.map((s) => [s.item_id, s.weight]));
  const scoreOf = new Map(queryScores.map((s) => [s.query_id, s.score]));
  const rankScore = (id: string) => (scoreOf.get(id) ?? 0) * itemFactor(weightOf.get(itemOf(id)) ?? 0, cfg);
  const textOf = new Map(queries.map((q) => [q.id, q.text]));

  // 3. One failed query must not sink the run; it is reported and the rest carry on.
  const searched: DiscoverResult["searched"] = [];
  const bySlug = new Map<string, { listing: Listing; found_by: string[] }>();
  const search = (ids: string[]) =>
    Promise.all(
      ids.map(async (id) => {
        const q = queries.find((x) => x.id === id)!;
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
  await search(picked.map((p) => p.query_id));

  // 4. Jev rates each result against the needs (and, for the handshake, against the searches that found it).
  /** The best search of each need that found a result, best first: the paths the handshake checks. */
  const pathTerms = (found_by: string[], max: number): string[] => {
    const bestPerNeed = new Map<string, string>();
    for (const id of [...found_by].sort((a, b) => rankScore(b) - rankScore(a))) if (!bestPerNeed.has(itemOf(id))) bestPerNeed.set(itemOf(id), id);
    return [...bestPerNeed.values()].slice(0, max).map((id) => textOf.get(id)!);
  };
  const termsFor = (found_by: string[]): string[] =>
    cfg.handshake
      ? pathTerms(found_by, Math.max(1, cfg.termsPerListing))
      : [...new Set([...found_by].sort((a, b) => rankScore(b) - rankScore(a)).slice(0, cfg.termsPerListing).map((id) => textOf.get(id)!))];
  const withTerms = (cs: { listing: Listing; found_by: string[] }[]) => cs.map((c) => ({ ...c, terms: termsFor(c.found_by) }));
  const rate = (cs: { listing: Listing; found_by: string[] }[]) =>
    cs.length ? args.jev.scoreListingsLed(items, withTerms(cs).map((c) => ({ listing: c.listing, terms: c.terms })), { compact: cfg.compact, fit: cfg.fit }) : Promise.resolve([] as ListingScore[]);
  let candidates = dedupe([...bySlug.values()]);
  // The screen and the final ordering are optional: if either request fails, the loop carries on without it and says so.
  const degraded: string[] = [];
  let toRate = candidates;
  if (cfg.screen > 0 && candidates.length > cfg.screen) {
    try {
      const quick = await args.jev.screenListings(items, candidates.map((c) => c.listing), { compact: cfg.compact });
      toRate = [...candidates].sort((a, b) => (quick.get(b.listing.slug) ?? 0) - (quick.get(a.listing.slug) ?? 0) || a.listing.slug.localeCompare(b.listing.slug)).slice(0, cfg.screen);
    } catch {
      degraded.push("screen"); // rate them all instead
    }
  }
  let listingScores = await rate(toRate);

  // 4b. Second search: a need nothing matched gets its best unused searches (already written by Claude and rated by Jev).
  const gap_searched: string[] = [];
  if (cfg.gapQueries > 0) {
    const lacking = items.filter((it) => !dropped_items.includes(it.id) && !listingScores.some((s) => (s.per_item[it.id] ?? 0) >= cfg.needVerify));
    const used = new Set(picked.map((p) => p.query_id));
    const extra = lacking.flatMap((it) =>
      queries
        .filter((q) => q.item_id === it.id && !used.has(q.id) && (scoreOf.get(q.id) ?? 0) >= cfg.minQueryScore)
        .sort((a, b) => rankScore(b.id) - rankScore(a.id))
        .slice(0, cfg.gapQueries)
        .map((q) => q.id),
    );
    if (extra.length) {
      const before = new Set(bySlug.keys());
      await search(extra);
      gap_searched.push(...extra.map((id) => textOf.get(id)!));
      const seenText = new Set(candidates.map((c) => norm(c.listing.description)));
      const fresh = dedupe([...bySlug.values()].filter((c) => !before.has(c.listing.slug))).filter((c) => !seenText.has(norm(c.listing.description)));
      if (fresh.length) {
        listingScores = [...listingScores, ...(await rate(fresh))];
        candidates = [...candidates, ...fresh];
        toRate = [...toRate, ...fresh];
      }
    }
  }
  searched.sort((a, b) => a.query_id.localeCompare(b.query_id, undefined, { numeric: true }));

  const scoreMap = new Map(listingScores.map((s) => [s.slug, s]));
  const queryInfo = new Map(queries.map((q) => [q.id, { text: q.text, need: q.item_id, score: scoreOf.get(q.id) ?? 0 }]));
  let base = rankBase({
    listings: candidates,
    listingScores: scoreMap,
    itemWeights: weightOf,
    termRank: new Map(picked.map((p) => [textOf.get(p.query_id)!, p.rank_score])),
    cfg,
  }).map((r) => ({ ...r, ...handshake(scoreMap.get(r.listing.slug)!, r.found_by, queryInfo, cfg) }));
  if (cfg.handshake && cfg.layout === "flat") {
    base = base
      .map((r) => ({ ...r, final: r.final * (cfg.hsFloor + cfg.hsWeight * (r.path?.strength ?? 0)) }))
      .sort((a, b) => b.final - a.final || a.listing.slug.localeCompare(b.listing.slug));
  }

  // 5. Order: the flat pick-the-best over a shortlist, per-need picks taking turns, or the flat winner first and then the per-need turns.
  const groups: NeedGroup[] = [];
  const flat = async () => {
    const short = withEachNeed(base, cfg.shortlist);
    const slugs = short.map((r) => r.listing.slug);
    const pairList: [Listing, Listing][] = short.flatMap((x, i) => short.slice(i + 1).map((y): [Listing, Listing] => [x.listing, y.listing]));
    const usePairs = (cfg.order === "pairs" || cfg.order === "both") && pairList.length > 0;
    const useChoice = (cfg.order === "choice" || cfg.order === "both") && short.length > 1;
    const [pairs, picks] = await Promise.all([
      usePairs ? args.jev.comparePairs(items, pairList).then((r) => pairScores(slugs, r)) : Promise.resolve(null),
      useChoice ? args.jev.rankList(items, short.map((r) => r.listing)).then(scaleToTop) : Promise.resolve(null),
    ]).catch(() => {
      degraded.push("order"); // keep the order the ratings give
      return [null, null] as const;
    });
    const standing = pairs && picks ? new Map(slugs.map((s) => [s, (pairs.get(s)! + picks.get(s)!) / 2])) : (pairs ?? picks);
    return { ranked: finalize(base, standing, cfg), slugs, pairsAsked: usePairs ? pairList.length : 0 };
  };
  const byNeed = async () => {
    // Each need's verified candidates; Jev picks the best within each need; the list takes turns across needs.
    const needs = items.filter((it) => !dropped_items.includes(it.id));
    const pools = needPools(base, needs.map((it) => it.id), cfg);
    let shares = new Map<string, Map<string, number>>();
    try {
      shares = await args.jev.rankPerNeed(items, needs.filter((it) => pools.get(it.id)!.length > 0).map((it) => ({ item: it, listings: pools.get(it.id)!.map((r) => r.listing) })));
    } catch {
      degraded.push("per-need order");
    }
    const withinNeed = needs.map((it) => {
      const pool = pools.get(it.id)!;
      const share = shares.get(it.id) ? scaleToTop(shares.get(it.id)!) : null;
      const picks = pool
        .map((r) => {
          const own = r.match![it.id]! * (cfg.trustFloor + cfg.trustWeight * r.trust);
          const p = share?.get(r.listing.slug);
          return { ...r, pair: p, final: p === undefined ? own : own * (cfg.pairFloor + cfg.pairWeight * p) };
        })
        .sort((a, b) => b.final - a.final || a.listing.slug.localeCompare(b.listing.slug))
        .slice(0, cfg.perNeed);
      const top = pool.length ? Math.max(...pool.map((r) => r.match![it.id]!)) : 0;
      groups.push({ need: it.id, status: top >= 0.7 ? "good" : top >= cfg.needVerify ? "weak" : "none", picks });
      return { need: it.id, priority: itemFactor(weightOf.get(it.id) ?? 0.5, cfg) * (picks[0]?.final ?? 0), picks };
    });
    return { turns: withinNeed, slugs: [...new Set(withinNeed.flatMap((g) => g.picks.map((r) => r.listing.slug)))] };
  };
  let ranked: Ranked[];
  let slugs: string[];
  let pairsAsked = 0;
  if (cfg.layout === "flat") {
    ({ ranked, slugs, pairsAsked } = await flat());
  } else if (cfg.layout === "by-need") {
    const b = await byNeed();
    ranked = interleave(b.turns, cfg.top);
    slugs = b.slugs;
  } else {
    const [f, b] = await Promise.all([flat(), byNeed()]);
    const lead = f.ranked[0];
    const rest = interleave(b.turns.map((g) => ({ ...g, picks: g.picks.filter((r) => r.listing.slug !== lead?.listing.slug) })), cfg.top - (lead ? 1 : 0));
    ranked = lead ? [lead, ...rest] : rest;
    slugs = [...new Set([...(lead ? [lead.listing.slug] : []), ...b.slugs])];
    pairsAsked = f.pairsAsked;
  }

  // 5b. Final handshake on what is shown: check each shown result against the searches that found it; failures drop below passes.
  if (cfg.verifyShown && !cfg.handshake) {
    const shown = [...new Map([...ranked, ...groups.flatMap((g) => g.picks)].map((r) => [r.listing.slug, r])).values()];
    try {
      const terms = await args.jev.scoreTerms(items, shown.map((r) => ({ listing: r.listing, terms: pathTerms(r.found_by, 3) })), { compact: cfg.compact });
      const recheck = (r: Ranked): Ranked => {
        const s = scoreMap.get(r.listing.slug);
        if (!s) return r;
        const h = handshake({ ...s, per_term: { ...(s.per_term ?? {}), ...(terms.get(r.listing.slug) ?? {}) } }, r.found_by, queryInfo, cfg);
        return { ...r, ...h, weak: r.weak || (h.path?.strength ?? 0) < cfg.needVerify };
      };
      const passFirst = (rs: Ranked[]) => {
        const c = rs.map(recheck);
        return [...c.filter((r) => !r.weak), ...c.filter((r) => r.weak)];
      };
      ranked = passFirst(ranked);
      for (const g of groups) g.picks = passFirst(g.picks);
    } catch {
      degraded.push("verify");
    }
  }

  const gaps =
    cfg.layout !== "flat"
      ? groups.filter((g) => g.status === "none").map((g) => g.need)
      : items.filter((it) => !dropped_items.includes(it.id) && !ranked.some((r) => r.covers.includes(it.id))).map((it) => it.id);

  // 6. Words are optional; the ranking stands without them.
  let explanations = new Map<string, string>();
  if (args.claude.explain) {
    try {
      explanations = await args.claude.explain(items, ranked);
    } catch {
      // ignore
    }
  }
  return {
    interpretation, queryScores, searched, ranked, explanations, uncovered_items, itemScores, pickedQueries: picked, dropped_items, gaps,
    pairs_asked: pairsAsked, listingScores, degraded, groups, gap_searched,
    trace: { candidates: candidates.map((c) => c.listing.slug), rated: toRate.map((c) => c.listing.slug), base: base.map((r) => r.listing.slug), shortlist: slugs },
  };
}
