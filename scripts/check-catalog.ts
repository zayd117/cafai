// Catalog-as-code CI check (plan §11: YAML in Git, schema-checked in CI, changed only by reviewed PR).
// Usage: npx tsx scripts/check-catalog.ts [--fixtures]
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/catalog/load";

const root = fileURLToPath(new URL("../catalog", import.meta.url));
const fixtures = process.argv.includes("--fixtures");
const res = loadCatalog({ root, fixtures });

if (!res.ok) {
  for (const e of res.errors) console.error(`${e.file}: ${e.message}`);
  console.error(`catalog (${fixtures ? "fixture" : "real"}) INVALID: ${res.errors.length} issue(s)`);
  process.exit(1);
}
const s = res.snapshot;
console.log(
  `catalog (${s.mode}) OK: ${s.clients.length} clients, ${s.taxonomy.length} capabilities, ${s.offerings.length} offerings, version ${s.version.slice(0, 19)}`,
);
if (s.mode === "real" && (s.taxonomy.length === 0 || s.offerings.length === 0)) {
  console.log("note: real taxonomy/offerings are empty — BLOCKED on concierge data and curation (register A-006, A-007).");
}
