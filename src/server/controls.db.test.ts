// Controls against a real Postgres (cafai_test): quotas, budget breaker, purge, flag audit, grants.
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadCatalog } from "@/catalog/load";
import { CONTROLS } from "@/config/controls";
import { createAnonymousRun, publishSnapshot, recordUsage } from "@/db/runs";
import { migrate } from "../../scripts/migrate";
import { budgetSpent, clientKey, hitQuota, readFlags } from "./controls";

const PW = process.env.CAFAI_DEV_DB_PASSWORD ?? "cafai_dev_only";
const url = (role: string) => `postgres://${role}:${PW}@${process.env.PGHOST_TEST ?? "localhost"}:5432/cafai_test`;
let owner: pg.Pool, app: pg.Pool, catalog: pg.Pool, version: string;

beforeAll(async () => {
  owner = new pg.Pool({ connectionString: url("cafai_owner") });
  await owner.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO cafai_app, cafai_catalog;");
  await migrate(url("cafai_owner"));
  app = new pg.Pool({ connectionString: url("cafai_app") });
  catalog = new pg.Pool({ connectionString: url("cafai_catalog") });
  const res = loadCatalog({ root: fileURLToPath(new URL("../../catalog", import.meta.url)), fixtures: true });
  if (!res.ok) throw new Error("fixture catalog invalid");
  await publishSnapshot(catalog, res.snapshot);
  version = res.snapshot.version;
});
afterAll(async () => Promise.all([owner?.end(), app?.end(), catalog?.end()]));

describe("controls", () => {
  it("hashes client addresses and blocks after the hourly cap", async () => {
    const key = clientKey("ip", "203.0.113.7", "test-salt");
    expect(key).toMatch(/^ip:[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
    const now = new Date("2026-10-01T10:15:00Z");
    let last = { allowed: true, retryAfterSec: 0 };
    for (let i = 0; i < CONTROLS.runsPerHourPerClient + 1; i++) last = await hitQuota(app, key, now);
    expect(last.allowed).toBe(false);
    expect(last.retryAfterSec).toBe(45 * 60);
    expect((await hitQuota(app, key, new Date("2026-10-01T11:00:00Z"))).allowed).toBe(true); // new window
  });

  it("trips the budget breaker once today's recorded spend reaches the cap", async () => {
    expect(await budgetSpent(app)).toBe(false);
    const id = await createAnonymousRun(app, { catalogVersion: version, pipelineVersions: {}, redactedText: "t", declaredClients: [] });
    await recordUsage(app, {}, id, { kind: "model_call", model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1, costUsdMicros: CONTROLS.dailyAiBudgetUsd * 1_000_000 });
    expect(await budgetSpent(app)).toBe(true);
  });

  it("lets the app role run the purge but not read other runs' usage directly", async () => {
    const r = await app.query("SELECT * FROM purge_expired()");
    expect(Object.keys(r.rows[0])).toEqual(["runs", "raw_texts", "quota_rows"]);
    expect((await app.query("SELECT count(*)::int AS n FROM usage_events")).rows[0].n).toBe(0);
  });

  it("reads kill switches and audits every flag change; the app cannot change flags", async () => {
    await owner.query("INSERT INTO flags (key, enabled) VALUES ('ai_off', true), ('revoke:fx-payments', true)");
    const f = await readFlags(app);
    expect(f.aiOff).toBe(true);
    expect([...f.revoked]).toEqual(["fx-payments"]);
    const audit = await owner.query("SELECT kind, subject FROM audit_events ORDER BY id");
    expect(audit.rows).toEqual([{ kind: "flag_insert", subject: "ai_off" }, { kind: "flag_insert", subject: "revoke:fx-payments" }]);
    await expect(app.query("UPDATE flags SET enabled = false")).rejects.toThrow(/permission denied/);
  });
});
