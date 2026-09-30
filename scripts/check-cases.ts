// Validates evaluation cases against eval/case.schema.json and the matching catalog (fixture or real): every id a
// label names must exist, so a typo can never quietly count as "not recommended".
// Usage: npx tsx scripts/check-cases.ts [eval/cases/fixture] [eval/cases/real]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/catalog/load";
import { createAjv } from "../src/lib/ajv";
import type { EvalCase } from "../src/eval/types";

const root = fileURLToPath(new URL("..", import.meta.url));
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["eval/cases/fixture", "eval/cases/real"];
const validate = createAjv().compile(JSON.parse(readFileSync(join(root, "eval/case.schema.json"), "utf8")));
let problems = 0;
const report = (file: string, msg: string) => {
  problems++;
  console.error(`${file}: ${msg}`);
};

for (const dir of dirs) {
  const abs = join(root, dir);
  if (!existsSync(abs)) continue;
  const files = readdirSync(abs).filter((f) => f.endsWith(".json") && !f.startsWith("_")).sort();
  const fixtures = dir.includes("fixture");
  const cat = loadCatalog({ root: join(root, "catalog"), fixtures });
  if (!cat.ok) {
    report(dir, "catalog invalid; run npm run catalog:check");
    continue;
  }
  const caps = new Set(cat.snapshot.taxonomy.map((c) => c.id));
  const offs = new Set(cat.snapshot.offerings.map((o) => o.id));
  const ids = new Set<string>();
  for (const f of files) {
    const file = join(dir, f);
    const c = JSON.parse(readFileSync(join(abs, f), "utf8")) as EvalCase;
    if (!validate(c)) {
      for (const e of validate.errors ?? []) report(file, `${e.instancePath || "/"} ${e.message}`);
      continue;
    }
    if (f !== `${c.id}.json`) report(file, `file name must be ${c.id}.json`);
    if (ids.has(c.id)) report(file, `duplicate id ${c.id}`);
    ids.add(c.id);
    if (c.fixture !== fixtures) report(file, fixtures ? "cases in eval/cases/fixture must set fixture: true" : "real cases must set fixture: false");
    const L = c.labels;
    for (const cap of [...L.must_recommend, ...L.potentially_missed, ...L.probably_not_needed]) if (!caps.has(cap)) report(file, `unknown capability "${cap}"`);
    for (const o of L.acceptable_offerings) if (!offs.has(o)) report(file, `unknown offering "${o}"`);
    for (const x of L.must_not_recommend) if (!caps.has(x) && !offs.has(x)) report(file, `unknown id "${x}" in must_not_recommend`);
  }
  console.log(`${dir}: ${files.length} case(s) checked`);
}
if (problems) {
  console.error(`${problems} problem(s)`);
  process.exit(1);
}
console.log("cases OK");
