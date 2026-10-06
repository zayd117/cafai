// Checks the AI keys and what a search costs (docs/DEPLOY.md "First, test your keys cheaply").
// Free first: looks up the Claude models the engine is set to use and lists the Jev models (neither call is billed).
// --free: no answers are generated, so nothing is billed. Each Claude call the site would make goes to Anthropic's
//   token counter instead (without max_tokens and the refusal fallback, which only generation takes). That proves the
//   key and the model access, catches most request errors, and counts the input. Answers come from the fixture
//   case's sample script, so later stages get realistic input. It cannot show whether the account has credit.
// Otherwise: runs up to --searches real FIXTURE searches through the site's own provider wiring, stopping once
//   --max-usd is spent.
// Usage: ANTHROPIC_API_KEY=... [TYPESAFE_API_KEY=...] npx tsx scripts/ai-check.ts [--free] [--searches 2] [--max-usd 0.25]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { loadCatalog } from "../src/catalog/load";
import { CONTROLS } from "../src/config/controls";
import { budgetMicros, costMicros } from "../src/config/pricing";
import { runPipeline } from "../src/engine/pipeline";
import { anthropicOptions, getProviders } from "../src/engine/providers";
import { AnthropicProvider } from "../src/engine/providers/anthropic";
import { JEV_DEFAULT_MODEL, jevKeyFrom } from "../src/engine/providers/jev";
import { BilledError, type DecisionProvider, type LlmProvider, type ModelResponse, type Usage } from "../src/engine/providers/types";
import { scriptedFor } from "../src/eval/run";
import type { EvalCase } from "../src/eval/types";

/** Hard ceilings, whatever is asked for: four fixture searches and one dollar. */
const MAX_SEARCHES = 4;
const MAX_USD = 1;
const CASES = ["fx-d-calorie-tracker", "fx-c-injection", "fx-c-nothing-needed", "fx-f-out-of-scope"];

const free = process.argv.includes("--free");
const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
// Free runs cost nothing, so they cover every case unless told otherwise.
const searches = Math.min(Math.floor(arg("searches", free ? MAX_SEARCHES : 2)), MAX_SEARCHES);
const maxUsd = Math.min(arg("max-usd", 0.25), MAX_USD);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`;
const why = (e: unknown) => {
  const x = e as { status?: number; message?: string; error?: { error?: { message?: string } } };
  const text = `${x.status ? `${x.status} ` : ""}${x.error?.error?.message ?? x.message ?? String(e)}`.slice(0, 300);
  // Anthropic refuses billed calls while the account has no credit, and possibly the free ones too (unverified).
  return /credit balance/i.test(text) ? `${text} (the account needs some credit first; docs/DEPLOY.md)` : text;
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

// 2. Searches on the FIXTURE catalog: counted for free, or run for real under the cap.
const root = fileURLToPath(new URL("..", import.meta.url));
const cat = loadCatalog({ root: join(root, "catalog"), fixtures: true });
if (!cat.ok) throw new Error("catalog invalid; run npm run catalog:check");
const providers = getProviders();
const sameIds = providers.decision.id === providers.llm.id;
console.log(`\nSearches use ${providers.llm.id}${sameIds ? "" : `, judgments ${providers.decision.id}`}.`);
console.log(free
  ? `FREE run: every Claude call goes to Anthropic's token counter, which is not billed (${plural(searches, "search", "searches")}, FIXTURE tool list).\n`
  : `No new search starts once ${usd(maxUsd * 1e6)} is spent (at most ${plural(searches, "search", "searches")}, FIXTURE tool list).\n`);

interface Call { stage: string; ms: number; usage?: Usage; answerTokens?: number; error?: string; status?: number }
let calls: Call[] = [];
async function meter(stage: string, run: () => Promise<ModelResponse>): Promise<ModelResponse> {
  const t0 = Date.now();
  lastAnswerTokens = undefined;
  try {
    const res = await run();
    calls.push({ stage, ms: Date.now() - t0, usage: res.usage, answerTokens: lastAnswerTokens });
    return res;
  } catch (e) {
    calls.push({ stage, ms: Date.now() - t0, usage: e instanceof BilledError ? e.usage : undefined, error: why(e), status: (e as { status?: number }).status });
    throw e;
  }
}

