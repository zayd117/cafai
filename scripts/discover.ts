// Discovery loop, live: Claude interprets -> Jev scores queries -> mcp.market search -> Jev scores results -> rank -> Claude explains.
//   npm run discover -- --text "I'm making a calorie tracker app for phones"
//   npm run discover -- --mock                 # no Claude key: scripted interpretation (calorie/excel texts only), live Jev and live mcp.market
// Exploratory: not part of the closed-world engine (listing text is third-party). Says nothing about quality until tuned on real cases.
import { jevKeyFrom } from "../src/engine/providers/jev";
import { DiscoverClaude } from "../src/discover/claude";
import { costMicros } from "../src/config/pricing";
import { discover, type Interpreter } from "../src/discover/run";
import type { Interpretation } from "../src/discover/types";
import { JevScorer } from "../src/discover/scorer";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const mock = process.argv.includes("--mock");
const text = arg("--text") ?? "I'm making a calorie and macro tracker app for phones. I use Claude Code. I don't really know what I need.";

const jevKey = jevKeyFrom();
if (!jevKey) {
  console.error("No TypeSafe key. Add TYPESAFE_API_KEY (or JEV_API_KEY) as an environment variable, then start a new session.");
  process.exit(2);
}
if (!mock && !process.env.ANTHROPIC_API_KEY) {
  console.error("No ANTHROPIC_API_KEY. Set it, or pass --mock to use the scripted interpretation (Jev and mcp.market stay live).");
  process.exit(2);
}

// Scripted stand-ins for Claude, picked by keyword so --mock never answers a different question than the one asked.
// Each deliberately includes one drifting query for Jev to catch.
const scripts: { match: RegExp; out: Interpretation }[] = [
  {
    match: /calorie|macro|nutrition/i,
    out: {
      items: [
        { id: "i0", text: "A place to look up food and nutrition facts" },
        { id: "i1", text: "A place to save each person's meals and totals" },
      ],
      queries: [
        { id: "q0", item_id: "i0", text: "food nutrition database" },
        { id: "q1", item_id: "i0", text: "calorie lookup" },
        { id: "q2", item_id: "i0", text: "stock market prices" },
        { id: "q3", item_id: "i1", text: "app database storage" },
        { id: "q4", item_id: "i1", text: "postgres sqlite" },
      ],
    },
  },
  {
    match: /excel|excele|spreadsheet|sheet/i,
    out: {
      items: [
        { id: "i0", text: "Read an Excel spreadsheet from PHP and detect when its cells change" },
        { id: "i1", text: "Send real-time desktop notifications when something changes" },
      ],
      queries: [
        { id: "q0", item_id: "i0", text: "excel spreadsheet reader" },
        { id: "q1", item_id: "i0", text: "xlsx file change watcher" },
        { id: "q2", item_id: "i0", text: "weather forecast api" },
        { id: "q3", item_id: "i1", text: "desktop notifications" },
        { id: "q4", item_id: "i1", text: "real-time push notification" },
      ],
    },
  },
];
const script = scripts.find((s) => s.match.test(text));
if (mock && !script) {
  console.error("--mock has no scripted interpretation for this text (it knows calorie/nutrition and excel/spreadsheet). Set ANTHROPIC_API_KEY and drop --mock.");
  process.exit(2);
}
const scripted: Interpreter = { interpret: async () => script!.out };

const claude = mock ? null : new DiscoverClaude();
const jev = new JevScorer({ apiKey: jevKey, model: process.env.CAFAI_JEV_MODEL });
const t0 = Date.now();
const r = await discover({ text, claude: claude ?? scripted, jev });

console.log(`input: ${text}\ninterpreter: ${claude ? claude.id : "MOCK (scripted)"}; scorer: ${jev.id}; ${Date.now() - t0} ms\n`);
console.log("items:");
for (const it of r.interpretation.items) console.log(`  ${it.id}  ${it.text}`);
console.log("\nqueries (Jev score = faithful x (1 - drift)):");
for (const q of r.interpretation.queries) {
  const s = r.queryScores.find((x) => x.query_id === q.id)!;
  const searched = r.searched.find((x) => x.query_id === q.id);
  const tag = searched ? (searched.error ? `SEARCH FAILED: ${searched.error}` : `searched, ${searched.found} results`) : "dropped";
  console.log(`  ${q.id} [${q.item_id}] "${q.text}"  faithful ${s.faithful.toFixed(2)}, drift ${s.drift.toFixed(2)}, score ${s.score.toFixed(2)}  -> ${tag}`);
}
if (r.uncovered_items.length) console.log(`\nno query kept for: ${r.uncovered_items.join(", ")}`);
console.log(`\nranked (${r.ranked.length}):`);
r.ranked.forEach((x, n) => {
  const l = x.listing;
  const price = l.price_micros ? `$${(l.price_micros / 1e6).toFixed(2)}/call` : "free";
  console.log(`${n + 1}. ${l.title ?? l.name}  [${l.grade ?? "no grade"} ${l.grade_score ?? "-"}, ${price}]  final ${x.final.toFixed(3)} = fit ${x.fit.toFixed(2)}, query ${x.p_query.toFixed(2)}, trust ${x.trust.toFixed(2)}${x.weak ? "  WEAK FIT" : ""}`);
  console.log(`   covers: ${x.covers.join(", ") || "none confidently"}; found by ${x.found_by.join(", ")}\n   ${r.explanations.get(l.slug) ?? l.description}\n   ${l.url}`);
});
const usage = [...jev.usage, ...(claude?.usage ?? [])];
const jevMicros = jev.usage.reduce((s, u) => s + (costMicros(u) ?? 0), 0);
console.log(`\nJev: ${jev.usage.length} requests, ${jev.usage.reduce((s, u) => s + u.input_tokens, 0)} input tokens, ~$${(jevMicros / 1e6).toFixed(6)}; total model calls ${usage.length}`);
process.exit(r.ranked.length ? 0 : 1);
