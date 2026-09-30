// /r/:runId (plan §18): read-back, picks, "Not needed now" and the order. Runs are shareable and resumable by URL.
import { notFound } from "next/navigation";
import { isUuid } from "@/db/client";
import { readFlags } from "@/server/controls";
import { getRuntime, snapshotFor } from "@/server/runtime";
import { loadRun, type StoredRun } from "@/server/runService";
import { rerun } from "../../actions";
import { MATCH_LABEL, NOT_NEEDED_REASON } from "../../_components/labels";
import { PickCard } from "../../_components/PickCard";

export const dynamic = "force-dynamic";

// Placeholder wording (REGISTER A-030).
const RUN_ERRORS: Record<string, string> = {
  quota: "You have made a lot of orders in the last hour. Please try again later.",
  paused: "New orders are paused for a moment. Please try again later.",
  expired: "Your original wording for this order has expired, so it cannot be run again. Start a new order instead.",
};

function ReadBack({ run }: { run: StoredRun }) {
  const items = run.details.readback;
  const q = run.details.clarifying_question;
  const open = run.outcome !== "picks";
  return (
    <details className="card readback" open={open}>
      <summary className="row">
        <span><strong>We understood:</strong> {items[0]?.text ?? "not much yet"}</span>
        <span className="btn link">Change this</span>
      </summary>
      <form action={rerun} className="stack">
        <input type="hidden" name="run" value={run.id} />
        {run.text && (
          <div className="part">
            <span className="part-label">You said</span>
            <p className="quote">“{run.text}”</p>
          </div>
        )}
        <fieldset className="stack chips">
          <legend className="legend">Here&apos;s what I understood. Change anything that&apos;s off.</legend>
          {items.map((it, i) => (
            <div className="field" key={it.id}>
              <label htmlFor={`item-${i}`} className="sr-only">Understood item {i + 1}</label>
              <input type="hidden" name="item_id" value={it.id} />
              <input type="hidden" name="item_kind" value={it.kind} />
              <input id={`item-${i}`} name="item_text" className="input" defaultValue={it.text} maxLength={300} />
            </div>
          ))}
          <div className="field">
            <label htmlFor="add_item">Add something I missed</label>
            <input id="add_item" name="add_item" className="input" maxLength={300} />
          </div>
        </fieldset>
        {q && (
          <fieldset className="chips">
            <legend className="legend">One quick question (only if it changes a pick): {q.text}</legend>
            {q.options.map((o) => (
              <label key={o} className="chip"><input type="radio" name="answer" value={o} /><span>{o}</span></label>
            ))}
          </fieldset>
        )}
        <div className="row">
          <span className="small muted">Editing redoes the picks.</span>
          <span className="row">
            {run.outcome === "needs_confirmation" && <button className="btn primary" name="confirm" value="1">Yes, that&apos;s right</button>}
            <button className="btn">Update my picks</button>
          </span>
        </div>
      </form>
    </details>
  );
}

function Outcome({ run, capName }: { run: StoredRun; capName: (id: string) => string }) {
  const present = run.details.present;
  const Have = () =>
    present.length ? (
      <p>You already have: {present.map((p) => capName(p.capability_id)).join(", ")}.</p>
    ) : null;
  switch (run.outcome) {
    case "needs_confirmation":
      return (
        <section className="state" aria-live="polite">
          <h2>Is this right?</h2>
          <p>We are not sure we understood. Check the read-back above, then confirm or change it.</p>
        </section>
      );
    case "needs_clarification":
      return (
        <section className="state">
          <h2>Tell us a little more</h2>
          <p>We need a bit more to go on. Say what you are building or what slows you down, or <a href="/">start from an example</a>.</p>
        </section>
      );
    case "nothing_needed":
      return (
        <section className="state">
          <h2>You may not need anything new.</h2>
          <Have />
          <a className="btn" href="/">Describe another project</a>
        </section>
      );
    case "no_good_pick":
      return (
        <section className="state">
          <h2>No good pick yet.</h2>
          <Have />
          <p className="muted">We noted the gap so our menu can grow where people need it.</p>
        </section>
      );
    case "out_of_scope":
      return (
        <section className="state">
          <h2>That is outside what we do.</h2>
          {/* Copy not in the plan (wireframe board 6 [COPY TBC]); placeholder wording, REGISTER A-030. */}
          <p>Caf.ai suggests tools and practices for something you are building or working on. Try describing a project.</p>
          <a className="btn" href="/">Describe a project</a>
        </section>
      );
    default:
      return null;
  }
}