/** Free mode: an Anthropic client whose `create` sends the same request to the token counter and returns `answer`. */
const counter = new Anthropic({ apiKey: anthropicKey, maxRetries: 1 });
let answer: unknown;
let lastAnswerTokens: number | undefined;
const overhead = new Map<string, number>();
async function countText(model: string, text: string) {
  return (await counter.beta.messages.countTokens({ model, messages: [{ role: "user", content: text }] })).input_tokens;
}
const countingClient = {
  beta: {
    messages: {
      create: async (body: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
        // max_tokens and the refusal fallback only matter when generating; the counter takes everything else as sent.
        const request = { ...body } as Record<string, unknown>;
        for (const k of ["max_tokens", "fallbacks", "betas"]) delete request[k];
        const counted = await counter.beta.messages.countTokens(request as unknown as Anthropic.Beta.MessageCountTokensParams);
        // Size of the sample answer in this model's tokens: a floor for the real answer, before any thinking.
        const text = JSON.stringify(answer);
        if (!overhead.has(body.model)) overhead.set(body.model, (await countText(body.model, "x")) - 1);
        lastAnswerTokens = Math.max(0, (await countText(body.model, text)) - overhead.get(body.model)!);
        return {
          model: body.model,
          stop_reason: "end_turn",
          content: [{ type: "text", text }],
          usage: { input_tokens: counted.input_tokens, output_tokens: 0 },
        };
      },
    },
  },
} as unknown as Pick<Anthropic, "beta">;

function searchProviders(c: EvalCase): { llm: LlmProvider; decision: DecisionProvider } {
  if (!free) {
    return {
      llm: { id: providers.llm.id, understand: (r) => meter("understanding", () => providers.llm.understand(r)), explain: (r) => meter("explanation", () => providers.llm.explain(r)) },
      decision: { id: providers.decision.id, judge: (r) => meter("judgment", () => providers.decision.judge(r)) },
    };
  }
  // Same models and effort as the site, so the counted requests are the ones it would send.
  const counted = new AnthropicProvider({ ...anthropicOptions(), client: countingClient });
  const sample = scriptedFor(c);
  return {
    llm: {
      id: counted.id,
      understand: (r) => meter("understanding", async () => ((answer = (await sample.understand(r)).json), counted.understand(r))),
      explain: (r) => meter("explanation", async () => ((answer = (await sample.explain(r)).json), counted.explain(r))),
    },
    decision: { id: counted.id, judge: (r) => meter("judgment", async () => ((answer = (await sample.judge(r)).json), counted.judge(r))) },
  };
}

