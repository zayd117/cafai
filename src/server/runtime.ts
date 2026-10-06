// Server-only process state: the catalog snapshot loaded at startup (plan §17 "build step loads the snapshot"),
// the database pool and the model providers.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCatalog } from "@/catalog/load";
import { scriptedFor } from "@/eval/run";
import type { EvalCase } from "@/eval/types";
import type { CatalogSnapshot } from "@/catalog/types";
import { getPool } from "@/db/client";
import { getProviders } from "@/engine/providers";

let snapshot: CatalogSnapshot | undefined;

/** CAFAI_CATALOG=fixture loads the labeled FIXTURE catalog; anything else loads the real one (REGISTER A-006). */
export function getSnapshot(): CatalogSnapshot {
  if (snapshot) return snapshot;
  const res = loadCatalog({ root: join(process.cwd(), "catalog"), fixtures: process.env.CAFAI_CATALOG === "fixture" });
  if (!res.ok) throw new Error(`catalog invalid: ${res.errors.map((e) => e.message).join("; ")}`);
  snapshot = res.snapshot;
  return snapshot;
}

let real: CatalogSnapshot | null | undefined;

/** The real catalog, loaded in sample mode too: the intake's saved examples are built on it. */
export function getRealSnapshot(): CatalogSnapshot | null {
  if (process.env.CAFAI_CATALOG !== "fixture") return getSnapshot();
  if (real === undefined) {
    const res = loadCatalog({ root: join(process.cwd(), "catalog") });
    real = res.ok ? res.snapshot : null;
  }
  return real;
}

const byVersion = new Map<string, CatalogSnapshot>();
const published = new Set<string>();

/** Runs reference catalog_snapshots, so a snapshot must be published before a run can use it. */
export async function isPublished(version: string): Promise<boolean> {
  if (published.has(version)) return true;
  const r = await getPool().query("SELECT 1 FROM catalog_snapshots WHERE version = $1", [version]);
  if (r.rowCount) published.add(version);
  return !!r.rowCount;
}

/** Old runs re-render from the snapshot they were made with (plan §19), read from catalog_snapshots. */
export async function snapshotFor(version: string): Promise<CatalogSnapshot | null> {
  const current = getSnapshot();
  if (current.version === version) return current;
  if (getRealSnapshot()?.version === version) return getRealSnapshot();
  const hit = byVersion.get(version);
  if (hit) return hit;
  const r = await getPool().query<{ mode: "real" | "fixture"; content: Omit<CatalogSnapshot, "version" | "mode"> }>(
    "SELECT mode, content FROM catalog_snapshots WHERE version = $1",
    [version],
  );
  if (!r.rows[0]) return null;
  const s: CatalogSnapshot = { version, mode: r.rows[0].mode, ...r.rows[0].content };
  byVersion.set(version, s);
  return s;
}

export function getRuntime() {
  const providers = getProviders();
  return { snapshot: getSnapshot(), pool: getPool(), ...providers };
}

/**
 * MOCK + FIXTURE mode only: when the input is exactly the text of a fixture eval case, answer with that case's
 * scripted model output so the full card set can be exercised. Every such run is labeled MOCK in the UI.
 */
export function mockProvidersFor(text: string) {
  if (process.env.CAFAI_CATALOG !== "fixture") return null;
  const dir = join(process.cwd(), "eval/cases/fixture");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const c = JSON.parse(readFileSync(join(dir, f), "utf8")) as EvalCase;
    if (c.fixture && c.text === text.trim()) {
      const s = scriptedFor(c);
      return { llm: s, decision: s };
    }
  }
  return null;
}
