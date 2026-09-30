// Jev as the rater in both passes: yes/no probabilities about text we hand it. It never searches and never writes.
// Same rules as the decision provider (src/engine/providers/jev.ts): structured state only (the read-back items, never
// the raw description), one atomic question per number, code turns the probabilities into scores.
import { TypeSafeClient, noul, type Fetch, type Questions } from "@typesafe-ai/sdk";
import { JEV_DEFAULT_MODEL, jevKeyFrom } from "@/engine/providers/jev";
import type { Item, Listing, ListingScore, Query, QueryScore, Usage } from "./types";

export interface ScorerOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
  /** Tests only: stub transport. */
  fetch?: Fetch;
}

/** Listings per Jev request in pass 2, so no single request grows with the result count. */
const LISTING_BATCH = 5;

type Answers = Record<string, { noul?: number } | undefined>;

export class JevScorer {
  readonly id: string;
  private client: TypeSafeClient;
  private model: string;
  readonly usage: Usage[] = [];

  constructor(opts: ScorerOptions = {}) {
    this.model = opts.model ?? JEV_DEFAULT_MODEL;
    this.id = `jev:${this.model}`;
    this.client = new TypeSafeClient({
      apiKey: opts.apiKey ?? jevKeyFrom() ?? undefined,
      baseURL: opts.baseURL,
      defaultModel: this.model,
      timeout: opts.timeoutMs,
      fetch: opts.fetch,
      retry: { maxRetries: 2 },
      logLevel: "off",
    });
  }

  private async ask(items: Item[], questions: Questions): Promise<Answers> {
    const state = { items: items.map((it) => ({ id: it.id, text: it.text })) };
    const res = await this.client.systemOne({ state, questions, model: this.model });
    this.usage.push({ model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens });
    return res.answers as Answers;
  }

  /** Pass 1: is each query faithful to the item Claude says it targets, and does it drift into things not needed? */
  static queryQuestions(items: Item[], queries: Query[]): Questions {
    const q: Record<string, Questions[string]> = {};
    queries.forEach((query, i) => {
      const target = items.find((it) => it.id === query.item_id)?.text ?? "";
      q[`q${i}_faithful`] = noul({ query: query.text, target, question: "Does `query` look for what `target` describes?" });
      q[`q${i}_drift`] = noul({ query: query.text, question: "Does `query` ask for something the project described in `items` does not need?" });
    });
    return q as Questions;
  }

  async scoreQueries(items: Item[], queries: Query[]): Promise<QueryScore[]> {
    if (!queries.length) return [];
    const a = await this.ask(items, JevScorer.queryQuestions(items, queries));
    return queries.map((query, i) => {
      const faithful = a[`q${i}_faithful`]?.noul ?? 0;
      const drift = a[`q${i}_drift`]?.noul ?? 1;
      return { query_id: query.id, faithful, drift, score: faithful * (1 - drift) };
    });
  }

  /** Pass 2: per listing, one number per item plus one holistic "would this project benefit". */
  static listingQuestions(items: Item[], listings: Listing[]): Questions {
    const q: Record<string, Questions[string]> = {};
    listings.forEach((l, j) => {
      const candidate = { name: l.title ?? l.name, description: l.description, category: l.category };
      items.forEach((it, k) => {
        q[`l${j}_i${k}`] = noul({ candidate, item: it.text, question: "Does the server in `candidate` do what `item` needs?" });
      });
      q[`l${j}_useful`] = noul({ candidate, question: "Would the project described in `items` benefit from the server in `candidate`?" });
    });
    return q as Questions;
  }

  async scoreListings(items: Item[], listings: Listing[]): Promise<ListingScore[]> {
    const batches: Listing[][] = [];
    for (let i = 0; i < listings.length; i += LISTING_BATCH) batches.push(listings.slice(i, i + LISTING_BATCH));
    const scored = await Promise.all(
      batches.map(async (batch) => {
        const a = await this.ask(items, JevScorer.listingQuestions(items, batch));
        return batch.map((l, j): ListingScore => ({
          slug: l.slug,
          per_item: Object.fromEntries(items.map((it, k) => [it.id, a[`l${j}_i${k}`]?.noul ?? 0])),
          useful: a[`l${j}_useful`]?.noul ?? 0,
        }));
      }),
    );
    return scored.flat();
  }
}
