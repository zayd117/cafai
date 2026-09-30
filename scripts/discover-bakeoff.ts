// Discovery bake-off: Claude rating by itself vs Jev rating, on the same interpretation and the same cached mcp.market results.
//   npm run discover:bakeoff                                        # both arms, eval/discover/cases, 1 repeat
//   npm run discover:bakeoff -- --repeats 5 --cache eval/discover/search-cache.json
//   npm run discover:bakeoff -- --arms claude+jev                   # only Jev's arm (needs no Claude key when cases fix the interpretation)
// Arms: "claude" = Claude rates queries and listings; "claude+jev" = Jev rates them. Interpretation, search and ranking are shared.
// Time and tokens cover the rating stage only (interpretation is shared and reported once; search is cached and untimed).
// Accuracy needs labels in the case files (docs/DISCOVER_BAKEOFF.md); without them only time, tokens, cost, consistency and agreement print.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { costMicros } from "../src/config/pricing";
import { jevKeyFrom } from "../src/engine/providers/jev";
import { agreement, cachedFetch, runArm, summarize, warmCache, type Arm, type ArmRun, type ArmSummary, type DiscoverCase, type SharedRun } from "../src/discover/bakeoff";
import { DiscoverClaude } from "../src/discover/claude";
import { ClaudeScorer } from "../src/discover/claudeScorer";
import { JevScorer } from "../src/discover/scorer";
import { toListing } from "../src/discover/search";
import type { Interpretation, Listing } from "../src/discover/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const root = fileURLToPath(new URL("..", import.meta.url));
const casesDir = join(root, arg("cases") ?? "eval/discover/cases");
const repeats = Math.max(1, Number(arg("repeats") ?? 1));
const armNames = (arg("arms") ?? "claude,claude+jev").split(",").map((s) => s.trim()).filter(Boolean);
const cachePath = arg("cache") ? join(root, arg("cache")!) : null;
const KNOWN = ["claude", "claude+jev"];
for (const a of armNames) if (!KNOWN.includes(a)) { console.error(`unknown arm "${a}"; known: ${KNOWN.join(", ")}`); process.exit(2); }

