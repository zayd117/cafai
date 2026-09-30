// The loop: interpret (Claude) -> score queries (Jev) -> search (code) -> score results (Jev) -> rank (code) -> explain (Claude).
import { DISCOVER_CONFIG, pickQueries, rank } from "./rank";
import { searchMarket, type FetchLike } from "./search";
import type { Interpretation, Listing, ListingScore, QueryScore, Ranked } from "./types";

export interface Interpreter {
  interpret(text: string): Promise<Interpretation>;
  explain?(items: { text: string }[], picks: Ranked[]): Promise<Map<string, string>>;
}

export interface Scorer {
  scoreQueries(items: Interpretation["items"], queries: Interpretation["queries"]): Promise<QueryScore[]>;
  scoreListings(items: Interpretation["items"], listings: Listing[]): Promise<ListingScore[]>;
}

export interface DiscoverResult {
  interpretation: Interpretation;
  queryScores: QueryScore[];
  /** Queries that cleared the Jev floor and were searched. */
  searched: { query_id: string; text: string; found: number; error?: string }[];
  ranked: Ranked[];
  explanations: Map<string, string>;
  /** Items no kept query targeted, so nothing searched for them. */
  uncovered_items: string[];
}

export async function discover(args: { text: string; claude: Interpreter; jev: Scorer; fetch?: FetchLike }): Promise<DiscoverResult> {
  const cfg = DISCOVER_CONFIG;
  const interpretation = await args.claude.interpret(args.text);
  const { items, queries } = interpretation;

  const queryScores = await args.jev.scoreQueries(items, queries);
  const itemOf = (id: string) => queries.find((q) => q.id === id)!.item_id;
  const kept = pickQueries(queryScores, itemOf, cfg);
  const uncovered_items = items.filter((it) => !kept.some((k) => itemOf(k.query_id) === it.id)).map((it) => it.id);

  // One failed query must not sink the run; it is reported and the rest carry on.
  const searched: DiscoverResult["searched"] = [];
  const bySlug = new Map<string, { listing: Listing; found_by: string[] }>();
  await Promise.all(
    kept.map(async (k) => {
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

  const candidates = [...bySlug.values()];
  const listingScores = candidates.length ? await args.jev.scoreListings(items, candidates.map((c) => c.listing)) : [];
  const ranked = rank({
    listings: candidates,
    queryScores: new Map(queryScores.map((s) => [s.query_id, s.score])),
    listingScores: new Map(listingScores.map((s) => [s.slug, s])),
    cfg,
  });

  let explanations = new Map<string, string>();
  if (args.claude.explain) {
    try {
      explanations = await args.claude.explain(items, ranked);
    } catch {
      // Words are optional; the ranking stands without them.
    }
  }
  return { interpretation, queryScores, searched, ranked, explanations, uncovered_items };
}
