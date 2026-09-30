// Discovery bake-off (docs/DISCOVER_BAKEOFF.md): the same interpretation and the same cached mcp.market results go through
// each arm, so the only thing that differs is who rates queries and listings. Accuracy needs human labels; time, tokens,
// cost, consistency and agreement between arms do not.
import { costMicros } from "@/config/pricing";
import { DISCOVER_CONFIG } from "./rank";
import { discover, type Scorer } from "./run";
import { searchMarket, type FetchLike } from "./search";
import type { Interpretation, Listing, Usage } from "./types";

export interface DiscoverCase {
  id: string;
  text: string;
  /** Fixed interpretation. When absent, Claude interprets once per repeat and every arm shares it. */
  interpretation?: Interpretation;
  /** Listing slugs a good answer contains. Unlabeled slugs count as not relevant (pooling assumption). */
  relevant?: string[];
  /** Listing slugs that must not rank in the top 5. */
  irrelevant?: string[];
  /** Query texts that should survive the Jev/Claude filter. */
  good_queries?: string[];
  /** Query texts that should be dropped before searching. */
  bad_queries?: string[];
  notes?: string;
}

export interface Arm {
  name: string;
  /** One scorer for every case, or a factory when ratings differ per case (recorded ratings). */
  scorer: Scorer | ((c: DiscoverCase) => Scorer);
  /** False when time and tokens were not metered (recorded subagent ratings): they print as "—", never as zero. */
  measured?: boolean;
  /** The scorer's running usage list; the runner slices it per run. */
  usage: () => Usage[];
}

export interface ArmRun {
  case_id: string;
  arm: string;
  repeat: number;
  ms: number;
  /** False when the arm's time and usage were not metered. */
  timed?: boolean;
  usage: Usage[];
  /** Ranked listing slugs, best first. */
  ranked: string[];
  /** Query texts that were searched / dropped. */
  kept: string[];
  dropped: string[];
  error?: string;
}

export interface SharedRun {
  case_id: string;
  repeat: number;
  ms: number;
  usage: Usage[];
  /** Interpretation produced live (absent when the case fixes one). */
  live: boolean;
}

export interface ArmSummary {
  arm: string;
  runs: number;
  errors: number;
  precision_at_3: number | null;
  recall_at_5: number | null;
  false_positive_rate: number | null;
  bad_query_drop_rate: number | null;
  good_query_keep_rate: number | null;
  consistency: number | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  input_tokens_per_run: number | null;
  output_tokens_per_run: number | null;
  /** Null when any model in the arm has no known price (never shown as free). */
  cost_per_run_usd: number | null;
  labelled: { ranking: number; false_positives: number; queries: number };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))]!;
}

export const jaccard = (a: string[], b: string[]) => {
  const x = new Set(a);
  const y = new Set(b);
  if (!x.size && !y.size) return 1;
  let both = 0;
  for (const v of x) if (y.has(v)) both++;
  return both / (x.size + y.size - both);
};

export const precisionAt = (k: number, ranked: string[], relevant: string[]) => ranked.slice(0, k).filter((s) => relevant.includes(s)).length / k;
export const recallAt = (k: number, ranked: string[], relevant: string[]) => relevant.filter((s) => ranked.slice(0, k).includes(s)).length / relevant.length;
export const falsePositiveRate = (k: number, ranked: string[], irrelevant: string[]) => ranked.slice(0, k).filter((s) => irrelevant.includes(s)).length / k;

