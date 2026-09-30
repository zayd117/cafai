import { randomUUID } from "node:crypto";
import type pg from "pg";
import { ANONYMOUS_RUN_DAYS } from "@/config/retention";
import type { CatalogSnapshot } from "@/catalog/types";
import { withAccess, type AccessContext } from "./client";

export type RunStatus = "pending" | "understood" | "complete" | "failed" | "queued";
export type Lane = "direct" | "also_worth_knowing" | "not_needed";
export type MatchBand = "strong" | "good" | "possible" | "weak" | "skip";
export type ConfidenceBand = "high" | "medium" | "low";
export type NeedType = "stated" | "implied" | "latent" | "present" | "not_relevant";

export interface RecommendationRow {
  offering_id: string;
  lane: Lane;
  rank: number;
  capability_id: string;
  need_type: NeedType;
  match_band: MatchBand;
  match_components: Record<string, unknown>;
  confidence_band: ConfidenceBand;
  confidence_inputs: Record<string, unknown>;
  evidence_ids: string[];
}

export interface RunRecord {
  id: string;
  org_id: string | null;
  status: RunStatus;
  catalog_version: string;
  pipeline_versions: Record<string, string>;
  degraded: string | null;
  created_at: Date;
  expires_at: Date | null;
  context: {
    raw_text: string | null;
    declared_clients: string[];
    constraints: Record<string, unknown>;
    profile: unknown;
  } | null;
  recommendations: (RecommendationRow & { id: string })[];
}

/** Catalog pipeline only (cafai_catalog role). Idempotent per content version. */
export async function publishSnapshot(catalogPool: pg.Pool, s: CatalogSnapshot): Promise<void> {
  await catalogPool.query(
    "INSERT INTO catalog_snapshots (version, mode, content) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING",
    [s.version, s.mode, JSON.stringify({ clients: s.clients, taxonomy: s.taxonomy, offerings: s.offerings })],
  );
}

export interface NewRun {
  catalogVersion: string;
  pipelineVersions: Record<string, string>;
  /** Must already be redacted (plan §12: redact before storing). */
  redactedText: string;
  declaredClients: string[];
  constraints?: Record<string, unknown>;
}

/** Anonymous run (plan §8: first value before any signup). Returns the unguessable run id. */
export async function createAnonymousRun(pool: pg.Pool, run: NewRun): Promise<string> {
  const id = randomUUID();
  await withAccess(pool, { runId: id }, async (c) => {
    await c.query(
      `INSERT INTO recommendation_runs (id, catalog_version, pipeline_versions, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
      [id, run.catalogVersion, JSON.stringify(run.pipelineVersions), ANONYMOUS_RUN_DAYS],
    );
    await c.query(
      `INSERT INTO context_snapshots (run_id, raw_text, raw_text_expires_at, declared_clients, constraints)
       VALUES ($1, $2, now() + make_interval(days => $3), $4, $5)`,
      [id, run.redactedText, ANONYMOUS_RUN_DAYS, run.declaredClients, JSON.stringify(run.constraints ?? {})],
    );
  });
  return id;
}

export async function getRun(pool: pg.Pool, ctx: AccessContext, runId: string): Promise<RunRecord | null> {
  return withAccess(pool, { ...ctx, runId }, async (c) => {
    const r = await c.query("SELECT * FROM recommendation_runs WHERE id = $1", [runId]);
    if (r.rowCount === 0) return null; // other tenants' ids look exactly like missing ones (plan §14: 404)
    const ctxRow = await c.query(
      "SELECT raw_text, declared_clients, constraints, profile FROM context_snapshots WHERE run_id = $1 ORDER BY version DESC LIMIT 1",
      [runId],
    );
    const recs = await c.query("SELECT * FROM recommendations WHERE run_id = $1 ORDER BY lane, rank", [runId]);
    return { ...r.rows[0], context: ctxRow.rows[0] ?? null, recommendations: recs.rows } as RunRecord;
  });
}

export async function updateRun(
  pool: pg.Pool,
  ctx: AccessContext,
  runId: string,
  patch: { status?: RunStatus; degraded?: string | null; profile?: unknown },
): Promise<void> {
  await withAccess(pool, { ...ctx, runId }, async (c) => {
    if (patch.status || patch.degraded !== undefined) {
      const res = await c.query(
        "UPDATE recommendation_runs SET status = COALESCE($2, status), degraded = CASE WHEN $3::boolean THEN $4 ELSE degraded END WHERE id = $1",
        [runId, patch.status ?? null, patch.degraded !== undefined, patch.degraded ?? null],
      );
      if (res.rowCount === 0) throw new Error("run not found");
    }
    if (patch.profile !== undefined) {
      await c.query(
        "UPDATE context_snapshots SET profile = $2 WHERE run_id = $1 AND version = (SELECT max(version) FROM context_snapshots WHERE run_id = $1)",
        [runId, JSON.stringify(patch.profile)],
      );
    }
  });
}

export async function saveRecommendations(pool: pg.Pool, ctx: AccessContext, runId: string, rows: RecommendationRow[]): Promise<void> {
  await withAccess(pool, { ...ctx, runId }, async (c) => {
    const run = await c.query<{ org_id: string | null; catalog_version: string }>(
      "SELECT org_id, catalog_version FROM recommendation_runs WHERE id = $1",
      [runId],
    );
    if (run.rowCount === 0) throw new Error("run not found");
    const { org_id, catalog_version } = run.rows[0]!;
    for (const r of rows) {
      await c.query(
        `INSERT INTO recommendations (run_id, org_id, offering_id, catalog_version, lane, rank, capability_id, need_type,
           match_band, match_components, confidence_band, confidence_inputs, evidence_ids)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [runId, org_id, r.offering_id, catalog_version, r.lane, r.rank, r.capability_id, r.need_type, r.match_band,
          JSON.stringify(r.match_components), r.confidence_band, JSON.stringify(r.confidence_inputs), r.evidence_ids],
      );
    }
  });
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

export async function recordUsage(
  pool: pg.Pool,
  ctx: AccessContext,
  runId: string,
  u: { kind: "model_call" | "run_started" | "run_completed"; stage?: string; model?: string; inputTokens?: number; outputTokens?: number; costUsdMicros?: number },
): Promise<void> {
  await withAccess(pool, { ...ctx, runId }, async (c) => {
    await c.query(
      `INSERT INTO usage_events (run_id, org_id, kind, stage, model, input_tokens, output_tokens, cost_usd_micros)
       SELECT id, org_id, $2, $3, $4, $5, $6, $7 FROM recommendation_runs WHERE id = $1`,
      [runId, u.kind, u.stage ?? null, u.model ?? null, u.inputTokens ?? null, u.outputTokens ?? null, u.costUsdMicros ?? null],
    );
  });
}

/** Retention job (worker, owner-level role): delete expired anonymous runs and trim raw text past its window (plan §12). */
export async function purgeExpired(ownerPool: pg.Pool): Promise<{ runs: number; rawTexts: number }> {
  const runs = await ownerPool.query("DELETE FROM recommendation_runs WHERE org_id IS NULL AND expires_at < now()");
  const texts = await ownerPool.query(
    "UPDATE context_snapshots SET raw_text = NULL, raw_text_expires_at = NULL WHERE raw_text IS NOT NULL AND raw_text_expires_at < now()",
  );
  return { runs: runs.rowCount ?? 0, rawTexts: texts.rowCount ?? 0 };
}
