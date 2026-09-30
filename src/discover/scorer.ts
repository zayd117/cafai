// Jev as the rater in both passes: yes/no probabilities about text we hand it. It never searches and never writes.
// Same rules as the decision provider (src/engine/providers/jev.ts): structured state only (the read-back items, never
// the raw description), one atomic question per number, code turns the probabilities into scores.
import { TypeSafeClient, choice, noul, score, type Fetch, type JsonValue, type Questions } from "@typesafe-ai/sdk";
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

/** Listings per request in the one-question screen. */
const SCREEN_BATCH = 20;

/** Pairs per Jev request in the pairwise pass (two questions each, one per order). */
const PAIR_BATCH = 10;

/** Graded per-need fit (`fit: "score"`): the expected level is divided by 3 to give 0-1. */
const FIT_RUBRIC = ["Unrelated to the item", "Related topic, but does not do what the item needs", "Does part of what the item needs", "Does what the item needs"] as const;

type Answers = Record<string, { noul?: number; score?: number; probabilities?: Record<string, number> } | undefined>;

const candidateOf = (l: Listing) => ({ name: l.title ?? l.name, description: l.description, category: l.category });

/** How the Jev-led loop asks about each result. */
export interface ListingAskOptions {
  /** Put each result's text once in the request state and refer to it by id, instead of repeating it in every question. */
  compact?: boolean;
  /** Per-need fit as a yes/no probability ("noul", default) or a 0-3 graded score scaled to 0-1 ("score"). */
  fit?: "noul" | "score";
}

export class JevScorer {
  readonly id: string;
  private client: TypeSafeClient;
  private model: string;
  /** Every request's usage, tagged with the loop step that made it. */
  readonly usage: Usage[] = [];
  /** Answers Jev did not return, replaced by a neutral default. Should stay 0; anything else is an API contract problem. */
  missing = 0;

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

  private async ask(items: Item[], questions: Questions, step: string, extraState: Record<string, unknown> = {}): Promise<Answers> {
    const state = { items: items.map((it) => ({ id: it.id, text: it.text })), ...extraState };
    const res = await this.client.systemOne({ state, questions, model: this.model });
    this.usage.push({ model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, step });
    return res.answers as Answers;
  }

