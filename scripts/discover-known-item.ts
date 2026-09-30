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
import { cachedFetch, cachedPostFetch } from "../src/discover/bakeoff";
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
// Jev answers are replayed from here for identical requests (git-ignored). --fresh-jev skips it, for honest timings.
const jevCachePath = join(root, arg("jev-cache") ?? "eval/discover/known-item-jev-cache.json");
const freshJev = process.argv.includes("--fresh-jev");
// Junk test: slip this many off-topic listings (real listings from the other test projects) into the directory's replies for each project.
// "random" picks any; "lookalike" picks ones sharing a word with the searches they are slipped into (harder, and now and then not junk).
const decoyCount = Number(arg("decoys") ?? 0);
const decoyKind = (arg("decoy-kind") ?? "lookalike") as "random" | "lookalike";
const ARMS = (arg("arms") ?? "jev-classic,jev-led").split(",").map((s) => s.trim()).filter(Boolean);
// Jev-led variants switch one Jev step off at a time, to show which step earns its keep.
const LED_VARIANTS: Record<string, Partial<typeof LED_CONFIG>> = {
  "jev-led": {},
  "jev-led-noverify": { verifyShown: false },
  // the first Jev-led version (30 Sep 2026): head to head, text in every question, term questions on, no screen
  "jev-led-v1": { order: "pairs", compact: false, screen: 0, termsPerListing: 2, termFloor: 0.7, termWeight: 0.3 },
  "jev-led-nopair": { order: "none" },
  "jev-led-noweights": { itemWeightFloor: 1 },
  "jev-led-noterms": { termWeight: 0, termFloor: 1 },
  "jev-led-choice": { order: "choice" },
  "jev-led-both": { order: "both" },
  "jev-led-compact": { compact: true },
  "jev-led-score": { fit: "score" },
  "jev-led-budget12": { queryBudget: 12 },
  "jev-led-choice12": { order: "choice", shortlist: 12 },
  "jev-led-c-compact": { order: "choice", compact: true },
  "jev-led-c-noterms": { order: "choice", termsPerListing: 0, termFloor: 1, termWeight: 0 },
  "jev-led-c-compact-noterms": { order: "choice", compact: true, termsPerListing: 0, termFloor: 1, termWeight: 0 },
  "jev-led-c-screen20": { order: "choice", screen: 20 },
  "jev-led-c-screen30": { order: "choice", screen: 30 },
  "jev-led-lean": { order: "choice", compact: true, termsPerListing: 0, termFloor: 1, termWeight: 0, screen: 20 },
  "jev-led-c-compact-screen20": { order: "choice", compact: true, screen: 20 },
  // handshake and by-need layout (search -> result checks; best picks per need, taking turns across needs)
  "jev-led-hs": { handshake: true, termsPerListing: 3 },
  "jev-led-byneed": { layout: "by-need" },
  "jev-led-byneed-hs": { layout: "by-need", handshake: true, termsPerListing: 3 },
  "jev-led-byneed-gap": { layout: "by-need", gapQueries: 2 },
  "jev-led-byneed-hs-gap": { layout: "by-need", handshake: true, termsPerListing: 3, gapQueries: 2 },
  "jev-led-hybrid": { layout: "hybrid" },
  "jev-led-hybrid-hs": { layout: "hybrid", handshake: true, termsPerListing: 3 },
  "jev-led-verify": { verifyShown: true },
  "jev-led-hybrid-verify": { layout: "hybrid", verifyShown: true },
};
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
const jevStore = new Map<string, { status: number; body: string }>(!freshJev && existsSync(jevCachePath) ? JSON.parse(readFileSync(jevCachePath, "utf8")) : []);
const jevFetch = freshJev ? undefined : cachedPostFetch(jevStore);
const saveJev = () => { if (!freshJev) writeFileSync(jevCachePath, JSON.stringify([...jevStore])); };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const cost = (u: Usage[]) => u.reduce((s, x) => s + (costMicros(x) ?? NaN), 0) / 1e6;

const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
if (ARMS.some((a) => a !== "claude")) if (!jevKeyFrom()) { console.error("no Jev key (JEV_API_KEY)"); process.exit(2); }
const active = ARMS.filter((a) => a !== "claude" || hasClaude);
const isLed = (a: string) => a in LED_VARIANTS;
const skipped = ARMS.filter((a) => !active.includes(a));

interface ArmResult { rank: number | null; retrieved: boolean; stage?: string; shown?: boolean; shownCount?: number; coverage5?: number; repeats5?: number; decoys5?: number; decoysShown?: number; queries: number; ranked: string[]; input: number; output: number; cost: number; ms: number; requests?: number; steps?: Record<string, number>; missing?: number; error?: string }
const results: { id: string; text: string; known: string; reachable: boolean; arms: Record<string, ArmResult> }[] = [];

