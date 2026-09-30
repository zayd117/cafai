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
