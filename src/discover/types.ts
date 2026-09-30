// Discovery loop (exploratory, outside the closed-world engine): Claude interprets, Jev scores the queries, code searches
// mcp.market, Jev scores the results, code ranks, Claude explains. Every model output is checked before use.

export interface Item {
  id: string;
  text: string;
}

/** A search query Claude wrote for one item. Jev scores it; it never writes one. */
export interface Query {
  id: string;
  item_id: string;
  text: string;
}

export interface Interpretation {
  items: Item[];
  queries: Query[];
}

/** One mcp.market listing, reduced to the fields we use. Third-party text: capped and treated as data. */
export interface Listing {
  slug: string;
  name: string;
  title: string | null;
  description: string;
  grade: string | null;
  grade_score: number | null;
  certified: boolean;
  category: string | null;
  price_micros: number;
  url: string;
}

export interface QueryScore {
  query_id: string;
  /** P(the query looks for what its item needs), from Jev. */
  faithful: number;
  /** P(the query asks for something the project does not need), from Jev. */
  drift: number;
  /** faithful x (1 - drift). */
  score: number;
}

export interface ListingScore {
  slug: string;
  /** P(this server does what item k needs), per item id. */
  per_item: Record<string, number>;
  /** P(the project would benefit from this server), the holistic question. */
  useful: number;
}

export interface Ranked {
  listing: Listing;
  /** Query ids that retrieved it. */
  found_by: string[];
  p_query: number;
  fit: number;
  trust: number;
  final: number;
  /** Item ids with per-item probability at or above the signal threshold. */
  covers: string[];
  weak: boolean;
}

export interface Usage {
  model: string;
  input_tokens: number;
  output_tokens: number;
}
