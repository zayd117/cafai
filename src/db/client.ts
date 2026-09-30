import pg from "pg";

// Server-side only. DATABASE_URL must use the cafai_app role (subject to row-level security, plan §14).
let pool: pg.Pool | undefined;

export function getPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  pool ??= new pg.Pool({ connectionString, max: 10 });
  return pool;
}

export interface AccessContext {
  /** Signed-in tenant (L7). */
  orgId?: string;
  /** The run named in the request URL; grants access to that anonymous run only. */
  runId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

/** Runs fn in one transaction with the RLS context set (transaction-local, so pooled connections never leak it). */
export async function withAccess<T>(p: pg.Pool, ctx: AccessContext, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  for (const v of [ctx.orgId, ctx.runId]) if (v !== undefined && !isUuid(v)) throw new Error("invalid id");
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.org_id', $1, true), set_config('app.run_id', $2, true)", [ctx.orgId ?? "", ctx.runId ?? ""]);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
