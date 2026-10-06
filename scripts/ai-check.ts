// Checks the AI keys and what a search really costs, with a hard spending cap (docs/DEPLOY.md "Test your keys").
// Free first: looks up the Claude models the engine is set to use and lists the Jev models (neither call is billed).
// Then runs up to --searches FIXTURE searches through the site's own provider wiring, stopping once --max-usd is spent.
// Usage: ANTHROPIC_API_KEY=... [TYPESAFE_API_KEY=...] npx tsx scripts/ai-check.ts [--searches 2] [--max-usd 0.25]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { loadCatalog } from "../src/catalog/load";
import { CONTROLS } from "../src/config/controls";
import { budgetMicros, costMicros } from "../src/config/pricing";
import { runPipeline } from "../src/engine/pipeline";
import { getProviders } from "../src/engine/providers";
import { JEV_DEFAULT_MODEL, jevKeyFrom } from "../src/engine/providers/jev";
import { BilledError, type DecisionProvider, type LlmProvider, type ModelResponse, type Usage } from "../src/engine/providers/types";
import type { EvalCase } from "../src/eval/types";

/** Hard ceilings, whatever is asked for: four fixture searches and one dollar. */
const MAX_SEARCHES = 4;
const MAX_USD = 1;
const CASES = ["fx-d-calorie-tracker", "fx-c-injection", "fx-c-nothing-needed", "fx-f-out-of-scope"];

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
const searches = Math.min(Math.floor(arg("searches", 2)), MAX_SEARCHES);
const maxUsd = Math.min(arg("max-usd", 0.25), MAX_USD);
const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;
const why = (e: unknown) => {
  const x = e as { status?: number; message?: string; error?: { error?: { message?: string } } };
  return `${x.status ? `${x.status} ` : ""}${x.error?.error?.message ?? x.message ?? String(e)}`.slice(0, 300);
};
let failed = false;

// 1. Keys, free.
const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
const models = [...new Set([process.env.CAFAI_MODEL_UNDERSTANDING, process.env.CAFAI_MODEL_JUDGMENT, process.env.CAFAI_MODEL_EXPLANATION]
  .map((m) => m || "claude-sonnet-5-5"))];
if (!anthropicKey) console.log("Claude key: not set (ANTHROPIC_API_KEY); searches would use the MOCK model");
else {
  const client = new Anthropic({ apiKey: anthropicKey, maxRetries: 1 });
  for (const m of models) {
    try {
      const info = await client.models.retrieve(m);
      console.log(`Claude key: OK, ${info.id} is available`);
    } catch (e) {
      failed = true;
      console.log(`Claude key: FAILED for ${m}: ${why(e)}`);
    }
  }
}
const jevKey = jevKeyFrom();
if (!jevKey) console.log("Jev key: not set (TYPESAFE_API_KEY)");
else {
  try {
    const list = await new TypeSafeClient({ apiKey: jevKey, logLevel: "off" }).models.list();
    const pinned = process.env.CAFAI_JEV_MODEL || JEV_DEFAULT_MODEL;
    const has = list.some((m) => m.name === pinned);
    if (!has) failed = true;
    console.log(`Jev key: OK${has ? `, ${pinned} is available` : `, but ${pinned} is not in the account's models (${list.map((m) => m.name).join(", ")})`}`);
  } catch (e) {
    failed = true;
    console.log(`Jev key: FAILED: ${why(e)}`);
  }
}
if (failed || !anthropicKey || searches === 0) {
  const reason = failed ? "fix the key first, so nothing is spent on calls that cannot work" : !anthropicKey ? "they need the Claude key" : "none asked for";
  console.log(`\nNo test searches: ${reason}.`);
  process.exit(failed ? 1 : 0);
}

// 2. Searches, capped. The same provider wiring as the live site, on the FIXTURE catalog.
const root = fileURLToPath(new URL("..", import.meta.url));
const cat = loadCatalog({ root: join(root, "catalog"), fixtures: true });
if (!cat.ok) throw new Error("catalog invalid; run npm run catalog:check");
const providers = getProviders();
console.log(`\nSearches use ${providers.llm.id}${providers.decision.id === providers.llm.id ? "" : `, judgments ${providers.decision.id}`}.`);
console.log(`No new search starts once ${usd(maxUsd * 1e6)} is spent (at most ${searches} searches, FIXTURE tool list).\n`);

interface Call { stage: string; ms: number; usage?: Usage; error?: string }
let calls: Call[] = [];
async function meter(stage: string, run: () => Promise<ModelResponse>): Promise<ModelResponse> {
  const t0 = Date.now();
  try {
    const res = await run();
    calls.push({ stage, ms: Date.now() - t0, usage: res.usage });
    return res;
  } catch (e) {
    calls.push({ stage, ms: Date.now() - t0, usage: e instanceof BilledError ? e.usage : undefined, error: why(e) });
    throw e;
  }
}
const llm: LlmProvider = { id: providers.llm.id, understand: (r) => meter("understanding", () => providers.llm.understand(r)), explain: (r) => meter("explanation", () => providers.llm.explain(r)) };
const decision: DecisionProvider = { id: providers.decision.id, judge: (r) => meter("judgment", () => providers.decision.judge(r)) };

let spent = 0;
let done = 0;
for (const id of CASES.slice(0, searches)) {
  if (spent >= maxUsd * 1e6) {
    console.log(`Stopped: ${usd(spent)} spent, cap reached.`);
    break;
  }
  const c = JSON.parse(readFileSync(join(root, "eval/cases/fixture", `${id}.json`), "utf8")) as EvalCase;
  calls = [];
  const t0 = Date.now();
  // Fixture offerings are dated 2026-09-29; a fixed clock keeps them inside the staleness window (as npm run eval does).
  const r = await runPipeline({ text: c.text, declaredClients: c.declared_clients, snapshot: cat.snapshot, llm, decision, confirmed: true, now: new Date("2026-10-01T00:00:00Z") });
  const cost = calls.reduce((a, x) => a + (x.usage ? budgetMicros(x.usage) : 0), 0);
  spent += cost;
  done++;
  console.log(`search ${done}: "${c.text.slice(0, 60)}…" → ${r.outcome}, ${r.picks.length} picks${r.degraded ? `, DEGRADED (${r.degraded})` : ""}, ${((Date.now() - t0) / 1000).toFixed(1)} s, ${usd(cost)}`);
  for (const x of calls) {
    const u = x.usage;
    const price = u ? (costMicros(u) === null ? `${usd(budgetMicros(u))} (unknown model, counted at the highest price)` : usd(budgetMicros(u))) : "not billed";
    console.log(`  ${x.stage.padEnd(13)} ${u ? `${u.model}, ${u.input_tokens} in / ${u.output_tokens} out` : "no answer"}, ${(x.ms / 1000).toFixed(1)} s, ${price}${x.error ? ` FAILED: ${x.error}` : ""}`);
    if (x.error) failed = true;
  }
}

const per = done ? spent / done : 0;
console.log(`\nSpent ${usd(spent)} on ${done} test searches.`);
if (per > 0) {
  console.log(`About ${usd(per)} per search: $1 covers about ${Math.floor(1e6 / per)} searches; the site's daily budget ` +
    `($${CONTROLS.dailyAiBudgetUsd}, CAFAI_DAILY_AI_BUDGET_USD) turns the AI off after about ${Math.floor((CONTROLS.dailyAiBudgetUsd * 1e6) / per)} a day.`);
}
process.exit(failed ? 1 : 0);
