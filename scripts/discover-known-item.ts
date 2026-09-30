// Known-item accuracy test for the discovery loop: no labels needed. Each task is a project description that was written FROM one real
// mcp.market listing, so that listing is the known right answer. Every arm gets the same interpretation and the same mcp.market
// responses (fetched live once, then cached), so only the rating and ranking differ. Metric: does the known listing reach the top 5?
//   npm run discover:known -- --arms jev-classic,jev-led --ids t13..t26
//   npm run discover:known -- --arms claude,jev-classic,jev-led --ids all     # needs ANTHROPIC_API_KEY for the claude arm
// Arms: claude = Claude rates, classic loop; jev-classic = Jev rates, classic loop (the old claude+jev arm); jev-led = Jev-led loop (src/discover/led.ts);
// jev-led-nopair / -noweights / -noterms = the Jev-led loop with that one Jev step switched off.
// Limits: only the one known listing counts as right, so other good results count as misses for every arm alike; read the gap between
// arms, not the absolute rates. Tasks and interpretations are in eval/discover/known-item/ (the interpretations can be stand-ins
// written without the API; the file says so). Human labels remain the real accuracy test.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { costMicros } from "../src/config/pricing";
import { cachedFetch } from "../src/discover/bakeoff";
import { DiscoverClaude } from "../src/discover/claude";
import { ClaudeScorer } from "../src/discover/claudeScorer";
import { discoverLed, LED_CONFIG } from "../src/discover/led";
import { discover } from "../src/discover/run";
import { JevScorer } from "../src/discover/scorer";
import { searchMarket, type FetchLike } from "../src/discover/search";
import { jevKeyFrom } from "../src/engine/providers/jev";
import type { Interpretation, Listing, Usage } from "../src/discover/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = join(root, "eval/discover/known-item");
const cachePath = join(root, arg("cache") ?? "eval/discover/known-item-cache.json");
const outPath = join(root, arg("out") ?? "eval/reports/known-item-latest.json");
const ARMS = (arg("arms") ?? "jev-classic,jev-led").split(",").map((s) => s.trim()).filter(Boolean);
// Jev-led variants switch one Jev step off at a time, to show which step earns its keep.
const LED_VARIANTS: Record<string, Partial<typeof LED_CONFIG>> = { "jev-led": {}, "jev-led-nopair": { usePairs: false }, "jev-led-noweights": { itemWeightFloor: 1 }, "jev-led-noterms": { termWeight: 0, termFloor: 1 } };
const KNOWN_ARMS = ["claude", "jev-classic", ...Object.keys(LED_VARIANTS)];
for (const a of ARMS) if (!KNOWN_ARMS.includes(a)) { console.error(`unknown arm "${a}"; known: ${KNOWN_ARMS.join(", ")}`); process.exit(2); }

interface Task { id: string; topic: string; text: string; known: { slug: string; title: string } }
const tasks: Task[] = JSON.parse(readFileSync(join(dir, "tasks.json"), "utf8"));
const interps: Record<string, Interpretation> = JSON.parse(readFileSync(join(dir, "interpretations.json"), "utf8"));
const num = (id: string) => Number(id.replace(/\D/g, ""));
const idsArg = arg("ids") ?? "all";
const pick = (t: Task) => {
  if (idsArg === "all") return true;
  const m = idsArg.match(/^t?(\d+)\.\.t?(\d+)$/);
  if (m) return num(t.id) >= Number(m[1]) && num(t.id) <= Number(m[2]);
  return idsArg.split(",").map((s) => s.trim()).includes(t.id);
};
const selected = tasks.filter(pick).filter((t) => interps[t.id]);

const store = new Map<string, { status: number; body: string }>(existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : []);
const saveCache = () => { mkdirSync(dirname(cachePath), { recursive: true }); writeFileSync(cachePath, JSON.stringify([...store])); };
const cf = cachedFetch(fetch as FetchLike, store);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cost = (u: Usage[]) => u.reduce((s, x) => s + (costMicros(x) ?? NaN), 0) / 1e6;

const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
if (ARMS.some((a) => a !== "claude")) if (!jevKeyFrom()) { console.error("no Jev key (JEV_API_KEY)"); process.exit(2); }
const active = ARMS.filter((a) => a !== "claude" || hasClaude);
const isLed = (a: string) => a in LED_VARIANTS;
const skipped = ARMS.filter((a) => !active.includes(a));

interface ArmResult { rank: number | null; retrieved: boolean; queries: number; ranked: string[]; input: number; output: number; cost: number; ms: number; error?: string }
const results: { id: string; text: string; known: string; reachable: boolean; arms: Record<string, ArmResult> }[] = [];