/** Rate limits, overload and server errors pass; a 4xx (bad key, no credit, rejected request) would hit the site too. */
const refused = (x: Call) => x.status !== undefined && x.status >= 400 && x.status < 500 && ![408, 409, 429].includes(x.status);
let spent = 0;
let done = 0;
let full = { input: 0, floor: 0, calls: 0, search: 0 };
const trouble = { refused: false, busy: false, invalid: false };
for (const id of CASES.slice(0, searches)) {
  if (!free && spent >= maxUsd * 1e6) {
    console.log(`Stopped: ${usd(spent)} spent, cap reached.`);
    break;
  }
  const c = JSON.parse(readFileSync(join(root, "eval/cases/fixture", `${id}.json`), "utf8")) as EvalCase;
  const { llm, decision } = searchProviders(c);
  calls = [];
  const t0 = Date.now();
  // Fixture offerings are dated 2026-09-29; a fixed clock keeps them inside the staleness window (as npm run eval does).
  const r = await runPipeline({ text: c.text, declaredClients: c.declared_clients, snapshot: cat.snapshot, llm, decision, confirmed: true, now: new Date("2026-10-01T00:00:00Z") });
  const cost = calls.reduce((a, x) => a + (x.usage ? budgetMicros(x.usage) : 0), 0);
  // Free mode: the sample answers' size at the output price, a lower bound because thinking and longer answers add to it.
  const answers = calls.reduce((a, x) => a + (x.usage && x.answerTokens ? budgetMicros({ model: x.usage.model, input_tokens: 0, output_tokens: x.answerTokens }) : 0), 0);
  spent += cost;
  done++;
  const counted = calls.filter((x) => !x.error).length;
  if (cost + answers > full.floor) full = { input: cost, floor: cost + answers, calls: counted, search: done };
  const degraded = r.degraded ? `, DEGRADED (${r.degraded})` : "";
  const outcome = free ? `${plural(counted, "Claude call")} counted${degraded}, input ${usd(cost)}, at least ${usd(cost + answers)}` : `${r.outcome}, ${r.picks.length} picks${degraded}, ${usd(cost)}`;
  console.log(`search ${done}: "${c.text.slice(0, 60)}…" → ${outcome}, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // The search passes when no stage had to fall back, as on the live site, where the engine retries each stage once.
  // A degraded search means Claude's answers could not be used: the site would fall back to simpler rules.
  if (r.degraded) failed = true;
  calls.forEach((x, i) => {
    const u = x.usage;
    const known = u && costMicros(u) !== null;
    const tokens = u ? (free ? `${u.model}, ${u.input_tokens} input tokens counted, sample answer about ${x.answerTokens ?? "?"} tokens` : `${u.model}, ${u.input_tokens} in / ${u.output_tokens} out`) : "no answer";
    const price = u ? `${usd(budgetMicros(u))}${known ? "" : " (unknown model, counted at the highest price)"}` : "not billed";
    const retried = calls.slice(i + 1).some((y) => y.stage === x.stage && !y.error);
    const note = !x.error ? "" : retried ? ` (failed, then the retry worked: ${x.error})` : ` FAILED: ${x.error}`;
    console.log(`  ${x.stage.padEnd(13)} ${tokens}, ${(x.ms / 1000).toFixed(1)} s, ${price}${note}`);
    if (x.error && !retried) {
      if (refused(x)) trouble.refused = true;
      else if (x.status !== undefined || !u) trouble.busy = true;
      else trouble.invalid = true; // billed but unusable answer (paid mode)
    }
  });
  if (r.degraded && !trouble.refused && !trouble.busy && !trouble.invalid) trouble.invalid = true;
}

const verdict = () => {
  if (trouble.refused) return "Anthropic refused some requests (FAILED above); the site's calls would be refused the same way.";
  if (trouble.busy) return "Anthropic was busy or unreachable (FAILED above); run the check again.";
  return free
    ? "The sample answers no longer pass the site's checks (DEGRADED above), a problem in the fixtures, not your key; run npm run eval."
    : "Claude's answers could not be used (DEGRADED or FAILED above), so the site would fall back to simpler rules.";
};
if (free) {
  if (failed) console.log(`\nSpent $0, but the check did not pass. ${verdict()}`);
  else {
    console.log(`\nSpent $0: nothing was generated. The key works, the models are available, and the token counter accepted the ` +
      `site's requests (all but the answer-length limit and the refusal fallback, which only a paid run checks).`);
    console.log(`This does not show that the account has credit: real answers, in paid mode and on the live site, need it.`);
    if (full.calls) {
      console.log(`A full search like search ${full.search} (${plural(full.calls, "Claude call")}) sends ${usd(full.input)} of input and costs at ` +
        `least ${usd(full.floor)} with answers the size of the samples. Thinking and longer answers add to that; only a paid ` +
        `run (without --free) measures it.`);
    }
  }
} else {
  const per = done ? spent / done : 0;
  console.log(`\nSpent ${usd(spent)} on ${plural(done, "test search", "test searches")}.${failed ? ` ${verdict()}` : ""}`);
  if (per > 0) {
    console.log(`About ${usd(per)} per search: $1 covers about ${Math.floor(1e6 / per)} searches; the site's daily budget ` +
      `($${CONTROLS.dailyAiBudgetUsd}, CAFAI_DAILY_AI_BUDGET_USD) turns the AI off after about ${Math.floor((CONTROLS.dailyAiBudgetUsd * 1e6) / per)} a day.`);
  }
}
process.exit(failed ? 1 : 0);
