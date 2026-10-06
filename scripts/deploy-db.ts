// Production database steps (plan §17 managed Postgres) for hosts that hand out one non-superuser admin login with
// CREATEROLE and CREATEDB, such as Neon's default role. Run by GitHub Actions only (docs/DEPLOY.md); the app never
// sees the admin login.
// Usage: DATABASE_ADMIN_URL=... npx tsx scripts/deploy-db.ts <setup|migrate|purge>
//   setup    roles, database and grants (idempotent), then migrate. Last, gives cafai_app a new password and writes
//            the app's DATABASE_URL to the file named by APP_DATABASE_URL_FILE (never printed).
//   migrate  migrations as cafai_owner, then both catalog snapshots (real and fixture) as cafai_catalog
//   purge    retention purge (what scripts/worker.ts does hourly on a long-lived host)
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadCatalog } from "../src/catalog/load";
import { publishSnapshot } from "../src/db/runs";
import { migrate } from "./migrate";

export const DB = "cafai";
const ROLES = [["cafai_owner", "NOLOGIN"], ["cafai_catalog", "NOLOGIN"], ["cafai_app", "LOGIN"]] as const;
const isLocal = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);

/** The admin login on the direct endpoint (Neon's pooler would drop SET ROLE between transactions), optionally in `database`. */
export function adminUrl(admin: string, database?: string): string {
  const u = new URL(admin);
  u.hostname = u.hostname.replace(/^([^.]+)-pooler\./, "$1.");
  if (database) u.pathname = `/${database}`;
  if (!u.searchParams.has("sslmode") && !isLocal(u.hostname)) u.searchParams.set("sslmode", "require");
  return u.toString();
}

/** The app's DATABASE_URL: cafai_app in the cafai database, on Neon's pooled endpoint when the host is Neon. */
export function appUrl(admin: string, password: string): string {
  const u = new URL(adminUrl(admin, DB));
  if (u.hostname.endsWith(".neon.tech")) u.hostname = u.hostname.replace(/^([^.]+)\./, "$1-pooler.");
  u.username = "cafai_app";
  u.password = password;
  return u.toString();
}

async function withClient<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export async function setup(admin: string, appUrlFile: string): Promise<void> {
  await withClient(adminUrl(admin), async (c) => {
    const { server_version_num: v } = (await c.query("SHOW server_version_num")).rows[0];
    if (Number(v) < 160000) throw new Error("Postgres 16 or newer is required (GRANT ... WITH SET)");
    for (const [role, login] of ROLES) {
      if (!(await c.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role])).rowCount) await c.query(`CREATE ROLE ${role} ${login}`);
    }
    // The admin may act as the owner and catalog roles (SET ROLE) but never inherits their rights.
    await c.query("GRANT cafai_owner, cafai_catalog TO CURRENT_USER WITH SET TRUE, INHERIT FALSE");
    if (!(await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB])).rowCount) await c.query(`CREATE DATABASE ${DB} OWNER cafai_owner`);
  });
  // Same schema rights as scripts/db-bootstrap.sh gives the dev databases.
  await withClient(adminUrl(admin, DB), async (c) => {
    await c.query("SET ROLE cafai_owner");
    await c.query("ALTER SCHEMA public OWNER TO cafai_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO cafai_app, cafai_catalog");
  });
  await migrateAll(admin);
  // Last, so a run that fails earlier leaves the live app's password alone.
  const password = randomBytes(24).toString("base64url");
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${password}`);
  await withClient(adminUrl(admin), (c) => c.query(`ALTER ROLE cafai_app LOGIN PASSWORD ${c.escapeLiteral(password)}`));
  writeFileSync(appUrlFile, appUrl(admin, password), { mode: 0o600 });
  console.log(`setup done: database ${DB}, roles ${ROLES.map(([r]) => r).join(", ")}; new app password set`);
}

export async function migrateAll(admin: string): Promise<void> {
  const applied = await migrate(adminUrl(admin, DB), "cafai_owner");
  console.log(applied.length ? `applied: ${applied.join(", ")}` : "migrations up to date");
  // One connection, switched to the catalog role and checked before anything is written (plan §19).
  const pool = new pg.Pool({ connectionString: adminUrl(admin, DB), max: 1, idleTimeoutMillis: 0 });
  try {
    const c = await pool.connect();
    await c.query("SET ROLE cafai_catalog");
    c.release();
    const { who } = (await pool.query("SELECT current_user AS who")).rows[0];
    if (who !== "cafai_catalog") throw new Error(`catalog would be written as ${who}, not cafai_catalog`);
    const root = fileURLToPath(new URL("../catalog", import.meta.url));
    for (const fixtures of [false, true]) {
      const res = loadCatalog({ root, fixtures });
      if (!res.ok) throw new Error(`catalog invalid: ${res.errors.map((e) => `${e.file}: ${e.message}`).join("; ")}`);
      await publishSnapshot(pool, res.snapshot);
      console.log(`published ${res.snapshot.mode} snapshot ${res.snapshot.version.slice(0, 19)}`);
    }
  } finally {
    await pool.end();
  }
}

export async function purge(admin: string): Promise<void> {
  // purge_expired() is SECURITY DEFINER; its owner may run it.
  const r = await withClient(adminUrl(admin, DB), async (c) => {
    await c.query("SET ROLE cafai_owner");
    return c.query("SELECT * FROM purge_expired()");
  });
  console.log(JSON.stringify({ event: "retention_purge", at: new Date().toISOString(), ...r.rows[0] }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const admin = process.env.DATABASE_ADMIN_URL;
  const cmd = process.argv[2];
  const out = process.env.APP_DATABASE_URL_FILE;
  if (!admin || !["setup", "migrate", "purge"].includes(cmd ?? "") || (cmd === "setup" && !out)) {
    console.error("usage: DATABASE_ADMIN_URL=... [APP_DATABASE_URL_FILE=...] npx tsx scripts/deploy-db.ts <setup|migrate|purge>");
    process.exit(2);
  }
  const run = cmd === "setup" ? setup(admin, out!) : cmd === "migrate" ? migrateAll(admin) : purge(admin);
  await run.catch((e) => {
    console.error(`${cmd} failed: ${(e as Error).message}`);
    process.exit(1);
  });
}
