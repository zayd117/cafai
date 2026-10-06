// Applies db/migrations/*.sql in order, once each, as the owner role. Usage: DATABASE_OWNER_URL=... npx tsx scripts/migrate.ts
// `role` lets a login that may SET ROLE to cafai_owner run them as the owner (production: scripts/deploy-db.ts).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import pg from "pg";

export async function migrate(connectionString: string, role?: string): Promise<string[]> {
  const dir = fileURLToPath(new URL("../db/migrations", import.meta.url));
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    if (role) await client.query(`SET ROLE ${client.escapeIdentifier(role)}`);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const name of readdirSync(dir).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort()) {
      if (done.has(name)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, name), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
        applied.push(name);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${name} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_OWNER_URL;
  if (!url) {
    console.error("DATABASE_OWNER_URL is required");
    process.exit(2);
  }
  migrate(url).then(
    (a) => console.log(a.length ? `applied: ${a.join(", ")}` : "up to date"),
    (e) => {
      console.error((e as Error).message);
      process.exit(1);
    },
  );
}
