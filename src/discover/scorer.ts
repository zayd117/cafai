// Jev as the rater in both passes: yes/no probabilities about text we hand it. It never searches and never writes.
// Same rules as the decision provider (src/engine/providers/jev.ts): structured state only (the read-back items, never
// the raw description), one atomic question per number, code turns the probabilities into scores.
import { TypeSafeClient, noul, type Fetch, type Questions } from "@typesafe-ai/sdk";
import { JEV_DEFAULT_MODEL, jevKeyFrom } from "@/engine/providers/jev";
import type { Item, ItemScore, Listing, ListingScore, Query, QueryScore, Usage } from "./types";

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

/** Pairs per Jev request in the pairwise pass (two questions each, one per order). */
const PAIR_BATCH = 10;

type Answers = Record<string, { noul?: number } | undefined>;

const candidateOf = (l: Listing) => ({ name: l.title ?? l.name, description: l.description, category: l.category });

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
      const candidate = candidateOf(l);
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

  // ---- Jev-led loop (src/discover/led.ts): Jev also weighs the needs, rates results against the search terms, and orders the shortlist.

  /** Step 1: how central is each need to the project the other needs describe? */
  static itemQuestions(items: Item[]): Questions {
    const q: Record<string, Questions[string]> = {};
    items.forEach((it, k) => {
      q[`i${k}_core`] = noul({ item: it.text, question: "Is `item` central to the project described in `items`, so that the project cannot work without it?" });
      q[`i${k}_extra`] = noul({ item: it.text, question: "Is `item` an optional add-on that the other entries in `items` do not call for?" });
    });
    return q as Questions;
  }

  async scoreItems(items: Item[]): Promise<ItemScore[]> {
    if (!items.length) return [];
    const a = await this.ask(items, JevScorer.itemQuestions(items));
    return items.map((it, k) => {
      const core = a[`i${k}_core`]?.noul ?? 0.5; // a missing answer is neutral, never a silent drop
      const extra = a[`i${k}_extra`]?.noul ?? 0;
      return { item_id: it.id, core, extra, weight: core * (1 - extra / 2) };
    });
  }

  /** Step 4: the pass-2 questions plus, per listing, one "does it do what this search term wants" per term that found it. */
  static listingQuestionsLed(items: Item[], batch: { listing: Listing; terms: string[] }[]): Questions {
    const q: Record<string, Questions[string]> = JevScorer.listingQuestions(items, batch.map((b) => b.listing)) as Record<string, Questions[string]>;
    batch.forEach((b, j) => {
      b.terms.forEach((term, m) => {
        q[`l${j}_t${m}`] = noul({ candidate: candidateOf(b.listing), term, question: "Does the server in `candidate` do what a person searching for `term` is looking for?" });
      });
    });
    return q as Questions;
  }

  async scoreListingsLed(items: Item[], cands: { listing: Listing; terms: string[] }[]): Promise<ListingScore[]> {
    const batches: { listing: Listing; terms: string[] }[][] = [];
    for (let i = 0; i < cands.length; i += LISTING_BATCH) batches.push(cands.slice(i, i + LISTING_BATCH));
    const scored = await Promise.all(
      batches.map(async (batch) => {
        const a = await this.ask(items, JevScorer.listingQuestionsLed(items, batch));
        return batch.map((b, j): ListingScore => ({
          slug: b.listing.slug,
          per_item: Object.fromEntries(items.map((it, k) => [it.id, a[`l${j}_i${k}`]?.noul ?? 0])),
          useful: a[`l${j}_useful`]?.noul ?? 0,
          per_term: Object.fromEntries(b.terms.map((term, m) => [term, a[`l${j}_t${m}`]?.noul ?? 0])),
        }));
      }),
    );
    return scored.flat();
  }

  /** Step 5: is `a` a better choice than `b` for this project? Asked in both orders and averaged, so a lean toward whichever is named first cancels out. */
  static pairQuestions(pairs: [Listing, Listing][]): Questions {
    const q: Record<string, Questions[string]> = {};
    const question = "For the project described in `items`, is `a` a better choice than `b`?";
    pairs.forEach(([x, y], n) => {
      q[`p${n}_ab`] = noul({ a: candidateOf(x), b: candidateOf(y), question });
      q[`p${n}_ba`] = noul({ a: candidateOf(y), b: candidateOf(x), question });
    });
    return q as Questions;
  }

  async comparePairs(items: Item[], pairs: [Listing, Listing][]): Promise<{ a: string; b: string; p_a: number }[]> {
    const batches: [Listing, Listing][][] = [];
    for (let i = 0; i < pairs.length; i += PAIR_BATCH) batches.push(pairs.slice(i, i + PAIR_BATCH));
    const out = await Promise.all(
      batches.map(async (batch) => {
        const a = await this.ask(items, JevScorer.pairQuestions(batch));
        return batch.map(([x, y], n) => {
          const ab = a[`p${n}_ab`]?.noul ?? 0.5;
          const ba = a[`p${n}_ba`]?.noul ?? 0.5;
          return { a: x.slug, b: y.slug, p_a: (ab + (1 - ba)) / 2 };
        });
      }),
    );
    return out.flat();
  }
}