export default async function RunPage({ params, searchParams }: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ thanks?: string; rec?: string; error?: string }>;
}) {
  const { runId } = await params;
  const sp = await searchParams;
  if (!isUuid(runId)) notFound();
  const { pool } = getRuntime();
  const run = await loadRun(pool, runId);
  if (!run) notFound();
  const snapshot = await snapshotFor(run.catalog_version);
  if (!snapshot) notFound();

  const capName = (id: string) => snapshot.taxonomy.find((c) => c.id === id)?.plain_name ?? id;
  const clientNames = run.declared_clients.map((c) => snapshot.clients.find((k) => k.id === c)?.name).filter((n): n is string => !!n);
  const direct = run.picks.filter((p) => p.lane === "direct");
  const awk = run.picks.find((p) => p.lane === "also_worth_knowing");
  const notNeeded = run.details.not_needed;
  const offeringName = (id?: string) => (id ? snapshot.offerings.find((o) => o.id === id)?.identity.display_name : undefined);
  const card = (p: (typeof run.picks)[number]) => (
    <PickCard key={p.id} runId={run.id} pick={p} snapshot={snapshot} readback={run.details.readback} clientNames={clientNames} thanks={sp.rec === p.id} revoked={flags.revoked.has(p.offering_id)} />
  );

  const flags = await readFlags(pool);
  const notice = sp.error ? RUN_ERRORS[sp.error] : undefined;
  return (
    <main className="page" id="top">
      {notice && <div className="banner warn" role="alert"><span>{notice}</span></div>}
      {run.details.degraded && (
        <div className="banner warn" role="status">
          {/* Banner copy is not in the plan (board 6 [BANNER COPY TBC]); placeholder wording, REGISTER A-030. */}
          <span>
            {run.details.degraded === "deterministic_only"
              ? "Our AI helper was unavailable for this order, so we used simpler rules. Every fact shown still comes from our checked list."
              : "Explanations are shorter than usual right now. Every fact on these cards still comes from our checked list."}
          </span>
        </div>
      )}
      <div className="results">
        <div className="stack">
          <ReadBack run={run} />
          <Outcome run={run} capName={capName} />

          {direct.length > 0 && (
            <section className="stack" aria-labelledby="picks-title">
              <div>
                <h1 id="picks-title" className="section-title">Barista&apos;s picks</h1>
                <p className="muted">Best fit first. Each one is optional.</p>
              </div>
              {direct.map(card)}
            </section>
          )}

          {awk && (
            <section className="stack" aria-labelledby="awk-title">
              <div>
                <h2 id="awk-title" className="section-title">Also worth knowing</h2>
                <p className="muted">One extra idea you did not ask about. We only show one, and only when we are fairly sure.</p>
              </div>
              {card(awk)}
            </section>
          )}

          {notNeeded.length > 0 && (
            <details className="card notneeded">
              <summary>Not needed now · {notNeeded.length} left out</summary>
              <ul>
                {notNeeded.map((n, i) => (
                  <li key={i}>
                    <strong>{offeringName(n.offering_id) ?? capName(n.capability_id)}</strong>{" "}
                    {n.detail ?? NOT_NEEDED_REASON[n.reason]}{" "}
                    {n.match_band && n.reason === "low_match" && <span className="muted">({MATCH_LABEL[n.match_band]})</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {run.concepts.length > 0 && (
            <details className="card notneeded">
              <summary>How we understood this</summary>
              <p className="small muted">For technical users: the ideas behind the read-back, and whether our menu covers them yet.</p>
              <ul>
                {run.concepts.map((c, i) => (
                  <li key={i}>{c.term}: {c.capability_id ? capName(c.capability_id) : "not on our menu yet (noted as a gap)"}</li>
                ))}
              </ul>
            </details>
          )}

          {run.picks.length > 0 && (
            <details className="card notneeded">
              <summary>How we chose these</summary>
              <ul>
                <li>We read your description and worked out what your project needs.</li>
                <li>We looked only at tools on our own checked list.</li>
                <li>We kept the ones that work in your AI tool.</li>
                <li>We left out anything flagged or out of date.</li>
                <li>We ranked the rest by how well they fit your project, not by popularity and never by payment.</li>
              </ul>
            </details>
          )}
        </div>

        {run.picks.length > 0 && (
          <aside className="order" aria-labelledby="order-title">
            <h2 id="order-title">Your order</h2>
            <ol>{direct.map((p) => <li key={p.id}>{offeringName(p.offering_id)}</li>)}</ol>
            {awk && <p className="small">Extra idea, only if you tick it: {offeringName(awk.offering_id)}</p>}
            <p className="small muted">Tick or untick picks on the cards to change what goes into setup.</p>
            <form id="order" action={`/r/${run.id}/setup`} method="get">
              <button className="btn primary">Set up in {clientNames.length === 1 ? clientNames[0] : "your AI tool"}</button>
            </form>
            <form action={rerun} className="stack">
              <input type="hidden" name="run" value={run.id} />
              <input type="hidden" name="refine" value="1" />
              <fieldset className="chips">
                <legend className="legend">Refine my picks</legend>
                <label className="chip"><input type="checkbox" name="remote_only" defaultChecked={!!run.details.constraints.remote_only} /><span>Remote only</span></label>
                <label className="chip"><input type="checkbox" name="vendor_official_only" defaultChecked={!!run.details.constraints.vendor_official_only} /><span>Vendor-official only</span></label>
                <label className="chip"><input type="checkbox" name="free_only" defaultChecked={!!run.details.constraints.free_only} /><span>Free only</span></label>
              </fieldset>
              <button className="btn small">Update picks</button>
            </form>
          </aside>
        )}
      </div>
    </main>
  );
}
