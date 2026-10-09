// Integration tests against a real Postgres (cafai_test). Local: scripts/db-bootstrap.sh; CI: postgres service.
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import type { CatalogSnapshot } from "@/catalog/types";
import { scriptedFor } from "@/eval/run";
import type { EvalCase } from "@/eval/types";
import { loadRun, startRun } from "@/server/runService";
import caseData from "../../eval/cases/fixture/fx-d-calorie-tracker.json";
import { migrate } from "../../scripts/migrate";
import { withAccess } from "./client";
import { addFeedback, publishSnapshot } from "./runs";

const PW = process.env.CAFAI_DEV_DB_PASSWORD ?? "cafai_dev_only";
const HOST = process.env.PGHOST_TEST ?? "localhost";
const url = (role: string) => `postgres://${role}:${PW}@${HOST}:5432/cafai_test`;

let owner: pg.Pool, app: pg.Pool, catalog: pg.Pool;
let snapshot: CatalogSnapshot;

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
  snapshot = res.snapshot;
});

afterAll(async () => {
  await Promise.all([owner?.end(), app?.end(), catalog?.end()]);
});

const newRun = () => {
  const p = scriptedFor(caseData as EvalCase);
  return startRun({ pool: app, snapshot, llm: p, decision: p }, { text: caseData.text, declaredClients: caseData.declared_clients, confirmed: true });
};

describe("recommendation runs with row-level security", () => {
  it("creates an anonymous run readable by its id, with a retention expiry", async () => {
    const id = await newRun();
    const run = await loadRun(app, id);
    expect(run?.id).toBe(id);
    expect(run?.org_id).toBeNull();
    expect(run?.expires_at).toBeInstanceOf(Date);
    expect(run?.declared_clients).toEqual(["claude_code"]);
    expect(run?.outcome).toBe("picks");
    expect(run?.catalog_version).toBe(snapshot.version);
    expect(run?.details.readback).toHaveLength(2);
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
      [a, snapshot.version],
    );
    const runId = run.rows[0].id as string;
    expect(await loadRun(app, runId, { orgId: b })).toBeNull();
    expect((await loadRun(app, runId, { orgId: a }))?.id).toBe(runId);
    // Knowing the id is not enough for an org-owned run.
    expect(await loadRun(app, runId)).toBeNull();
  });

  it("stores recommendations as ids, bands and components, and child rows cannot claim another tenant", async () => {
    const id = await newRun();
    const run = await loadRun(app, id);
    expect(run?.picks).toHaveLength(4);
    expect(run?.picks.find((p) => p.offering_id === "fx-browser-check")).toMatchObject({ match_band: "good", lane: "also_worth_knowing" });
    const stored = await withAccess(app, { runId: id }, (c) => c.query("SELECT catalog_version, match_components FROM recommendations WHERE run_id = $1", [id]));
    expect(stored.rows.every((p) => p.catalog_version === snapshot.version && Object.keys(p.match_components).length === 6)).toBe(true);

    const org = (await owner.query("INSERT INTO organizations DEFAULT VALUES RETURNING id")).rows[0].id;
    await expect(
      withAccess(app, { runId: id, orgId: org }, (c) =>
        c.query(
          `INSERT INTO recommendations (run_id, org_id, offering_id, catalog_version, lane, rank, capability_id, need_type,
             match_band, match_components, confidence_band, confidence_inputs)
           VALUES ($1, $2, 'x', $3, 'direct', 99, 'c', 'stated', 'good', '{}', 'low', '{}')`,
          [id, org, snapshot.version],
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
    const recId = (await loadRun(app, id))!.picks[0]!.id;
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
    const usage = await withAccess(app, { runId: id }, (c) => c.query("SELECT stage, cost_usd_micros FROM usage_events WHERE run_id = $1 ORDER BY id", [id]));
    expect(usage.rows.map((u) => u.stage)).toEqual(["understanding", "judgment", "explanation"]);
    expect(usage.rows.every((u) => Number(u.cost_usd_micros) === 0)).toBe(true);
    await expect(withAccess(app, { runId: id }, (c) => c.query("UPDATE usage_events SET cost_usd_micros = 0"))).rejects.toThrow(/permission denied/);
    await expect(withAccess(app, { runId: id }, (c) => c.query("DELETE FROM usage_events"))).rejects.toThrow(/permission denied/);
  });

  it("purges expired anonymous runs and trims expired raw text", async () => {
    const id = await newRun();
    const retained = await newRun();
    await owner.query("UPDATE recommendation_runs SET expires_at = now() - interval '1 second' WHERE id = $1", [id]);
    await owner.query("UPDATE context_snapshots SET raw_text_expires_at = now() - interval '1 second' WHERE run_id = $1", [retained]);
    const out = (await app.query("SELECT * FROM purge_expired()")).rows[0];
    expect(out.runs).toBeGreaterThanOrEqual(1);
    expect(out.raw_texts).toBeGreaterThanOrEqual(1);
    expect(await loadRun(app, id)).toBeNull();
    const trimmed = await loadRun(app, retained);
    expect(trimmed?.text).toBeNull();
    expect(trimmed?.picks).toHaveLength(4);
  });

  it("rejects malformed ids before touching the database", async () => {
    await expect(loadRun(app, "not-a-uuid")).rejects.toThrow("invalid id");
  });

  it("persists only redacted read-back fields through the website's run path", async () => {
    const p = scriptedFor(caseData as EvalCase);
    const key = "sk-CANARYcanary1234567890";
    const email = "canary@example.com";
    const id = await startRun({ pool: app, snapshot, llm: p, decision: p }, {
      text: `${caseData.text} Email ${email}.`, declaredClients: ["claude_code"], confirmed: true, lockedReadback: true,
      userItems: [{ id: "u1", kind: "goal", text: `Tracker ${key}`, tag: email, quote: email, suggestions: [key, "Tracker"] }],
    });
    const rows = await withAccess(app, { runId: id }, (c) => c.query("SELECT raw_text, profile FROM context_snapshots WHERE run_id = $1", [id]));
    const saved = JSON.stringify({ run: await loadRun(app, id), context: rows.rows, requests: p.requests });
    expect(saved).not.toContain(key);
    expect(saved).not.toContain(email);
    expect(saved).toContain("[redacted]");
  });
});