// Every project's directory replies, so junk for one project can be drawn from the others' results.
const rawBySlug = new Map<string, unknown>();
const poolOf = new Map<string, Set<string>>();
if (decoyCount > 0) {
  for (const t of tasks.filter((x) => interps[x.id])) {
    const slugs = new Set<string>();
    for (const q of interps[t.id]!.queries) for (const l of await searchMarket(q.text, { limit: 8, fetch: cf }).catch(() => [] as Listing[])) slugs.add(l.slug);
    poolOf.set(t.id, slugs);
  }
  for (const { body } of store.values()) {
    try { for (const r of (JSON.parse(body) as { results?: { slug?: string }[] }).results ?? []) if (r?.slug) rawBySlug.set(r.slug, r); } catch { /* not a search reply */ }
  }
  saveCache();
}
const seeded = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; };
const STOP = new Set(["with", "from", "that", "this", "your", "free", "tool", "tools", "data", "simple", "online", "search", "manager", "service"]);
function decoysFor(t: Task): Map<string, unknown[]> {
  const injections = new Map<string, unknown[]>();
  if (decoyCount <= 0) return injections;
  const rnd = seeded(t.id);
  const own = poolOf.get(t.id) ?? new Set();
  const others = [...new Set([...poolOf].filter(([id]) => id !== t.id).flatMap(([, s]) => [...s]))].filter((s) => !own.has(s) && s !== t.known.slug && rawBySlug.has(s)).sort();
  const needs = interps[t.id]!.items;
  const taken = new Set<string>();
  for (let i = 0; i < decoyCount; i++) {
    const need = needs[i % needs.length]!;
    const qs = interps[t.id]!.queries.filter((q) => q.item_id === need.id);
    const words = [...new Set(qs.flatMap((q) => q.text.toLowerCase().split(/[^a-z0-9]+/)).filter((w) => w.length >= 4 && !STOP.has(w)))];
    const text = (s: string) => { const r = rawBySlug.get(s) as { name?: string; title?: string; description?: string }; return `${r.name ?? ""} ${r.title ?? ""} ${r.description ?? ""}`.toLowerCase(); };
    const lookalike = decoyKind === "lookalike" ? others.filter((s) => !taken.has(s) && words.some((w) => text(s).includes(w))) : [];
    const pool = lookalike.length ? lookalike : others.filter((s) => !taken.has(s));
    const pick = pool[Math.floor(rnd() * pool.length)];
    if (!pick) continue;
    taken.add(pick);
    for (const q of qs) injections.set(q.text, [...(injections.get(q.text) ?? []), rawBySlug.get(pick)]);
  }
  return injections;
}

