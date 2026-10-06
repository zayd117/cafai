import { getProviders } from "@/engine/providers";
import { savedExampleById } from "@/server/savedExamples";
import { formatDate } from "./format";

/** Shown instead of the sample-mode note on runs answered from an intake example's saved answer (catalog/examples). */
export function SavedExampleNote({ id }: { id: string }) {
  const ex = savedExampleById(id);
  if (!ex) return null;
  const sample = process.env.CAFAI_CATALOG === "fixture" || getProviders().mock;
  return (
    <aside className="banner saved-note" aria-label="Saved example">
      <span className="tag">Saved example</span>
      <span>
        These are real tools, checked against each maker’s own pages on <time dateTime={ex.prepared_on}>{formatDate(ex.prepared_on)}</time>.
        The answer was written ahead of time, so no AI ran for it.
        {sample && " Descriptions you write yourself still get a sample answer for now."}
      </span>
    </aside>
  );
}