export function summarize(arm: string, runs: ArmRun[], cases: DiscoverCase[]): ArmSummary {
  const ok = runs.filter((r) => !r.error);
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const rank: number[][] = [[], []]; // precision@3, recall@5
  const fp: number[] = [];
  const bad: number[] = [];
  const good: number[] = [];
  const labelled = { ranking: new Set<string>(), false_positives: new Set<string>(), queries: new Set<string>() };
  for (const r of ok) {
    const c = byCase.get(r.case_id);
    if (!c) continue;
    if (c.relevant?.length) {
      rank[0]!.push(precisionAt(3, r.ranked, c.relevant));
      rank[1]!.push(recallAt(5, r.ranked, c.relevant));
      labelled.ranking.add(c.id);
    }
    if (c.irrelevant?.length) {
      fp.push(falsePositiveRate(5, r.ranked, c.irrelevant));
      labelled.false_positives.add(c.id);
    }
    if (c.bad_queries?.length) {
      bad.push(c.bad_queries.filter((q) => r.dropped.some((d) => same(d, q))).length / c.bad_queries.length);
      labelled.queries.add(c.id);
    }
    if (c.good_queries?.length) {
      good.push(c.good_queries.filter((q) => r.kept.some((k) => same(k, q))).length / c.good_queries.length);
      labelled.queries.add(c.id);
    }
  }
  // Consistency: mean Jaccard of the top-5 sets between repeats of the same case.
  const sets = new Map<string, string[][]>();
  for (const r of ok) sets.set(r.case_id, [...(sets.get(r.case_id) ?? []), r.ranked.slice(0, 5)]);
  const pairs = [...sets.values()].flatMap((s) => s.flatMap((a, i) => s.slice(i + 1).map((b) => jaccard(a, b))));
  const metered = ok.filter((r) => r.usage.length > 0);
  const costs = metered.map((r) => r.usage.map((u) => costMicros(u)));
  const known = costs.every((row) => row.every((c) => c !== null));
  const ms = ok.filter((r) => r.timed !== false).map((r) => r.ms);
  return {
    arm,
    runs: runs.length,
    errors: runs.length - ok.length,
    precision_at_3: mean(rank[0]!),
    recall_at_5: mean(rank[1]!),
    false_positive_rate: mean(fp),
    bad_query_drop_rate: mean(bad),
    good_query_keep_rate: mean(good),
    consistency: mean(pairs),
    latency_p50_ms: percentile(ms, 50),
    latency_p95_ms: percentile(ms, 95),
    input_tokens_per_run: mean(metered.map((r) => r.usage.reduce((s, u) => s + u.input_tokens, 0))),
    output_tokens_per_run: mean(metered.map((r) => r.usage.reduce((s, u) => s + u.output_tokens, 0))),
    cost_per_run_usd: metered.length && known ? (mean(costs.map((row) => row.reduce<number>((s, c) => s + (c ?? 0), 0))) ?? 0) / 1e6 : null,
    labelled: { ranking: labelled.ranking.size, false_positives: labelled.false_positives.size, queries: labelled.queries.size },
  };
}

/** Mean top-5 overlap between two arms over the runs both completed (needs no labels). */
export function agreement(a: ArmRun[], b: ArmRun[]): number | null {
  const key = (r: ArmRun) => `${r.case_id}#${r.repeat}`;
  const other = new Map(b.filter((r) => !r.error).map((r) => [key(r), r]));
  return mean(a.filter((r) => !r.error && other.has(key(r))).map((r) => jaccard(r.ranked.slice(0, 5), other.get(key(r))!.ranked.slice(0, 5))));
}

/** Cache mcp.market responses so every arm sees the same listings and no arm pays the network time. */
export function cachedFetch(inner: FetchLike, store: Map<string, { status: number; body: string }>): FetchLike {
  return async (url, init) => {
    const hit = store.get(url);
    if (hit) return new Response(hit.body, { status: hit.status, headers: { "content-type": "application/json" } });
    const res = await inner(url, init);
    if (res.ok) {
      const body = await res.text();
      store.set(url, { status: res.status, body });
      return new Response(body, { status: res.status, headers: { "content-type": "application/json" } });
    }
    return res;
  };
}

/** Untimed pass: fetch every query once so the timed arms read from the cache. Failures are left for the arms to report. */
export async function warmCache(interps: Interpretation[], fetch: FetchLike) {
  const texts = new Set(interps.flatMap((i) => i.queries.map((q) => q.text)));
  await Promise.all([...texts].map((t) => searchMarket(t, { limit: DISCOVER_CONFIG.resultsPerQuery, fetch }).catch(() => undefined)));
}

/** Every distinct listing any query of this interpretation retrieves (served from the warmed cache). */
export async function listingsFor(interp: Interpretation, fetch: FetchLike): Promise<Listing[]> {
  const found = await Promise.all(interp.queries.map((q) => searchMarket(q.text, { limit: DISCOVER_CONFIG.resultsPerQuery, fetch }).catch(() => [] as Listing[])));
  return [...new Map(found.flat().map((l) => [l.slug, l])).values()];
}

export async function runArm(args: { arm: Arm; c: DiscoverCase; interpretation: Interpretation; repeat: number; fetch: FetchLike }): Promise<ArmRun> {
  const { arm, c, interpretation, repeat } = args;
  const before = arm.usage().length;
  const t0 = performance.now();
  try {
    const scorer = typeof arm.scorer === "function" ? arm.scorer(c) : arm.scorer;
    const r = await discover({ text: c.text, claude: { interpret: async () => interpretation }, jev: scorer, fetch: args.fetch });
    const ms = performance.now() - t0;
    const kept = r.searched.map((s) => s.text);
    return {
      case_id: c.id,
      arm: arm.name,
      repeat,
      ms,
      timed: arm.measured !== false,
      usage: arm.usage().slice(before),
      ranked: r.ranked.map((x) => x.listing.slug),
      kept,
      dropped: interpretation.queries.filter((q) => !kept.includes(q.text)).map((q) => q.text),
    };
  } catch (e) {
    return { case_id: c.id, arm: arm.name, repeat, ms: performance.now() - t0, usage: arm.usage().slice(before), ranked: [], kept: [], dropped: [], error: e instanceof Error ? e.message : String(e) };
  }
}