for (const t of selected) {
  const interp = interps[t.id]!;
  const injections = decoysFor(t);
  const decoySlugs = new Set([...injections.values()].flat().map((r) => (r as { slug: string }).slug));
  // The directory as the arms see it: real replies, with the junk slipped in at position 3.
  const armFetch: FetchLike = !injections.size ? cf : async (url, init) => {
    const res = await cf(url, init);
    const inj = injections.get(decodeURIComponent(url.split("?q=")[1] ?? ""));
    if (!inj || !res.ok) return res;
    const body = (await res.json()) as { results: unknown[] };
    body.results = [...body.results.slice(0, 2), ...inj, ...body.results.slice(2)];
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
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
      const scorer = arm === "claude" ? new ClaudeScorer(new DiscoverClaude()) : new JevScorer({ fetch: jevFetch as never });
      const r = isLed(arm)
        ? await discoverLed({ text: t.text, claude: { interpret: async () => interp }, jev: scorer as JevScorer, fetch: armFetch, cfg: { ...LED_CONFIG, ...LED_VARIANTS[arm] } })
        : await discover({ text: t.text, claude: { interpret: async () => interp }, jev: scorer, fetch: armFetch });
      const ranked = r.ranked.map((x) => x.listing.slug);
      const idx = ranked.findIndex((x) => twins.has(x));
      const u = scorer.usage;
      const retrieved = r.searched.some((q) => (qmap[q.text] ?? []).some((l) => twins.has(l.slug)));
      const tr = "trace" in r ? (r as { trace: { candidates: string[]; rated: string[]; shortlist: string[] } }).trace : null;
      const has = (xs: string[]) => xs.some((x) => twins.has(x));
      // Where the known listing was lost (or where it ended up).
      const stage = !retrieved ? "never searched"
        : idx === 0 ? "ranked first"
        : idx >= 0 && idx < 5 ? "top 5"
        : !tr ? "found, ranked below 5"
        : !has(tr.candidates) ? "merged as duplicate"
        : !has(tr.rated) ? "screened out"
        : !has(tr.shortlist) ? "rated, not shortlisted"
        : "shortlisted, ranked below 5";
      // What a person would see: the by-need groups' picks, or the flat list.
      const led = "listingScores" in r ? (r as unknown as { listingScores: { slug: string; per_item: Record<string, number> }[]; groups: { picks: { listing: { slug: string } }[] }[] }) : null;
      const shownSlugs = led && led.groups.length ? [...new Set(led.groups.flatMap((g) => g.picks.map((p) => p.listing.slug)))] : ranked;
      const fits = new Map((led?.listingScores ?? []).map((s) => [s.slug, s.per_item]));
      const top5 = ranked.slice(0, 5);
      const needIds = interp.items.map((it) => it.id);
      const bestNeed = (slug: string) => Object.entries(fits.get(slug) ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0];
      const repeatCounts = top5.reduce<Record<string, number>>((acc, s) => { const n = bestNeed(s); if (n) acc[n] = (acc[n] ?? 0) + 1; return acc; }, {});
      arms[arm] = {
        stage,
        shown: shownSlugs.some((s) => twins.has(s)),
        shownCount: shownSlugs.length,
        coverage5: led ? needIds.filter((n) => top5.some((s) => (fits.get(s)?.[n] ?? 0) >= 0.5)).length / needIds.length : undefined,
        repeats5: led ? Math.max(0, ...Object.values(repeatCounts)) : undefined,
        decoys5: top5.filter((s) => decoySlugs.has(s)).length,
        decoysShown: shownSlugs.filter((s) => decoySlugs.has(s)).length,
        rank: idx < 0 ? null : idx + 1,
        retrieved: r.searched.some((q) => (qmap[q.text] ?? []).some((l) => twins.has(l.slug))),
        queries: r.searched.length,
        ranked,
        input: u.reduce((a, x) => a + x.input_tokens, 0),
        output: u.reduce((a, x) => a + x.output_tokens, 0),
        cost: cost(u),
        ms: performance.now() - s,
        steps: u.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.step ?? "all"]: (acc[x.step ?? "all"] ?? 0) + x.input_tokens }), {}),
        missing: scorer instanceof JevScorer ? scorer.missing : 0,
        requests: u.length,
      };
    } catch (e) {
      arms[arm] = { rank: null, retrieved: false, queries: 0, ranked: [], input: 0, output: 0, cost: 0, ms: performance.now() - s, error: String(e instanceof Error ? e.message : e).slice(0, 160) };
    }
  }
  results.push({ id: t.id, text: t.text, known: t.known.slug, reachable, arms });
  saveJev();
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
  const steps: Record<string, number> = {};
  for (const r of valid) for (const [k, v] of Object.entries(r.arms[a]!.steps ?? {})) steps[k] = (steps[k] ?? 0) + v / valid.length;
  const missing = valid.reduce((s, r) => s + (r.arms[a]!.missing ?? 0), 0);
  const requests = mean(valid.map((r) => r.arms[a]!.requests ?? 0));
  const stages: Record<string, number> = {};
  for (const r of valid) stages[r.arms[a]!.stage ?? "?"] = (stages[r.arms[a]!.stage ?? "?"] ?? 0) + 1;
  const shown = valid.filter((r) => r.arms[a]!.shown).length;
  const shownCount = mean(valid.map((r) => r.arms[a]!.shownCount ?? 0));
  const cov = valid.map((r) => r.arms[a]!.coverage5).filter((x): x is number => x !== undefined);
  const rep5 = valid.map((r) => r.arms[a]!.repeats5).filter((x): x is number => x !== undefined);
  const decoys5 = mean(valid.map((r) => r.arms[a]!.decoys5 ?? 0));
  const decoyTasks = valid.filter((r) => (r.arms[a]!.decoys5 ?? 0) > 0).length;
  const decoysShown = mean(valid.map((r) => r.arms[a]!.decoysShown ?? 0));
  summary[a] = { ...row, steps, missing, requests, stages, shown, shownCount, coverage5: cov.length ? mean(cov) : null, repeats5: rep5.length ? mean(rep5) : null, decoys5, decoyTasks, decoysShown };
  console.log(`${a.padEnd(18)} hit@1 ${pct(row.hit1 / row.n)} hit@3 ${pct(row.hit3 / row.n)} hit@5 ${pct(row.hit5 / row.n)} (${pct(row.hit5_ci[0])}-${pct(row.hit5_ci[1])})  MRR ${row.mrr.toFixed(2)}  never searched ${never}  queries ${row.queries.toFixed(1)}  tokens ${Math.round(row.input)}/${Math.round(row.output)}  $${row.cost.toFixed(4)}  ${Math.round(row.ms_median)} ms${freshJev ? "" : " (replayed Jev answers: time not comparable)"}`);
  console.log(`${"".padEnd(18)} where the known listing ended up: ${Object.entries(stages).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`${"".padEnd(18)} shown to the person: ${shownCount.toFixed(1)} results, known listing among them in ${shown} of ${valid.length}${cov.length ? `; needs with a match in the top 5 ${Math.round(mean(cov) * 100)}%; most top-5 slots for one need ${mean(rep5).toFixed(1)}` : ""}${decoyCount ? `; junk in top 5 ${decoys5.toFixed(2)} per project (${decoyTasks} projects), junk shown ${decoysShown.toFixed(2)}` : ""}`);
  console.log(`${"".padEnd(18)} input tokens by step: ${Object.entries(steps).map(([k, v]) => `${k} ${Math.round(v)}`).join(", ")}; ${requests.toFixed(1)} model requests per search; missing answers ${missing}`);
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
