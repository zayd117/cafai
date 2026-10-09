// Points the Vercel project at the production database, then deploys main (plan §17 managed host; docs/DEPLOY.md).
// Only the "set up production" workflow runs this; after that, Vercel's GitHub integration deploys every push to main.
// Usage: VERCEL_TOKEN=... [VERCEL_PROJECT=cafai] npx tsx scripts/deploy-vercel.ts <check|apply>
//   check  find the project, so a bad token or name fails before the database is touched
//   apply  set DATABASE_URL (from APP_DATABASE_URL_FILE), and CAFAI_CATALOG and QUOTA_SALT when missing; deploy main
//          from GitHub (GITHUB_REPOSITORY), wait for it, then smoke-test the live site
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const API = "https://api.vercel.com";
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export class VercelError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface Project { id: string; name: string }
export interface Deployment { id: string; url: string; readyState?: string; alias?: string[]; aliasAssigned?: unknown; inspectorUrl?: string }
interface Ctx { f: Fetch; token: string; teamId?: string }
/** Vercel's inspector link is a full URL; the deployment's own url is a bare host. */
const link = (d: Deployment) => d.inspectorUrl ?? `https://${d.url}`;

export async function api<T>(ctx: Ctx, method: string, path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  if (ctx.teamId) url.searchParams.set("teamId", ctx.teamId);
  const res = await ctx.f(url.toString(), {
    method,
    headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) throw new VercelError(res.status, `${method} ${url.pathname} answered ${res.status}: ${data.error?.message ?? res.statusText}`);
  return data as T;
}

/** The project, looked up in the token's own scope first, then in each team the token can see. */
export async function findProject(f: Fetch, token: string, name: string): Promise<{ project: Project; ctx: Ctx }> {
  const teams = await api<{ teams?: { id: string }[] }>({ f, token }, "GET", "/v2/teams").then((r) => r.teams ?? [], () => []);
  for (const teamId of [undefined, ...teams.map((t) => t.id)]) {
    const ctx = { f, token, teamId };
    try {
      return { project: await api<Project>(ctx, "GET", `/v9/projects/${encodeURIComponent(name)}`), ctx };
    } catch (e) {
      if (!(e instanceof VercelError) || (e.status !== 404 && e.status !== 403)) throw e;
    }
  }
  throw new Error(`no Vercel project named "${name}" for this token: import the GitHub repo in Vercel, or set the VERCEL_PROJECT variable to the project's name`);
}

/** DATABASE_URL always (its password was just rotated); CAFAI_CATALOG and QUOTA_SALT only when missing, so later edits stay. */
export async function setEnv(ctx: Ctx, p: Project, databaseUrl: string): Promise<string[]> {
  const { envs = [] } = await api<{ envs?: { key: string }[] }>(ctx, "GET", `/v10/projects/${p.id}/env`);
  const has = (k: string) => envs.some((e) => e.key === k);
  const target = ["production", "preview"];
  const vars = [{ key: "DATABASE_URL", value: databaseUrl, type: "sensitive", target }];
  // Sample mode until real catalog data exists (REGISTER A-006); the banner says so on every page.
  if (!has("CAFAI_CATALOG")) vars.push({ key: "CAFAI_CATALOG", value: "fixture", type: "plain", target });
  if (!has("QUOTA_SALT")) vars.push({ key: "QUOTA_SALT", value: randomBytes(32).toString("base64url"), type: "sensitive", target });
  const r = await api<{ failed?: { error?: { key?: string; message?: string } }[] }>(ctx, "POST", `/v10/projects/${p.id}/env`, { query: { upsert: "true" }, body: vars });
  if (r.failed?.length) throw new Error(`Vercel refused: ${r.failed.map((x) => `${x.error?.key ?? "?"}: ${x.error?.message ?? "unknown error"}`).join("; ")}`);
  return vars.map((v) => v.key);
}

export async function deployMain(ctx: Ctx, p: Project, repository: string): Promise<Deployment> {
  const [org, repo] = repository.split("/");
  return api<Deployment>(ctx, "POST", "/v13/deployments", {
    query: { forceNew: "1" },
    body: { name: p.name, project: p.id, target: "production", gitSource: { type: "github", org, repo, ref: "main" } },
  });
}

export async function waitReady(ctx: Ctx, id: string, opts: { everyMs?: number; timeoutMs?: number } = {}): Promise<Deployment> {
  const { everyMs = 10_000, timeoutMs = 15 * 60_000 } = opts;
  let readySince: number | undefined;
  for (const end = Date.now() + timeoutMs; ; await new Promise((r) => setTimeout(r, everyMs))) {
    const d = await api<Deployment>(ctx, "GET", `/v13/deployments/${id}`);
    // Production domains are attached just after READY; give that a few polls before settling for the bare URL.
    if (d.readyState === "READY") readySince ??= Date.now();
    if (d.readyState === "READY" && (d.aliasAssigned || Date.now() - readySince! >= 6 * everyMs)) return d;
    if (d.readyState === "ERROR" || d.readyState === "CANCELED") throw new Error(`deployment ${d.readyState.toLowerCase()}: ${link(d)}`);
    if (Date.now() > end) throw new Error(`deployment not ready after ${timeoutMs / 60_000} minutes (state ${d.readyState})`);
  }
}

/** Page renders, and a lookup of an unknown run reaches the database as cafai_app and comes back 404. */
export async function smoke(f: Fetch, base: string): Promise<string> {
  const home = await f(`${base}/`);
  if (home.status === 401) return `${base} is behind Vercel's login (Deployment Protection), so the smoke test was skipped`;
  const html = await home.text();
  const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (home.status !== 200 || heading !== "What are you working on?") throw new Error(`smoke test: ${base}/ answered ${home.status}`);
  const run = await f(`${base}/r/00000000-0000-4000-8000-000000000000`);
  if (run.status !== 404) throw new Error(`smoke test: the database check answered ${run.status}, expected 404 for an unknown run`);
  return `${base} is live and reaches its database`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const token = process.env.VERCEL_TOKEN;
  const name = process.env.VERCEL_PROJECT || "cafai";
  const cmd = process.argv[2];
  if (!token || !["check", "apply"].includes(cmd ?? "")) {
    console.error("usage: VERCEL_TOKEN=... [VERCEL_PROJECT=cafai] npx tsx scripts/deploy-vercel.ts <check|apply>");
    process.exit(2);
  }
  try {
    const { project, ctx } = await findProject(fetch, token, name);
    console.log(`Vercel project: ${project.name}`);
    if (cmd === "apply") {
      const file = process.env.APP_DATABASE_URL_FILE;
      const repository = process.env.GITHUB_REPOSITORY;
      if (!file || !repository) throw new Error("APP_DATABASE_URL_FILE and GITHUB_REPOSITORY are required");
      console.log(`environment set: ${(await setEnv(ctx, project, readFileSync(file, "utf8").trim())).join(", ")}`);
      const started = await deployMain(ctx, project, repository);
      console.log(`deploying main: ${link(started)}`);
      const done = await waitReady(ctx, started.id);
      const domain = [...(done.alias ?? [])].sort((a, b) => a.length - b.length)[0] ?? done.url;
      console.log(await smoke(fetch, `https://${domain}`));
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Caf.ai is live\n\nhttps://${domain}\n`);
    }
  } catch (e) {
    console.error(`${cmd} failed: ${(e as Error).message}`);
    process.exit(1);
  }
}