  /** A yes/no answer, or `fallback` counted as missing. */
  private p(a: Answers, key: string, fallback: number): number {
    const v = a[key]?.noul;
    if (typeof v === "number") return v;
    this.missing++;
    return fallback;
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
    const a = await this.ask(items, JevScorer.queryQuestions(items, queries), "queries");
    return queries.map((query, i) => {
      const faithful = this.p(a, `q${i}_faithful`, 0);
      const drift = this.p(a, `q${i}_drift`, 1);
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
        const a = await this.ask(items, JevScorer.listingQuestions(items, batch), "listings");
        return batch.map((l, j): ListingScore => ({
          slug: l.slug,
          per_item: Object.fromEntries(items.map((it, k) => [it.id, this.p(a, `l${j}_i${k}`, 0)])),
          useful: this.p(a, `l${j}_useful`, 0),
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
    const a = await this.ask(items, JevScorer.itemQuestions(items), "needs");
    return items.map((it, k) => {
      const core = this.p(a, `i${k}_core`, 0.5); // a missing answer is neutral, never a silent drop
      const extra = this.p(a, `i${k}_extra`, 0);
      return { item_id: it.id, core, extra, weight: core * (1 - extra / 2) };
    });
  }

  /**
   * Step 4: per listing, one fit per need, one holistic "would this project benefit", and one "does it do what this search term wants"
   * per term that found it. Compact mode sends each listing once, in state, and refers to it by id.
   */
  static listingQuestionsLed(items: Item[], batch: { listing: Listing; terms: string[] }[], opts: ListingAskOptions = {}): { questions: Questions; state: Record<string, unknown> } {
    const q: Record<string, Questions[string]> = {};
    batch.forEach((b, j) => {
      const ref: Record<string, JsonValue> = opts.compact ? { candidate_id: `c${j}` } : { candidate: candidateOf(b.listing) };
      const server = opts.compact ? "the server `candidates[candidate_id]`" : "the server in `candidate`";
      items.forEach((it, k) => {
        q[`l${j}_i${k}`] = opts.fit === "score"
          ? score({ ...ref, item: it.text, question: `How well does ${server} do what \`item\` needs?` }, FIT_RUBRIC)
          : noul({ ...ref, item: it.text, question: `Does ${server} do what \`item\` needs?` });
      });
      q[`l${j}_useful`] = noul({ ...ref, question: `Would the project described in \`items\` benefit from ${server}?` });
      b.terms.forEach((term, m) => {
        q[`l${j}_t${m}`] = noul({ ...ref, term, question: `Does ${server} do what a person searching for \`term\` is looking for?` });
      });
    });
    const state = opts.compact ? { candidates: Object.fromEntries(batch.map((b, j) => [`c${j}`, candidateOf(b.listing)])) } : {};
    return { questions: q as Questions, state };
  }

  async scoreListingsLed(items: Item[], cands: { listing: Listing; terms: string[] }[], opts: ListingAskOptions = {}): Promise<ListingScore[]> {
    const batches: { listing: Listing; terms: string[] }[][] = [];
    for (let i = 0; i < cands.length; i += LISTING_BATCH) batches.push(cands.slice(i, i + LISTING_BATCH));
    const fit = (a: Answers, key: string) => {
      if (opts.fit !== "score") return this.p(a, key, 0);
      const s = a[key]?.score;
      if (typeof s === "number") return Math.min(1, Math.max(0, s / (FIT_RUBRIC.length - 1)));
      this.missing++;
      return 0;
    };
    const scored = await Promise.all(
      batches.map(async (batch) => {
        const { questions, state } = JevScorer.listingQuestionsLed(items, batch, opts);
        const a = await this.ask(items, questions, "listings", state);
        return batch.map((b, j): ListingScore => ({
          slug: b.listing.slug,
          per_item: Object.fromEntries(items.map((it, k) => [it.id, fit(a, `l${j}_i${k}`)])),
          useful: this.p(a, `l${j}_useful`, 0),
          per_term: Object.fromEntries(b.terms.map((term, m) => [term, this.p(a, `l${j}_t${m}`, 0)])),
        }));
      }),
    );
    return scored.flat();
  }

  /** Step 4a (optional screen): one "would this project benefit" per result, so the full questions go only to the most promising ones. */
  async screenListings(items: Item[], listings: Listing[], opts: Pick<ListingAskOptions, "compact"> = {}): Promise<Map<string, number>> {
    const batches: Listing[][] = [];
    for (let i = 0; i < listings.length; i += SCREEN_BATCH) batches.push(listings.slice(i, i + SCREEN_BATCH));
    const out = await Promise.all(
      batches.map(async (batch) => {
        const q: Record<string, Questions[string]> = {};
        batch.forEach((l, j) => {
          q[`l${j}_useful`] = opts.compact
            ? noul({ candidate_id: `c${j}`, question: "Would the project described in `items` benefit from the server `candidates[candidate_id]`?" })
            : noul({ candidate: candidateOf(l), question: "Would the project described in `items` benefit from the server in `candidate`?" });
        });
        const state = opts.compact ? { candidates: Object.fromEntries(batch.map((l, j) => [`c${j}`, candidateOf(l)])) } : {};
        const a = await this.ask(items, q as Questions, "screen", state);
        return batch.map((l, j): [string, number] => [l.slug, this.p(a, `l${j}_useful`, 0)]);
      }),
    );
    return new Map(out.flat());
  }

  /** Final handshake: only "does it do what this search looked for?", for the results about to be shown. Returns slug -> term -> P. */
  async scoreTerms(items: Item[], cands: { listing: Listing; terms: string[] }[], opts: Pick<ListingAskOptions, "compact"> = {}): Promise<Map<string, Record<string, number>>> {
    const asked = cands.filter((c) => c.terms.length);
    if (!asked.length) return new Map();
    const q: Record<string, Questions[string]> = {};
    asked.forEach((c, j) => {
      const ref: Record<string, JsonValue> = opts.compact ? { candidate_id: `c${j}` } : { candidate: candidateOf(c.listing) };
      const server = opts.compact ? "the server `candidates[candidate_id]`" : "the server in `candidate`";
      c.terms.forEach((term, m) => {
        q[`l${j}_t${m}`] = noul({ ...ref, term, question: `Does ${server} do what a person searching for \`term\` is looking for?` });
      });
    });
    const state = opts.compact ? { candidates: Object.fromEntries(asked.map((c, j) => [`c${j}`, candidateOf(c.listing)])) } : {};
    const a = await this.ask(items, q as Questions, "verify", state);
    return new Map(asked.map((c, j) => [c.listing.slug, Object.fromEntries(c.terms.map((term, m) => [term, this.p(a, `l${j}_t${m}`, 0)]))]));
  }

  /** Step 5a: is `a` a better choice than `b` for this project? Asked in both orders and averaged, so a lean toward whichever is named first cancels out. */
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
        const a = await this.ask(items, JevScorer.pairQuestions(batch), "pairs");
        return batch.map(([x, y], n) => {
          const ab = this.p(a, `p${n}_ab`, 0.5);
          const ba = this.p(a, `p${n}_ba`, 0.5);
          return { a: x.slug, b: y.slug, p_a: (ab + (1 - ba)) / 2 };
        });
      }),
    );
    return out.flat();
  }

  /**
   * Step 5c (by-need layout): for each need, one "which of these best does what this need asks" question over that need's verified
   * candidates, asked twice with the list reversed. All needs go in one request (answers are independent). Returns need id -> slug -> share.
   */
  static perNeedQuestions(groups: { item: Item; listings: Listing[] }[]): Questions {
    const q: Record<string, Questions[string]> = {};
    const options = (order: Listing[]) => Object.fromEntries(order.map((l, j) => [`c${j}`, candidateOf(l)]));
    groups.forEach((g, k) => {
      const ask = { item: g.item.text, question: "Which server best does what `item` needs?" };
      q[`n${k}_fwd`] = choice(ask, options(g.listings));
      q[`n${k}_rev`] = choice(ask, options([...g.listings].reverse()));
    });
    return q as Questions;
  }

  async rankPerNeed(items: Item[], groups: { item: Item; listings: Listing[] }[]): Promise<Map<string, Map<string, number>>> {
    const asked = groups.filter((g) => g.listings.length > 1);
    const out = new Map<string, Map<string, number>>(groups.filter((g) => g.listings.length === 1).map((g) => [g.item.id, new Map([[g.listings[0]!.slug, 1]])]));
    if (!asked.length) return out;
    const a = await this.ask(items, JevScorer.perNeedQuestions(asked), "per-need");
    asked.forEach((g, k) => {
      const n = g.listings.length;
      const prob = (key: string, label: string) => {
        const v = a[key]?.probabilities?.[label];
        if (typeof v === "number") return v;
        this.missing++;
        return 1 / n;
      };
      out.set(g.item.id, new Map(g.listings.map((l, j) => [l.slug, (prob(`n${k}_fwd`, `c${j}`) + prob(`n${k}_rev`, `c${n - 1 - j}`)) / 2])));
    });
    return out;
  }

  /**
   * Step 5b: one "which is the best choice" question over the whole shortlist, answered as a probability per result. Asked twice,
   * the second time with the list reversed (labels and positions both swap), and averaged so a lean toward a position cancels out.
   */
  static listQuestions(listings: Listing[]): Questions {
    const question = { question: "Which server is the best choice for the project described in `items`?" };
    const options = (order: Listing[]) => Object.fromEntries(order.map((l, j) => [`c${j}`, candidateOf(l)]));
    return { fwd: choice(question, options(listings)), rev: choice(question, options([...listings].reverse())) } as Questions;
  }

  async rankList(items: Item[], listings: Listing[]): Promise<Map<string, number>> {
    if (listings.length < 2) return new Map(listings.map((l) => [l.slug, 1]));
    const a = await this.ask(items, JevScorer.listQuestions(listings), "choice");
    const n = listings.length;
    const prob = (key: "fwd" | "rev", label: string) => {
      const v = a[key]?.probabilities?.[label];
      if (typeof v === "number") return v;
      this.missing++;
      return 1 / n;
    };
    return new Map(listings.map((l, j) => [l.slug, (prob("fwd", `c${j}`) + prob("rev", `c${n - 1 - j}`)) / 2]));
  }
}