const cases: DiscoverCase[] = existsSync(casesDir)
  ? readdirSync(casesDir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort().map((f) => JSON.parse(readFileSync(join(casesDir, f), "utf8")))
  : [];
if (!cases.length) { console.error(`no cases in ${casesDir}`); process.exit(2); }

const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
const jevKey = jevKeyFrom();
const arms: Arm[] = [];
const skipped: Record<string, string> = {};
for (const name of armNames) {
  if (name === "claude") {
    if (!hasClaude) { skipped[name] = "no ANTHROPIC_API_KEY"; continue; }
    const scorer = new ClaudeScorer(new DiscoverClaude({ model: arg("claude-model") }));
    arms.push({ name, scorer, usage: () => scorer.usage });
  } else {
    if (!jevKey) { skipped[name] = "no TypeSafe key (TYPESAFE_API_KEY or JEV_API_KEY)"; continue; }
    const scorer = new JevScorer({ apiKey: jevKey, model: process.env.CAFAI_JEV_MODEL });
    arms.push({ name, scorer, usage: () => scorer.usage });
  }
}
if (!arms.length) { console.error("no arm can run:", skipped); process.exit(2); }

const store = new Map<string, { status: number; body: string }>(cachePath && existsSync(cachePath) ? Object.entries(JSON.parse(readFileSync(cachePath, "utf8"))) : []);
const fetchCached = cachedFetch(fetch, store);

// Interpretation: fixed by the case, or live from Claude once per (case, repeat) and shared by every arm.
const interpreter = hasClaude ? new DiscoverClaude() : null;
const interps = new Map<string, Interpretation>();
const shared: SharedRun[] = [];
const usable: DiscoverCase[] = [];
for (const c of cases) {
  if (!c.interpretation && !interpreter) { console.warn(`skipping ${c.id}: no fixed interpretation and no ANTHROPIC_API_KEY`); continue; }
  usable.push(c);
  for (let r = 0; r < repeats; r++) {
    if (c.interpretation) { interps.set(`${c.id}#${r}`, c.interpretation); continue; }
    const before = interpreter!.usage.length;
    const t0 = performance.now();
    interps.set(`${c.id}#${r}`, await interpreter!.interpret(c.text));
    shared.push({ case_id: c.id, repeat: r, ms: performance.now() - t0, usage: interpreter!.usage.slice(before), live: true });
  }
}
if (!usable.length) process.exit(2);

await warmCache([...interps.values()], fetchCached);

const runs: Record<string, ArmRun[]> = Object.fromEntries(arms.map((a) => [a.name, []]));
for (let r = 0; r < repeats; r++) {
  const order = r % 2 ? [...arms].reverse() : arms; // alternate order so neither arm always goes first
  for (const arm of order) {
    for (const c of usable) runs[arm.name]!.push(await runArm({ arm, c, interpretation: interps.get(`${c.id}#${r}`)!, repeat: r, fetch: fetchCached }));
  }
}

const summaries: ArmSummary[] = arms.map((a) => summarize(a.name, runs[a.name]!, usable));
const fmt = (v: unknown, digits = 3) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(digits)) : v === null || v === undefined ? "—" : String(v));
const rows: [string, (s: ArmSummary) => unknown][] = [
  ["runs", (s) => s.runs], ["errors", (s) => s.errors],
  ["precision_at_3", (s) => s.precision_at_3], ["recall_at_5", (s) => s.recall_at_5], ["false_positive_rate", (s) => s.false_positive_rate],
  ["bad_query_drop_rate", (s) => s.bad_query_drop_rate], ["good_query_keep_rate", (s) => s.good_query_keep_rate], ["consistency", (s) => s.consistency],
  ["latency_p50_ms", (s) => (s.latency_p50_ms === null ? null : Math.round(s.latency_p50_ms))], ["latency_p95_ms", (s) => (s.latency_p95_ms === null ? null : Math.round(s.latency_p95_ms))],
  ["input_tokens_per_run", (s) => (s.input_tokens_per_run === null ? null : Math.round(s.input_tokens_per_run))],
  ["output_tokens_per_run", (s) => (s.output_tokens_per_run === null ? null : Math.round(s.output_tokens_per_run))],
  ["cost_per_run_usd", (s) => (s.cost_per_run_usd === null ? null : s.cost_per_run_usd.toFixed(6))],
];
console.log(`cases: ${usable.length}; repeats: ${repeats}; interpretation: ${usable.every((c) => c.interpretation) ? "fixed by the cases" : `Claude (${interpreter!.id}) for cases without one`}`);
console.log(["metric", ...arms.map((a) => a.name)].join(" | "));
for (const [k, f] of rows) console.log([k, ...summaries.map((s) => fmt(f(s)))].join(" | "));
const lab = summaries[0]!.labelled;
console.log(`labelled cases: ranking ${lab.ranking}, false positives ${lab.false_positives}, queries ${lab.queries} of ${usable.length} ("—" above means no labels for that metric)`);
if (arms.length === 2) console.log(`top-5 agreement between arms (Jaccard, no labels needed): ${fmt(agreement(runs[arms[0]!.name]!, runs[arms[1]!.name]!))}`);
if (shared.length) {
  const cost = shared.flatMap((s) => s.usage).reduce((sum, u) => sum + (costMicros(u) ?? NaN), 0) / 1e6;
  console.log(`shared interpretation (same for both arms, not in the rows above): ${shared.length} calls, avg ${Math.round(shared.reduce((s, x) => s + x.ms, 0) / shared.length)} ms, ~$${fmt(cost, 6)}`);
}
for (const [a, why] of Object.entries(skipped)) console.log(`NOT RUN ${a}: ${why}`);
for (const [a, rs] of Object.entries(runs)) for (const r of rs.filter((x) => x.error)) console.log(`ERROR ${a} ${r.case_id}#${r.repeat}: ${r.error}`);

// Pool for labelling: every listing any arm ranked, so a person marks relevant/irrelevant once for all arms.
const listings = new Map<string, Listing>();
for (const { body } of store.values()) {
  try { for (const raw of (JSON.parse(body) as { results?: unknown[] }).results ?? []) { const l = toListing(raw); if (l) listings.set(l.slug, l); } } catch { /* ignore */ }
}
const pool = usable.map((c) => {
  const seen = new Map<string, Record<string, number>>();
  for (const [arm, rs] of Object.entries(runs)) for (const r of rs.filter((x) => x.case_id === c.id && !x.error)) r.ranked.forEach((slug, i) => seen.set(slug, { ...seen.get(slug), [arm]: Math.min(seen.get(slug)?.[arm] ?? Infinity, i + 1) }));
  return {
    case_id: c.id,
    text: c.text,
    candidates: [...seen].map(([slug, best_rank]) => ({ slug, title: listings.get(slug)?.title ?? listings.get(slug)?.name, description: listings.get(slug)?.description, url: listings.get(slug)?.url, best_rank })),
  };
});
const outDir = join(root, "eval/reports");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "discover-latest.json"), JSON.stringify({ repeats, summaries, shared, runs, skipped }, null, 2));
writeFileSync(join(outDir, "discover-pool.json"), JSON.stringify(pool, null, 2));
console.log("\nwrote eval/reports/discover-latest.json and discover-pool.json (label the pool, then copy slugs into each case's relevant / irrelevant)");
if (cachePath) {
  mkdirSync(join(cachePath, ".."), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(Object.fromEntries(store), null, 1));
  console.log(`search cache saved to ${arg("cache")}`);
}
process.exit(summaries.some((s) => s.errors === s.runs) ? 1 : 0);
