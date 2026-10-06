// Runs the engine for a request and persists the result so /r/:runId can re-render it (plan §8, §18, §19).
import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { CatalogSnapshot } from "@/catalog/types";
import { budgetMicros } from "@/config/pricing";
import { ANONYMOUS_RUN_DAYS } from "@/config/retention";
import { withAccess } from "@/db/client";
import { ENGINE_CONFIG } from "@/engine/config";
import type { Constraints } from "@/engine/match";
import { runPipeline } from "@/engine/pipeline";
import type { DecisionProvider, LlmProvider } from "@/engine/providers/types";
import { redact } from "@/engine/redact";
import type { Alternative, Explanation, NeedAnswer, NotNeeded, ProfileItem, RunOutcome, RunResult } from "@/engine/types";
import type { UserItem } from "@/engine/understand";

export interface StartRun {
  text: string;
  declaredClients: string[];
  constraints?: Constraints;
  userItems?: UserItem[];
  confirmed?: boolean;
  parentRunId?: string;
  /** Id of the intake example whose saved answer produced this run (catalog/examples). */
  savedExample?: string;
}

/** Everything a results page needs besides catalog facts. */
export interface RunDetails {
  readback: ProfileItem[];
  clarifying_question: RunResult["clarifying_question"];
  not_needed: NotNeeded[];
  present: RunResult["present"];
  degraded: RunResult["degraded"];
  flags: RunResult["flags"];
  constraints: Constraints;
  confirmed: boolean;
  saved_example?: string;
}

export interface StoredPick {
  id: string;
  offering_id: string;
  capability_id: string;
  lane: "direct" | "also_worth_knowing";
  rank: number;
  need_type: string;
  do_you_need_it: NeedAnswer;
  match_band: string;
  match_components: Record<string, number>;
  confidence_band: string;
  confidence_inputs: Record<string, unknown>;
  evidence_ids: string[];
  explanation: Explanation;
  notes: string[];
  alternatives: Alternative[];
}

export interface StoredRun {
  id: string;
  created_at: Date;
  expires_at: Date | null;
  outcome: RunOutcome;
  catalog_version: string;
  pipeline_versions: Record<string, string>;
  text: string | null;
  declared_clients: string[];
  details: RunDetails;
  picks: StoredPick[];
  /** Concept expansion behind the read-back (internal; shown only under "How we understood this"). */
  concepts: { term: string; capability_id: string | null }[];
}

export async function startRun(
  deps: { pool: pg.Pool; snapshot: CatalogSnapshot; llm: LlmProvider; decision: DecisionProvider },
  input: StartRun,
): Promise<string> {
  const { pool, snapshot } = deps;
  const constraints = input.constraints ?? {};
  // Stage 1 happens before storage too (plan §12: redact before storing and before any model call).
  const stored = redact(input.text, ENGINE_CONFIG.input.maxChars).text;
  const result = await runPipeline({
    text: stored,
    declaredClients: input.declaredClients,
    constraints,
    userItems: input.userItems,
    confirmed: input.confirmed,
    snapshot,
    llm: deps.llm,
    decision: deps.decision,
  });

  const id = randomUUID();
  const details: RunDetails = {
    readback: result.readback,
    clarifying_question: result.clarifying_question,
    not_needed: result.not_needed,
    present: result.present,
    degraded: result.degraded,
    flags: result.flags,
    constraints,
    confirmed: !!input.confirmed,
    ...(input.savedExample ? { saved_example: input.savedExample } : {}),
  };
  await withAccess(pool, { runId: id }, async (c) => {
    await c.query(
      `INSERT INTO recommendation_runs (id, status, catalog_version, pipeline_versions, degraded, expires_at, outcome, details, parent_run_id)
       VALUES ($1, 'complete', $2, $3, $4, now() + make_interval(days => $5), $6, $7, $8)`,
      [id, snapshot.version, JSON.stringify(result.versions), result.degraded, ANONYMOUS_RUN_DAYS, result.outcome, JSON.stringify(details), input.parentRunId ?? null],
    );
    await c.query(
      `INSERT INTO context_snapshots (run_id, raw_text, raw_text_expires_at, declared_clients, constraints, profile)
       VALUES ($1, $2, now() + make_interval(days => $3), $4, $5, $6)`,
      [id, stored, ANONYMOUS_RUN_DAYS, input.declaredClients, JSON.stringify(constraints),
        JSON.stringify({ items: result.readback, concepts: result.concepts, gaps: result.gaps })],
    );
    for (const p of result.picks) {
      await c.query(
        `INSERT INTO recommendations (run_id, offering_id, catalog_version, lane, rank, capability_id, need_type, match_band,
           match_components, confidence_band, confidence_inputs, evidence_ids, explanation, do_you_need_it, notes, alternatives)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [id, p.offering_id, snapshot.version, p.lane, p.rank, p.capability_id, p.need_type, p.match.band,
          JSON.stringify(p.match.components), p.confidence.band, JSON.stringify(p.confidence.inputs), p.evidence_ids,
          JSON.stringify(p.explanation), p.do_you_need_it, p.notes, JSON.stringify(p.alternatives)],
      );
    }
    for (const u of result.usage) {
      await c.query(
        "INSERT INTO usage_events (run_id, kind, stage, model, input_tokens, output_tokens, cost_usd_micros) VALUES ($1, 'model_call', $2, $3, $4, $5, $6)",
        [id, u.stage, u.model, u.input_tokens, u.output_tokens, budgetMicros(u)],
      );
    }
  });
  // Redacted structured log: ids, outcome and counts only, never description text (§14, §17).
  console.log(JSON.stringify({
    event: "run_completed", run_id: id, outcome: result.outcome, degraded: result.degraded, picks: result.picks.length,
    input_tokens: result.usage.reduce((a, u) => a + u.input_tokens, 0), output_tokens: result.usage.reduce((a, u) => a + u.output_tokens, 0),
    cost_usd: result.usage.reduce((a, u) => a + budgetMicros(u), 0) / 1e6,
    injection_suspected: result.flags.injection_suspected, redactions: result.flags.redactions,
  }));
  return id;
}

export async function loadRun(pool: pg.Pool, runId: string): Promise<StoredRun | null> {
  return withAccess(pool, { runId }, async (c) => {
    const r = await c.query("SELECT * FROM recommendation_runs WHERE id = $1", [runId]);
    if (r.rowCount === 0) return null;
    const run = r.rows[0];
    const ctx = await c.query("SELECT raw_text, declared_clients, profile FROM context_snapshots WHERE run_id = $1 ORDER BY version DESC LIMIT 1", [runId]);
    const picks = await c.query("SELECT * FROM recommendations WHERE run_id = $1 ORDER BY rank", [runId]);
    return {
      id: run.id,
      created_at: run.created_at,
      expires_at: run.expires_at,
      outcome: run.outcome,
      catalog_version: run.catalog_version,
      pipeline_versions: run.pipeline_versions,
      text: ctx.rows[0]?.raw_text ?? null,
      declared_clients: ctx.rows[0]?.declared_clients ?? [],
      details: run.details,
      picks: picks.rows,
      concepts: ctx.rows[0]?.profile?.concepts ?? [],
    } as StoredRun;
  });
}
