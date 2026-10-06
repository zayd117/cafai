// Saved answers for the intake's example buttons (catalog/examples/*.json). Each one was written ahead of time from the
// real catalog, so clicking an example shows real tools without calling a model. Descriptions people type themselves
// never use these: they go through the normal pipeline (sample mode today, the AI once a key is added).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ScriptedProvider } from "@/engine/providers/mock";
import type { ExplanationRequest, JudgmentRequest } from "@/engine/providers/types";
import type { Explanation, Judgment, ProfileItem } from "@/engine/types";

export interface SavedExample {
  id: string;
  label: string;
  text: string;
  prepared_on: string;
  /** Used when the person ticked no AI tool on the intake. */
  declared_clients: string[];
  understand: unknown;
  judgments: Record<string, Omit<Judgment, "offering_id">>;
  explanations: Record<string, Omit<Explanation, "offering_id">>;
}

export function loadSavedExamples(dir: string): SavedExample[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as SavedExample);
}

let cache: SavedExample[] | undefined;
export const savedExamples = () => (cache ??= loadSavedExamples(join(process.cwd(), "catalog/examples")));

export const savedExampleFor = (text: string) => savedExamples().find((e) => e.text === text.trim()) ?? null;
export const savedExampleById = (id: string) => savedExamples().find((e) => e.id === id) ?? null;

/** Answers the three model calls from the saved example. Candidates or picks it has no entry for get no saved
 * judgment (the engine scores them as unjudged) and no saved explanation (the engine's template fills in). */
export function savedProviders(ex: SavedExample): ScriptedProvider {
  const p = new ScriptedProvider({
    understand: () => ex.understand,
    judge: (req: JudgmentRequest) => ({
      judgments: req.candidates
        .filter((c) => ex.judgments[c.offering_id]?.capability_id === c.capability_id)
        .map((c) => ({ offering_id: c.offering_id, ...ex.judgments[c.offering_id] })),
    }),
    explain: (req: ExplanationRequest) => ({
      explanations: req.picks.filter((p) => ex.explanations[p.offering_id]).map((p) => ({ offering_id: p.offering_id, ...ex.explanations[p.offering_id] })),
    }),
  });
  p.id = `saved:${ex.id}`;
  return p;
}

/** The read-back as posted equals the stored one, so the saved answer still describes this order. */
export function sameReadback(items: { id: string; kind: string; text: string }[], readback: ProfileItem[]): boolean {
  return items.length === readback.length && items.every((it, i) => it.id === readback[i]!.id && it.kind === readback[i]!.kind && it.text === readback[i]!.text.trim().slice(0, 300));
}
