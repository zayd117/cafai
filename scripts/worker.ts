// Background worker (plan §17): retention purge every hour. Follow-up email waits on an email provider (REGISTER A-005, A-012).
// Usage: DATABASE_URL=<cafai_app url> npx tsx scripts/worker.ts [--once]
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function purge() {
  const r = await pool.query<{ runs: number; raw_texts: number; quota_rows: number }>("SELECT * FROM purge_expired()");
  console.log(JSON.stringify({ event: "retention_purge", at: new Date().toISOString(), ...r.rows[0] }));
}
await purge();
if (process.argv.includes("--once")) await pool.end();
else setInterval(() => purge().catch((e) => console.error(JSON.stringify({ event: "retention_purge_failed", error: String(e) }))), 3_600_000);
