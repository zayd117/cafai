// Evaluation and bake-off CLI (plan §9 Evaluation and release gate, §25 bake-off, ablations and blind baseline).
//   npm run eval                                          # FIXTURE cases, default arms, release gate
//   npm run eval -- --arms llm,llm+jev --repeats 3        # bake-off arms, repeated for consistency
//   npm run eval -- --cases eval/cases/real --live --repeats 3 --arms llm,llm+jev,no_expansion,forward_only,evidence_gates_off
//   npm run eval -- --cases eval/cases/real --live --export-pairs out/ --seed <secret>   # A0 blind pairs (baseline answers)
//   npm run eval -- --score-pairs out/key.json judgments.json
// Default (no --live) runs the MOCK scripts inside fixture cases; --live uses the configured model provider.
// Pass lines live in eval/bakeoff.json and must be written before a real run.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/catalog/load";
import { runPipeline } from "../src/engine/pipeline";
import { getProviders } from "../src/engine/providers";
import type { DecisionProvider, LlmProvider } from "../src/engine/providers/types";
import { ARMS, armReport, DEFAULT_ARMS, evaluateCheck, type ArmReport, type Check } from "../src/eval/bakeoff";
import { makePair, neutralText, scorePairs, type BlindPair, type PairKey } from "../src/eval/blind";
import { gate, type Report } from "../src/eval/metrics";
import { runCase, scriptedFor } from "../src/eval/run";
import type { CaseResult, EvalCase } from "../src/eval/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);
const root = fileURLToPath(new URL("..", import.meta.url));

if (flag("score-pairs")) {
  const [keyFile, judgmentsFile] = process.argv.slice(process.argv.indexOf("--score-pairs") + 1);
  console.log(JSON.stringify(scorePairs(JSON.parse(readFileSync(keyFile!, "utf8")), JSON.parse(readFileSync(judgmentsFile!, "utf8"))), null, 2));
  process.exit(0);
}

const casesDir = join(root, arg("cases") ?? "eval/cases/fixture");
const cases: EvalCase[] = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(casesDir, f), "utf8")));
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
const repeats = Math.max(1, Number(arg("repeats") ?? 1));
const armNames = (arg("arms") ?? DEFAULT_ARMS.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
for (const a of armNames) if (!ARMS[a]) { console.error(`unknown arm "${a}"; known: ${Object.keys(ARMS).join(", ")}`); process.exit(2); }

/** Jev sits behind the Decision interface (§17). Not built yet: the TypeSafe API docs are unreachable here (A-040). */
function jevDecision(): DecisionProvider | null {
  return null;
}

const reports: Record<string, ArmReport> = {};
const skipped: Record<string, string> = {};
for (const name of armNames) {
  const arm = ARMS[name]!;
  const jev = arm.decision === "jev" ? jevDecision() : null;
  if (arm.decision === "jev" && !jev) {
    skipped[name] = "Jev provider not built yet (needs TypeSafe API docs, key and network access; REGISTER A-040)";
    continue;
  }
  const runs: CaseResult[][] = [];
  for (let r = 0; r < repeats; r++) {
    const results: CaseResult[] = [];
    for (const c of cases) {
      const base: { llm: LlmProvider; decision: DecisionProvider } = providers ?? (() => { const s = scriptedFor(c); return { llm: s, decision: s }; })();
      results.push(await runCase({ c, snapshot, providers: { llm: base.llm, decision: jev ?? base.decision }, ablations: arm.ablations, now }));
    }
    runs.push(results);
  }
  reports[name] = armReport(name, cases, runs);
}

const fmt = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : v === null || v === undefined ? "—" : String(v));
const keys: (keyof ArmReport)[] = [
  "cases", "repeats", "capability_recall_at_5", "precision_at_3", "false_positive_rate", "calibration_error", "consistency",
  "novelty_rate", "evidence_faithfulness", "expansion_coverage", "probably_not_needed_accuracy", "outcome_accuracy",
  "harmful_picks", "invalid_ids", "cost_per_run_usd", "latency_p95_ms", "degraded_runs",
];
const shown = armNames.filter((a) => reports[a]);
console.log(`mode: ${fixtures ? "FIXTURE catalog and cases (proves wiring only, not quality)" : "real catalog and cases"}; provider: ${live ? providers!.llm.id : "MOCK (scripted in cases)"}; repeats: ${repeats}`);
console.log(["metric", ...shown.map((a) => ARMS[a]!.label)].join(" | "));
for (const k of keys) console.log([k, ...shown.map((a) => fmt(reports[a]![k]))].join(" | "));
for (const [a, why] of Object.entries(skipped)) console.log(`NOT RUN ${ARMS[a]!.label}: ${why}`);

// Pass lines (plan §25), written before the run.
const rulesFile = join(root, arg("rules") ?? "eval/bakeoff.json");
if (existsSync(rulesFile)) {
  const rules = JSON.parse(readFileSync(rulesFile, "utf8")) as { checks: Check[]; written_on: string };
  console.log(`\npass lines from ${arg("rules") ?? "eval/bakeoff.json"} (written ${rules.written_on})${fixtures ? " — FIXTURE results, not evidence" : ""}:`);
  for (const ch of rules.checks) {
    const res = evaluateCheck(ch, reports);
    console.log(`  ${res.verdict.padEnd(17)} ${res.id}: ${res.detail}`);
  }
}

const outDir = join(root, "eval/reports");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `${fixtures ? "fixture" : "real"}-latest.json`), JSON.stringify({ versions: { catalog: snapshot.version }, repeats, reports, skipped }, null, 2));

// A0 baseline: blind pairs against a general assistant's saved answer (ChatGPT or Claude chat).
const exportDir = arg("export-pairs");
if (exportDir) {
  const seed = arg("seed") ?? "";
  if (!seed) {
    console.error("--export-pairs needs --seed <secret> so order cannot be guessed");
    process.exit(2);
  }
  const pairs: BlindPair[] = [];
  const pairKeys: PairKey[] = [];
  for (const c of cases.filter((x) => x.baseline?.answer)) {
    const p = providers ?? (() => { const s = scriptedFor(c); return { llm: s, decision: s }; })();
    const r = await runPipeline({ text: c.text, declaredClients: c.declared_clients, snapshot, llm: p.llm, decision: p.decision, confirmed: true, now });
    const { pair, key } = makePair(c.id, c.text, neutralText(r, snapshot), c.baseline!.answer, seed);
    pairs.push(pair);
    pairKeys.push(key);
  }
  mkdirSync(exportDir, { recursive: true });
  writeFileSync(join(exportDir, "pairs.json"), JSON.stringify(pairs, null, 2));
  writeFileSync(join(exportDir, "key.json"), JSON.stringify(pairKeys, null, 2));
  console.log(`exported ${pairs.length} blind pairs (cases without a baseline answer skipped)`);
}

// Release gate (§9) on the LLM-only arm.
if (!reports.llm) process.exit(0);
const baselineFile = join(root, arg("baseline") ?? `eval/baseline.${fixtures ? "fixture" : "real"}.json`);
const gateReport: Report = reports.llm;
if (flag("write-baseline")) {
  writeFileSync(baselineFile, JSON.stringify(gateReport, null, 2));
  console.log(`baseline written: ${baselineFile}`);
}
const baseline = existsSync(baselineFile) ? (JSON.parse(readFileSync(baselineFile, "utf8")) as Report) : null;
const failures = gate(gateReport, baseline);
if (failures.length) {
  console.error("RELEASE GATE FAILED:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log(`\nrelease gate passed${baseline ? " against baseline" : " (no baseline yet: harmful picks and invalid ids only)"}`);
