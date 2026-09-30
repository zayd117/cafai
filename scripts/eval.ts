// Evaluation harness CLI (plan §9 Evaluation and release gate, §25 ablations and blind baseline).
//   npx tsx scripts/eval.ts [--cases eval/cases/fixture] [--live] [--baseline eval/baseline.fixture.json] [--write-baseline]
//   npx tsx scripts/eval.ts --cases eval/cases/real --live --export-pairs out/ --seed <secret>
//   npx tsx scripts/eval.ts --score-pairs out/key.json judgments.json
// Default (no --live) runs the MOCK scripts inside fixture cases; --live uses the configured model provider.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/catalog/load";
import { runPipeline, type Ablations } from "../src/engine/pipeline";
import { getProviders } from "../src/engine/providers";
import { makePair, neutralText, scorePairs, type BlindPair, type PairKey } from "../src/eval/blind";
import { gate, summarize, type Report } from "../src/eval/metrics";
import { runCase } from "../src/eval/run";
import type { EvalCase } from "../src/eval/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const root = fileURLToPath(new URL("..", import.meta.url));

if (flag("score-pairs")) {
  const [keyFile, judgmentsFile] = process.argv.slice(process.argv.indexOf("--score-pairs") + 1);
  const res = scorePairs(JSON.parse(readFileSync(keyFile!, "utf8")), JSON.parse(readFileSync(judgmentsFile!, "utf8")));
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}

const casesDir = join(root, arg("cases") ?? "eval/cases/fixture");
const cases: EvalCase[] = readdirSync(casesDir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(casesDir, f), "utf8")));
if (cases.length === 0) {
  console.error(`no cases in ${casesDir} (real labeled set is BLOCKED, REGISTER A-008)`);
  process.exit(2);
}
const fixtures = cases.every((c) => c.fixture);
if (!fixtures && cases.some((c) => c.fixture)) {
  console.error("do not mix fixture and real cases in one run");
  process.exit(2);
}
const cat = loadCatalog({ root: join(root, "catalog"), fixtures });
if (!cat.ok) {
  console.error("catalog invalid", cat.errors);
  process.exit(1);
}
const snapshot = cat.snapshot;
const live = flag("live");
const providers = live ? getProviders() : undefined;
if (live && providers?.mock) console.warn("warning: --live requested but the provider is MOCK (no credentials configured)");
// Fixture offerings are dated 2026-09-29; a fixed clock keeps fixture runs reproducible as time passes.
const now = new Date(arg("now") ?? (fixtures ? "2026-10-01T00:00:00Z" : Date.now()));

const arms: { name: string; ablations: Ablations }[] = [
  { name: "full", ablations: {} },
  { name: "no_expansion (H2)", ablations: { noExpansion: true } },
  { name: "forward_only (H3)", ablations: { forwardOnly: true } },
  { name: "evidence_gates_off (H4)", ablations: { noEvidenceGates: true } },
];
const reports: Record<string, Report> = {};
for (const arm of arms) {
  const results = [];
  for (const c of cases) results.push(await runCase({ c, snapshot, providers, ablations: arm.ablations, now }));
  reports[arm.name] = summarize(cases, results);
}

const fmt = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : v === null ? "—" : String(v));
const keys: (keyof Report)[] = [
  "cases", "capability_recall_at_5", "precision_at_3", "novelty_rate", "evidence_faithfulness", "expansion_coverage",
  "probably_not_needed_accuracy", "outcome_accuracy", "harmful_picks", "invalid_ids", "cost_per_run_usd", "latency_p95_ms", "degraded_runs",
];
console.log(`mode: ${fixtures ? "FIXTURE catalog" : "real catalog"}, provider: ${live ? providers!.llm.id : "MOCK (scripted in cases)"}`);
console.log(["metric", ...arms.map((a) => a.name)].join(" | "));
for (const k of keys) console.log([k, ...arms.map((a) => fmt(reports[a.name]![k]))].join(" | "));
console.log("useful rate by Match band (full):", JSON.stringify(reports.full!.useful_rate_by_match_band));
console.log("useful rate by Confidence band (full):", JSON.stringify(reports.full!.useful_rate_by_confidence_band));

const outDir = join(root, "eval/reports");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${fixtures ? "fixture" : "real"}-latest.json`), JSON.stringify({ versions: { catalog: snapshot.version }, reports }, null, 2));

const exportDir = arg("export-pairs");
if (exportDir) {
  const pairs: BlindPair[] = [];
  const pairKeys: PairKey[] = [];
  const seed = arg("seed") ?? "";
  if (!seed) {
    console.error("--export-pairs needs --seed <secret> so order cannot be guessed");
    process.exit(2);
  }
  for (const c of cases.filter((x) => x.assistant_answer)) {
    const r = await runPipeline({ text: c.text, declaredClients: c.declared_clients, snapshot, llm: providers?.llm ?? (await import("../src/eval/run")).scriptedFor(c), decision: providers?.decision ?? (await import("../src/eval/run")).scriptedFor(c), confirmed: true, now });
    const { pair, key } = makePair(c.id, c.text, neutralText(r, snapshot), c.assistant_answer!, seed);
    pairs.push(pair);
    pairKeys.push(key);
  }
  mkdirSync(exportDir, { recursive: true });
  writeFileSync(join(exportDir, "pairs.json"), JSON.stringify(pairs, null, 2));
  writeFileSync(join(exportDir, "key.json"), JSON.stringify(pairKeys, null, 2));
  console.log(`exported ${pairs.length} blind pairs (cases without assistant_answer skipped)`);
}

const baselineFile = join(root, arg("baseline") ?? `eval/baseline.${fixtures ? "fixture" : "real"}.json`);
if (flag("write-baseline")) {
  writeFileSync(baselineFile, JSON.stringify(reports.full, null, 2));
  console.log(`baseline written: ${baselineFile}`);
}
const baseline = existsSync(baselineFile) ? (JSON.parse(readFileSync(baselineFile, "utf8")) as Report) : null;
const failures = gate(reports.full!, baseline);
if (failures.length) {
  console.error("RELEASE GATE FAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`release gate passed${baseline ? " against baseline" : " (no baseline yet: harmful picks and invalid ids only)"}`);
