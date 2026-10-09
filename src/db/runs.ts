import type pg from "pg";
import type { CatalogSnapshot } from "@/catalog/types";
import { withAccess, type AccessContext } from "./client";

/** Catalog pipeline only (cafai_catalog role). Idempotent per content version. */
export async function publishSnapshot(catalogPool: pg.Pool, s: CatalogSnapshot): Promise<void> {
  await catalogPool.query(
    "INSERT INTO catalog_snapshots (version, mode, content) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING",
    [s.version, s.mode, JSON.stringify({ clients: s.clients, taxonomy: s.taxonomy, offerings: s.offerings })],
  );
}

export type FeedbackKind = "useful" | "not_useful" | "already_knew" | "try_it" | "it_worked" | "stuck" | "still_using" | "helped" | "knew_before";

export async function addFeedback(
  pool: pg.Pool,
  ctx: AccessContext,
  runId: string,
  fb: { recommendationId?: string; kind: FeedbackKind; value?: boolean; reasonCode?: string },
): Promise<void> {
  await withAccess(pool, { ...ctx, runId }, async (c) => {
    const run = await c.query<{ org_id: string | null }>("SELECT org_id FROM recommendation_runs WHERE id = $1", [runId]);
    if (run.rowCount === 0) throw new Error("run not found");
    if (fb.recommendationId) {
      const rec = await c.query("SELECT 1 FROM recommendations WHERE id = $1 AND run_id = $2", [fb.recommendationId, runId]);
      if (rec.rowCount === 0) throw new Error("recommendation not found");
    }
    await c.query(
      "INSERT INTO feedback (run_id, recommendation_id, org_id, kind, value, reason_code) VALUES ($1,$2,$3,$4,$5,$6)",
      [runId, fb.recommendationId ?? null, run.rows[0]!.org_id, fb.kind, fb.value ?? null, fb.reasonCode ?? null],
    );
  });
}
