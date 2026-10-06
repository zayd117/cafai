// Vercel API steps (scripts/deploy-vercel.ts) against a scripted fetch: request shapes and failure handling.
import { describe, expect, it } from "vitest";
import { deployMain, findProject, setEnv, smoke, waitReady } from "./deploy-vercel";

type Call = { method: string; url: URL; body?: unknown };
type Reply = [status: number, body: unknown];
/** Answers by "METHOD /path" (or "METHOD /path?teamId=..."); a list of replies is used in order, the last one repeating. */
function fake(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const f = async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    calls.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const team = u.searchParams.get("teamId");
    const route = (team && routes[`${method} ${u.pathname}?teamId=${team}`]) || routes[`${method} ${u.pathname}`];
    const queue = route && (Array.isArray(route[0]) ? (route as Reply[]) : [route as Reply]);
    const [status, body] = (queue && (queue.length > 1 ? queue.shift() : queue[0])) ?? [404, { error: { message: "not found" } }];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { f, calls };
}

const project = { id: "prj_1", name: "cafai" };

describe("findProject", () => {
  it("uses the token's own scope when the project is there", async () => {
    const { f, calls } = fake({ "GET /v2/teams": [200, { teams: [{ id: "team_1" }] }], "GET /v9/projects/cafai": [200, project] });
    const r = await findProject(f, "t", "cafai");
    expect(r.project.id).toBe("prj_1");
    expect(r.ctx.teamId).toBeUndefined();
    expect(calls.every((c) => c.url.hostname === "api.vercel.com")).toBe(true);
  });
  it("falls back to a team scope", async () => {
    const { f } = fake({
      "GET /v2/teams": [200, { teams: [{ id: "team_1" }] }],
      "GET /v9/projects/cafai?teamId=team_1": [200, project],
      "GET /v9/projects/cafai": [404, { error: { message: "Project not found" } }],
    });
    expect((await findProject(f, "t", "cafai")).ctx.teamId).toBe("team_1");
  });
  it("says how to fix a missing project, and does not hide a bad token", async () => {
    const missing = fake({ "GET /v2/teams": [200, { teams: [] }] });
    await expect(findProject(missing.f, "t", "cafai")).rejects.toThrow(/import the GitHub repo in Vercel/);
    const bad = fake({ "GET /v2/teams": [403, {}], "GET /v9/projects/cafai": [401, { error: { message: "The token is not valid" } }] });
    await expect(findProject(bad.f, "t", "cafai")).rejects.toThrow(/401: The token is not valid/);
  });
});

describe("setEnv", () => {
  it("always sets DATABASE_URL and adds CAFAI_CATALOG and QUOTA_SALT only when missing", async () => {
    const first = fake({ "GET /v10/projects/prj_1/env": [200, { envs: [] }], "POST /v10/projects/prj_1/env": [201, { failed: [] }] });
    expect(await setEnv({ f: first.f, token: "t" }, project, "postgres://app")).toEqual(["DATABASE_URL", "CAFAI_CATALOG", "QUOTA_SALT"]);
    const post = first.calls.find((c) => c.method === "POST")!;
    expect(post.url.searchParams.get("upsert")).toBe("true");
    const vars = post.body as { key: string; value: string; type: string; target: string[] }[];
    expect(vars[0]).toEqual({ key: "DATABASE_URL", value: "postgres://app", type: "sensitive", target: ["production", "preview"] });
    expect(vars[1]).toMatchObject({ key: "CAFAI_CATALOG", value: "fixture" });
    expect(vars[2]!.value.length).toBeGreaterThan(30);

    const again = fake({
      "GET /v10/projects/prj_1/env": [200, { envs: [{ key: "CAFAI_CATALOG" }, { key: "QUOTA_SALT" }, { key: "DATABASE_URL" }] }],
      "POST /v10/projects/prj_1/env": [201, { failed: [] }],
    });
    expect(await setEnv({ f: again.f, token: "t" }, project, "postgres://app2")).toEqual(["DATABASE_URL"]);
  });
  it("reports variables Vercel refused", async () => {
    const { f } = fake({
      "GET /v10/projects/prj_1/env": [200, { envs: [] }],
      "POST /v10/projects/prj_1/env": [201, { failed: [{ error: { key: "DATABASE_URL", message: "nope" } }] }],
    });
    await expect(setEnv({ f, token: "t" }, project, "x")).rejects.toThrow("DATABASE_URL: nope");
  });
});

describe("deployMain and waitReady", () => {
  it("deploys main from GitHub to production and waits for the domain", async () => {
    const { f, calls } = fake({
      "POST /v13/deployments": [200, { id: "dpl_1", url: "cafai-abc.vercel.app" }],
      "GET /v13/deployments/dpl_1": [
        [200, { id: "dpl_1", url: "cafai-abc.vercel.app", readyState: "BUILDING" }],
        [200, { id: "dpl_1", url: "cafai-abc.vercel.app", readyState: "READY", aliasAssigned: 1, alias: ["cafai.vercel.app"] }],
      ],
    });
    const ctx = { f, token: "t", teamId: "team_1" };
    const d = await deployMain(ctx, project, "zayd117/cafai");
    const post = calls[0]!;
    expect(post.url.searchParams.get("teamId")).toBe("team_1");
    expect(post.body).toEqual({ name: "cafai", project: "prj_1", target: "production", gitSource: { type: "github", org: "zayd117", repo: "cafai", ref: "main" } });
    expect((await waitReady(ctx, d.id, { everyMs: 0 })).alias).toEqual(["cafai.vercel.app"]);
  });
  it("stops on a failed build", async () => {
    const { f } = fake({ "GET /v13/deployments/dpl_2": [200, { id: "dpl_2", url: "x.vercel.app", readyState: "ERROR", inspectorUrl: "vercel.com/i" }] });
    await expect(waitReady({ f, token: "t" }, "dpl_2", { everyMs: 0 })).rejects.toThrow("deployment error: https://vercel.com/i");
  });
});

describe("smoke", () => {
  const site = (home: number, run: number) =>
    fake({ "GET /": [home, "<h1>What are you working on?</h1>"], "GET /r/00000000-0000-4000-8000-000000000000": [run, ""] }).f;
  it("passes when the page renders and an unknown run is a 404", async () => {
    expect(await smoke(site(200, 404), "https://cafai.vercel.app")).toMatch(/is live/);
  });
  it("fails when the database lookup errors", async () => {
    await expect(smoke(site(200, 500), "https://cafai.vercel.app")).rejects.toThrow(/answered 500/);
  });
  it("skips, not fails, behind Vercel's login", async () => {
    expect(await smoke(site(401, 401), "https://x.vercel.app")).toMatch(/smoke test was skipped/);
  });
});
