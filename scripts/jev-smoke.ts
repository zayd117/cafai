// Jev live smoke test (REGISTER A-040): one FIXTURE case, scripted MOCK understanding, live Jev stage-8 decisions.
// Proves key, network and request shape only; says nothing about quality (that is the bake-off on real cases).
//   npm run jev:smoke                        # fx-d-calorie-tracker
//   npm run jev:smoke -- --case fx-c-injection
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/catalog/load";
import { costMicros } from "../src/config/pricing";
import { runPipeline } from "../src/engine/pipeline";
import { JevDecisionProvider, jevKeyFrom } from "../src/engine/providers/jev";
import type { DecisionProvider, JudgmentRequest, ModelResponse } from "../src/engine/providers/types";
import { scriptedFor } from "../src/eval/run";
import type { EvalCase } from "../src/eval/types";

const root = fileURLToPath(new URL("..", import.meta.url));
const i = process.argv.indexOf("--case");
const caseId = i >= 0 ? process.argv[i + 1]! : "fx-d-calorie-tracker";
const apiKey = jevKeyFrom();
if (!apiKey) {
  console.error("No TypeSafe key. Add TYPESAFE_API_KEY (or JEV_API_KEY) as an environment variable in the environment settings, then start a new session.");
  process.exit(2);
}
const c = JSON.parse(readFileSync(join(root, "eval/cases/fixture", `${caseId}.json`), "utf8")) as EvalCase;
const cat = loadCatalog({ root: join(root, "catalog"), fixtures: true });
if (!cat.ok) throw new Error("catalog invalid; run npm run catalog:check");

const jev = new JevDecisionProvider({ apiKey, model: process.env.CAFAI_JEV_MODEL });
const calls: { req: JudgmentRequest; ms: number; res?: ModelResponse; error?: unknown }[] = [];
// Records each call; the engine itself swallows errors (retry, then deterministic-only), so show them here.
const decision: DecisionProvider = {
  id: jev.id,
  judge: async (req) => {
    const t0 = Date.now();
    try {
      const res = await jev.judge(req);
      calls.push({ req, ms: Date.now() - t0, res });
      return res;
    } catch (error) {
      calls.push({ req, ms: Date.now() - t0, error });
      throw error;
    }
  },
};
const s = scriptedFor(c);
const r = await runPipeline({ text: c.text, declaredClients: c.declared_clients, snapshot: cat.snapshot, llm: s, decision, confirmed: true, now: new Date("2026-10-01T00:00:00Z") });

console.log(`case ${c.id} (FIXTURE, understanding is MOCK); decisions: ${jev.id}`);
if (!calls.length) console.log("no Jev call: this case produced no candidates to judge; try --case fx-d-calorie-tracker");
for (const [n, call] of calls.entries()) {
  if (call.error) {
    const e = call.error as { name?: string; status?: number; message?: string };
    console.log(`call ${n + 1}: FAILED after ${call.ms} ms — ${e.name ?? "Error"}${e.status ? ` ${e.status}` : ""}: ${e.message ?? String(e)}`);
    continue;
  }
  const u = call.res!.usage;
  const micros = costMicros(u);
  console.log(`call ${n + 1}: OK in ${call.ms} ms — model ${u.model}, ${u.input_tokens} input / ${u.output_tokens} output tokens, cost ${micros === null ? "unknown (model not in src/config/pricing.ts)" : "$" + (micros / 1e6).toFixed(6)}`);
  console.log(JSON.stringify(call.res!.json, null, 2));
}
console.log(`outcome: ${r.outcome}; degraded: ${r.degraded ?? "no"}; picks: ${r.picks.map((p) => p.offering_id).join(", ") || "none"}`);
process.exit(calls.some((x) => x.res) ? 0 : 1);
