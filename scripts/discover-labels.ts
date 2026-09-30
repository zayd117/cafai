// Labelling sheet for the discovery bake-off (docs/DISCOVER_BAKEOFF.md).
//   npm run discover:labels -- --export                     # writes eval/reports/discover-labelling-sheet.csv
//   npm run discover:labels -- --import <filled-sheet.csv>  # writes relevant / irrelevant into eval/discover/cases/*.json
// Export lists every listing each case's queries retrieve (not just what an arm ranked), so labels stay valid for any arm.
// Cases without a fixed interpretation are skipped here: they need Claude to interpret first (ANTHROPIC_API_KEY).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cachedFetch, listingsFor, warmCache, type DiscoverCase } from "../src/discover/bakeoff";
import { formatCase, readLabels, sheetCsv } from "../src/discover/labels";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const root = fileURLToPath(new URL("..", import.meta.url));
const casesDir = join(root, arg("cases") ?? "eval/discover/cases");
const files = existsSync(casesDir) ? readdirSync(casesDir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort() : [];
const cases: DiscoverCase[] = files.map((f) => JSON.parse(readFileSync(join(casesDir, f), "utf8")));
if (!cases.length) { console.error(`no cases in ${casesDir}`); process.exit(2); }

if (process.argv.includes("--export")) {
  const cachePath = join(root, arg("cache") ?? "eval/discover/search-cache.json");
  const out = join(root, arg("out") ?? "eval/reports/discover-labelling-sheet.csv");
  const store = new Map<string, { status: number; body: string }>(existsSync(cachePath) ? Object.entries(JSON.parse(readFileSync(cachePath, "utf8"))) : []);
  const f = cachedFetch(fetch, store);
  const ready = cases.filter((c) => c.interpretation);
  for (const c of cases.filter((x) => !x.interpretation)) console.warn(`skipping ${c.id}: no fixed interpretation (needs ANTHROPIC_API_KEY to interpret first)`);
  if (!ready.length) { console.error("nothing to export"); process.exit(2); }
  await warmCache(ready.map((c) => c.interpretation!), f);
  const sheet = await Promise.all(ready.map(async (c) => ({ c, listings: await listingsFor(c.interpretation!, f) })));
  for (const { c, listings } of sheet) if (!listings.length) { console.error(`${c.id}: no listings came back (search failed?); nothing written`); process.exit(1); }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, sheetCsv(sheet));
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(Object.fromEntries(store), null, 1));
  console.log(`wrote ${out}: ${sheet.map(({ c, listings }) => `${c.id} ${listings.length}`).join(", ")} listings`);
  console.log("Fill the label column (relevant, irrelevant, unsure or blank), then: npm run discover:labels -- --import <file>");
  console.log(`Searches saved to ${cachePath}; later bake-off runs need --cache ${arg("cache") ?? "eval/discover/search-cache.json"} to rate these same listings.`);
} else if (arg("import")) {
  const res = readLabels(readFileSync(arg("import")!, "utf8"), cases);
  if (res.errors.length) {
    console.error(`nothing written; fix these rows:\n${res.errors.map((e) => `  ${e}`).join("\n")}`);
    process.exit(1);
  }
  for (const [id, v] of res.changes) {
    const i = cases.findIndex((c) => c.id === id);
    writeFileSync(join(casesDir, files[i]!), formatCase({ ...cases[i], relevant: v.relevant, irrelevant: v.irrelevant }) + "\n");
    console.log(`${id}: ${v.relevant.length} relevant, ${v.irrelevant.length} irrelevant`);
  }
  const { relevant, irrelevant, unsure, blank } = res.counts;
  console.log(`rows: ${relevant} relevant, ${irrelevant} irrelevant, ${unsure} unsure, ${blank} blank (blank = left as it was)`);
} else {
  console.error("usage: --export [--cache <file>] [--out <file>]   or   --import <filled-sheet.csv>");
  process.exit(2);
}
