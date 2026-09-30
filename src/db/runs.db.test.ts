// Integration tests against a real Postgres (cafai_test). Local: scripts/db-bootstrap.sh; CI: postgres service.
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import { migrate } from "../../scripts/migrate";
import { withAccess } from "./client";
import { addFeedback, createAnonymousRun, getRun, publishSnapshot, purgeExpired, recordUsage, saveRecommendations } from "./runs";

const PW = process.env.CAFAI_DEV_DB_PASSWORD ?? "cafai_dev_only";
const HOST = process.env.PGHOST_TEST ?? "localhost";
const url = (role: string) => `postgres://${role}:${PW}@${HOST}:5432/cafai_test`;

let owner: pg.Pool, app: pg.Pool, catalog: pg.Pool;
let catalogVersion: string;

beforeAll(async () => {
  owner = new pg.Pool({ connectionString: url("cafai_owner") });
  await owner.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
    GRANT USAGE ON SCHEMA public TO cafai_app, cafai_catalog;`);
  await migrate(url("cafai_owner"));
  app = new pg.Pool({ connectionString: url("cafai_app") });
  catalog = new pg.Pool({ connectionString: url("cafai_catalog") });
  const res = loadCatalog({ root: fileURLToPath(new URL("../../catalog", import.meta.url)), fixtures: true });
  if (!res.ok) throw new Error("fixture catalog invalid");
  await publishSnapshot(catalog, res.snapshot);
  catalogVersion = res.snapshot.version;
});

afterAll(async () => {
  await Promise.all([owner?.end(), app?.end(), catalog?.end()]);
});

const newRun = () =>
  createAnonymousRun(app, {
    catalogVersion,
    pipelineVersions: { prompt: "test", model: "MOCK", taxonomy: "fixture" },
    redactedText: "test project",
    declaredClients: ["claude_code"],
  });

const rec = {
  offering_id: "fx-browser-check",
  lane: "direct" as const,
  rank: 1,
  capability_id: "click-through-testing",
  need_type: "stated" as const,
  match_band: "good" as const,
  match_components: {},
  confidence_band: "medium" as const,
  confidence_inputs: {},
  evidence_ids: ["u1"],
};

describe("recommendation runs with row-level security", () => {
  it("creates an anonymous run readable by its id, with a retention expiry", async () => {
    const id = await newRun();
    const run = await getRun(app, {}, id);
    expect(run?.id).toBe(id);
    expect(run?.org_id).toBeNull();
    expect(run?.expires_at).toBeInstanceOf(Date);
    expect(run?.context?.declared_clients).toEqual(["claude_code"]);
  });

  it("does not let the app role enumerate anonymous runs", async () => {
    await newRun();
    const b = await newRun();
    const none = await withAccess(app, {}, (c) => c.query("SELECT count(*)::int AS n FROM recommendation_runs"));
    expect(none.rows[0].n).toBe(0);
    const onlyB = await withAccess(app, { runId: b }, (c) => c.query("SELECT id FROM recommendation_runs"));
    expect(onlyB.rows.map((r) => r.id)).toEqual([b]);
  });

  it("isolates tenants: another org's run looks missing", async () => {
    const orgs = await owner.query("INSERT INTO organizations (kind) VALUES ($$personal$$), ($$personal$$) RETURNING id");
    const [a, b] = orgs.rows.map((r) => r.id as string);
    const run = await owner.query(
      "INSERT INTO recommendation_runs (org_id, catalog_version) VALUES ($1, $2) RETURNING id",
      [a, catalogVersion],
    );
    const runId = run.rows[0].id as string;
    expect(await getRun(app, { orgId: b }, runId)).toBeNull();
    expect((await getRun(app, { orgId: a }, runId))?.id).toBe(runId);
    // Knowing the id is not enough for an org-owned run.
    expect(await getRun(app, {}, runId)).toBeNull();
  });

  it("stores recommendations as ids, bands and components, and child rows cannot claim another tenant", async () => {
    const id = await newRun();
    await saveRecommendations(app, {}, id, [rec]);
    const run = await getRun(app, {}, id);
    expect(run?.recommendations).toHaveLength(1);
    expect(run?.recommendations[0]).toMatchObject({ offering_id: "fx-browser-check", match_band: "good", catalog_version: catalogVersion });

    const org = (await owner.query("INSERT INTO organizations DEFAULT VALUES RETURNING id")).rows[0].id;
    await expect(
      withAccess(app, { runId: id, orgId: org }, (c) =>
        c.query(
          `INSERT INTO recommendations (run_id, org_id, offering_id, catalog_version, lane, rank, capability_id, need_type,
             match_band, match_components, confidence_band, confidence_inputs)
           VALUES ($1, $2, 'x', $3, 'direct', 2, 'c', 'stated', 'good', '{}', 'low', '{}')`,
          [id, org, catalogVersion],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withAccess(app, { runId: id, orgId: org }, (c) =>
        c.query("INSERT INTO feedback (run_id, org_id, kind) VALUES ($1, $2, 'useful')", [id, org]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      withAccess(app, { runId: id, orgId: org }, (c) =>
        c.query("INSERT INTO usage_events (run_id, org_id, kind) VALUES ($1, $2, 'model_call')", [id, org]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("records feedback and rejects a recommendation id from another run", async () => {
    const id = await newRun();
    await saveRecommendations(app, {}, id, [rec]);
    const recId = (await getRun(app, {}, id))!.recommendations[0]!.id;
    await addFeedback(app, {}, id, { recommendationId: recId, kind: "useful", value: true });
    const other = await newRun();
    await expect(addFeedback(app, {}, other, { recommendationId: recId, kind: "useful" })).rejects.toThrow("recommendation not found");
  });

  it("keeps the catalog writable only by the catalog pipeline", async () => {
    await expect(
      app.query("INSERT INTO catalog_snapshots (version, mode, content) VALUES ($1, 'fixture', '{}')", ["sha256-" + "0".repeat(64)]),
    ).rejects.toThrow(/permission denied/);
    await expect(app.query("DELETE FROM catalog_snapshots")).rejects.toThrow(/permission denied/);
  });

  it("keeps the usage ledger append-only for the app", async () => {
    const id = await newRun();
    await recordUsage(app, {}, id, { kind: "model_call", stage: "understanding", model: "MOCK", inputTokens: 1, outputTokens: 1, costUsdMicros: 0 });
    await expect(withAccess(app, { runId: id }, (c) => c.query("UPDATE usage_events SET cost_usd_micros = 0"))).rejects.toThrow(/permission denied/);
    await expect(withAccess(app, { runId: id }, (c) => c.query("DELETE FROM usage_events"))).rejects.toThrow(/permission denied/);
  });

  it("purges expired anonymous runs and trims expired raw text", async () => {
    const id = await newRun();
    await owner.query("UPDATE recommendation_runs SET expires_at = now() - interval '1 second' WHERE id = $1", [id]);
    const out = await purgeExpired(owner);
    expect(out.runs).toBeGreaterThanOrEqual(1);
    expect(await getRun(app, {}, id)).toBeNull();
  });

  it("rejects malformed ids before touching the database", async () => {
    await expect(getRun(app, {}, "not-a-uuid")).rejects.toThrow("invalid id");
  });
});
