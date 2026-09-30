// Claude as the rater in both passes: the "Claude by itself" arm of the discovery bake-off (docs/DISCOVER_BAKEOFF.md).
// It answers the same questions Jev is asked (JevScorer.queryQuestions / listingQuestions) as probabilities in one JSON
// reply per batch, so the only difference between the arms is who rates. Search and ranking stay in code for both.
import { fence } from "@/engine/prompts";
import { DATA_RULE, type DiscoverClaude } from "./claude";
import type { Item, Listing, ListingScore, Query, QueryScore } from "./types";

/** Same batch size as JevScorer, so request counts are comparable between arms. */
const LISTING_BATCH = 5;

export const RATE_QUERIES_SYSTEM = `You rate search queries that were written for a tool directory. You never search and never write queries.
${DATA_RULE}
For every query return two probabilities between 0 and 1:
- faithful: the chance the query looks for what its target item describes.
- drift: the chance the query asks for something the project described in items does not need.
Judge only from the items and the query text. Return every query id given, once.`;

export const RATE_LISTINGS_SYSTEM = `You rate tool listings against what a project needs. You never search and never recommend on your own.
${DATA_RULE}
For every candidate return:
- per_item: for each item id, the probability between 0 and 1 that the tool in the candidate does what that item needs.
- useful: the probability between 0 and 1 that the project described in items would benefit from the tool.
Judge only from the listing text given. Return every slug given, once.`;

const p = { type: "number" } as const;
const queriesSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores"],
  properties: {
    scores: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["query_id", "faithful", "drift"], properties: { query_id: { type: "string" }, faithful: p, drift: p } },
    },
  },
} as const;
const listingsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scores"],
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slug", "per_item", "useful"],
        properties: {
          slug: { type: "string" },
          per_item: { type: "array", items: { type: "object", additionalProperties: false, required: ["item_id", "p"], properties: { item_id: { type: "string" }, p } } },
          useful: p,
        },
      },
    },
  },
} as const;

/** The exact user turns the rater receives, shared by the API arm and the subagent task export. */
export const queriesUser = (items: Item[], queries: Query[]) =>
  [fence("items", items.map((it) => ({ id: it.id, text: it.text }))), fence("queries", queries.map((q) => ({ query_id: q.id, target_item_id: q.item_id, text: q.text })))].join("\n");
export const listingsUser = (items: Item[], batch: Listing[]) =>
  [
    fence("items", items.map((it) => ({ id: it.id, text: it.text }))),
    fence("candidates", batch.map((l) => ({ slug: l.slug, name: l.title ?? l.name, description: l.description, category: l.category }))),
  ].join("\n");

type Recorded = {
  queries: { query_id: string; faithful: number; drift: number }[];
  listings: { slug: string; per_item: { item_id: string; p: number }[]; useful: number }[];
};

/**
 * A stand-in for the Claude client that replays ratings a person or a subagent wrote down. It has no usage (nothing
 * was metered), and it throws when asked about a query or listing that was never rated, so a gap is an error, not a zero.
 */
export function recordedClaude(rec: Recorded, id: string) {
  return {
    id,
    usage: [],
    call: async (system: string, user: string): Promise<unknown> => {
      const need = (re: RegExp, have: Set<string>, what: string) => {
        const missing = [...user.matchAll(re)].map((m) => m[1]!).filter((k) => !have.has(k));
        if (missing.length) throw new Error(`no recorded rating for ${what}: ${missing.join(", ")}`);
      };
      if (system === RATE_QUERIES_SYSTEM) {
        need(/"query_id": "([^"]+)"/g, new Set(rec.queries.map((q) => q.query_id)), "query");
        return { scores: rec.queries };
      }
      if (system === RATE_LISTINGS_SYSTEM) {
        need(/"slug": "([^"]+)"/g, new Set(rec.listings.map((l) => l.slug)), "listing");
        return { scores: rec.listings };
      }
      throw new Error("recorded ratings: unknown prompt");
    },
  } as unknown as Pick<DiscoverClaude, "call" | "usage" | "id">;
}

/** Model numbers are checked in code: anything missing or out of range is clamped, and missing means "no signal". */
const unit = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

export class ClaudeScorer {
  /** Pass a DiscoverClaude used for scoring only, so its usage list is this arm's usage. */
  constructor(private claude: Pick<DiscoverClaude, "call" | "usage" | "id">) {}

  get id() {
    return `${this.claude.id} (as rater)`;
  }
  get usage() {
    return this.claude.usage;
  }

  async scoreQueries(items: Item[], queries: Query[]): Promise<QueryScore[]> {
    if (!queries.length) return [];
    const out = (await this.claude.call(RATE_QUERIES_SYSTEM, queriesUser(items, queries), queriesSchema)) as { scores?: { query_id: string; faithful: number; drift: number }[] };
    const byId = new Map((out.scores ?? []).map((s) => [s?.query_id, s]));
    return queries.map((q) => {
      const s = byId.get(q.id);
      const faithful = unit(s?.faithful, 0);
      const drift = unit(s?.drift, 1);
      return { query_id: q.id, faithful, drift, score: faithful * (1 - drift) };
    });
  }

  async scoreListings(items: Item[], listings: Listing[]): Promise<ListingScore[]> {
    const batches: Listing[][] = [];
    for (let i = 0; i < listings.length; i += LISTING_BATCH) batches.push(listings.slice(i, i + LISTING_BATCH));
    const scored = await Promise.all(
      batches.map(async (batch) => {
        const out = (await this.claude.call(RATE_LISTINGS_SYSTEM, listingsUser(items, batch), listingsSchema)) as {
          scores?: { slug: string; per_item?: { item_id: string; p: number }[]; useful: number }[];
        };
        const bySlug = new Map((out.scores ?? []).map((s) => [s?.slug, s]));
        return batch.map((l): ListingScore => {
          const s = bySlug.get(l.slug);
          const per = new Map((s?.per_item ?? []).map((x) => [x?.item_id, x?.p]));
          return { slug: l.slug, per_item: Object.fromEntries(items.map((it) => [it.id, unit(per.get(it.id), 0)])), useful: unit(s?.useful, 0) };
        });
      }),
    );
    return scored.flat();
  }
}
