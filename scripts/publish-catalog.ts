// Catalog pipeline step (plan §17): load, validate and publish the snapshot. Only the cafai_catalog role may write it.
// Usage: DATABASE_CATALOG_URL=... npx tsx scripts/publish-catalog.ts [--fixtures]
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadCatalog } from "../src/catalog/load";
import { publishSnapshot } from "../src/db/runs";

const url = process.env.DATABASE_CATALOG_URL;
if (!url) {
  console.error("DATABASE_CATALOG_URL is required");
  process.exit(2);
}
const res = loadCatalog({ root: fileURLToPath(new URL("../catalog", import.meta.url)), fixtures: process.argv.includes("--fixtures") });
if (!res.ok) {
  for (const e of res.errors) console.error(`${e.file}: ${e.message}`);
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
await publishSnapshot(pool, res.snapshot);
await pool.end();
console.log(`published ${res.snapshot.mode} snapshot ${res.snapshot.version}`);