for (const t of selected) {
  const interp = interps[t.id]!;
  const qmap: Record<string, Listing[]> = {};
  await Promise.all(interp.queries.map(async (q) => { qmap[q.text] = await searchMarket(q.text, { limit: 8, fetch: cf }).catch(() => []); }));
  saveCache();
  const pool = new Map(Object.values(qmap).flat().map((l) => [l.slug, l]));
  const knownListing = pool.get(t.known.slug);
  const twins = new Set([t.known.slug, ...(knownListing ? [...pool.values()].filter((l) => norm(l.description) === norm(knownListing.description)).map((l) => l.slug) : [])]);
  const reachable = Boolean(knownListing);
  const arms: Record<string, ArmResult> = {};
  for (const arm of active) {
    const s = performance.now();
    try {
      const scorer = arm === "claude" ? new ClaudeScorer(new DiscoverClaude()) : new JevScorer();
      const r = isLed(arm)
        ? await discoverLed({ text: t.text, claude: { interpret: async () => interp }, jev: scorer as JevScorer, fetch: cf, cfg: { ...LED_CONFIG, ...LED_VARIANTS[arm] } })
        : await discover({ text: t.text, claude: { interpret: async () => interp }, jev: scorer, fetch: cf });
      const ranked = r.ranked.map((x) => x.listing.slug);
      const idx = ranked.findIndex((x) => twins.has(x));
      const u = scorer.usage;
      arms[arm] = {
        rank: idx < 0 ? null : idx + 1,
        retrieved: r.searched.some((q) => (qmap[q.text] ?? []).some((l) => twins.has(l.slug))),
        queries: r.searched.length,
        ranked,
        input: u.reduce((a, x) => a + x.input_tokens, 0),
        output: u.reduce((a, x) => a + x.output_tokens, 0),
        cost: cost(u),
        ms: performance.now() - s,
      };
    } catch (e) {
      arms[arm] = { rank: null, retrieved: false, queries: 0, ranked: [], input: 0, output: 0, cost: 0, ms: performance.now() - s, error: String(e instanceof Error ? e.message : e).slice(0, 160) };
    }
  }
  results.push({ id: t.id, text: t.text, known: t.known.slug, reachable, arms });
  console.log(`${t.id} reachable=${reachable ? "y" : "n"} ${active.map((a) => `${a}=${arms[a]!.error ? "ERR" : arms[a]!.rank ?? "-"}`).join(" ")}`);
}

// ---- summary
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : NaN; };
function wilson(x: number, n: number): [number, number] { if (!n) return [0, 0]; const z = 1.96, p = x / n, d = 1 + z * z / n, c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - h) / d), Math.min(1, (c + h) / d)]; }
function signTest(b: number, c: number) { const m = b + c; if (!m) return 1; const lf = (x: number) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; }; let p = 0; for (let i = 0; i <= Math.min(b, c); i++) p += Math.exp(lf(m) - lf(i) - lf(m - i) - m * Math.log(2)); return Math.min(1, 2 * p); }
const ok = (r: (typeof results)[number]) => active.every((a) => !r.arms[a]!.error);
const valid = results.filter(ok);
const pct = (x: number) => `${Math.round(x * 100)}%`;
console.log(`\ntasks: ${results.length}, both/all arms finished: ${valid.length}, known listing reachable by some query: ${valid.filter((r) => r.reachable).length}${skipped.length ? `; NOT RUN: ${skipped.join(", ")} (no ANTHROPIC_API_KEY)` : ""}`);
const summary: Record<string, unknown> = {};
for (const a of active) {
  const h = (k: number) => valid.filter((r) => r.arms[a]!.rank !== null && r.arms[a]!.rank! <= k).length;
  const mrr = mean(valid.map((r) => (r.arms[a]!.rank ? 1 / r.arms[a]!.rank! : 0)));
  const never = valid.filter((r) => !r.arms[a]!.retrieved).length;
  const row = {
    n: valid.length, hit1: h(1), hit3: h(3), hit5: h(5), hit5_ci: wilson(h(5), valid.length), mrr, never_searched: never,
    queries: mean(valid.map((r) => r.arms[a]!.queries)), input: mean(valid.map((r) => r.arms[a]!.input)), output: mean(valid.map((r) => r.arms[a]!.output)),
    cost: mean(valid.map((r) => r.arms[a]!.cost)), ms_median: median(valid.map((r) => r.arms[a]!.ms)),
  };
  summary[a] = row;
  console.log(`${a.padEnd(12)} hit@1 ${pct(row.hit1 / row.n)} hit@3 ${pct(row.hit3 / row.n)} hit@5 ${pct(row.hit5 / row.n)} (${pct(row.hit5_ci[0])}-${pct(row.hit5_ci[1])})  MRR ${row.mrr.toFixed(2)}  never searched ${never}  queries ${row.queries.toFixed(1)}  tokens ${Math.round(row.input)}/${Math.round(row.output)}  $${row.cost.toFixed(4)}  ${Math.round(row.ms_median)} ms`);
}
const paired: Record<string, unknown> = {};
for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
  const [a, b] = [active[i]!, active[j]!];
  const h5 = (r: (typeof results)[number], x: string) => r.arms[x]!.rank !== null && r.arms[x]!.rank! <= 5;
  const onlyA = valid.filter((r) => h5(r, a) && !h5(r, b)).length, onlyB = valid.filter((r) => !h5(r, a) && h5(r, b)).length;
  const p = signTest(onlyA, onlyB);
  paired[`${a} vs ${b}`] = { onlyA, onlyB, both: valid.filter((r) => h5(r, a) && h5(r, b)).length, neither: valid.filter((r) => !h5(r, a) && !h5(r, b)).length, p };
  console.log(`top 5, ${a} vs ${b}: only ${a} ${onlyA}, only ${b} ${onlyB}, sign test p = ${p.toFixed(2)}`);
}
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ ids: idsArg, arms: active, skipped, summary, paired, results }, null, 1));
console.log(`wrote ${outPath}`);
