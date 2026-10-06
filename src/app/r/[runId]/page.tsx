// /r/:runId (plan §18): read-back, picks, "Not needed now" and the order. Runs are shareable and resumable by URL.
import { notFound } from "next/navigation";
import { cache } from "react";
import { isUuid } from "@/db/client";
import { readFlags } from "@/server/controls";
import { getRuntime, snapshotFor } from "@/server/runtime";
import { loadRun, type StoredRun } from "@/server/runService";
import { rerun } from "../../actions";
import { MATCH_LABEL, NOT_NEEDED_REASON } from "../../_components/labels";
import { OrderSummary } from "../../_components/OrderSummary";
import { PickCard } from "../../_components/PickCard";
import { SubmitButton } from "../../_components/SubmitButton";
import { ArrowRightIcon, PencilIcon } from "../../_components/icons";

export const dynamic = "force-dynamic";

// One database read per request, shared by the page and its title.
const getRun = cache((id: string) => (isUuid(id) ? loadRun(getRuntime().pool, id) : Promise.resolve(null)));

// The tab title names what the page shows; a missing order says so (the not-found page cannot set it here).
const TITLES: Record<string, string> = {
  needs_confirmation: "Is this right?",
  needs_clarification: "Tell us a little more",
  nothing_needed: "Nothing new needed",
  no_good_pick: "No good pick yet",
  out_of_scope: "Outside what we do",
};
export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }) {
  const run = await getRun((await params).runId);
  if (!run) return { title: "Order not found" };
  return { title: run.picks.length ? "Your picks" : (TITLES[run.outcome] ?? "Your order") };
}

// Placeholder wording (REGISTER A-030).
const RUN_ERRORS: Record<string, string> = {
  quota: "You have made a lot of orders in the last hour. Please try again later.",
  paused: "New orders are paused for a moment. Please try again later.",
  expired: "Your original wording for this order has expired, so it cannot be run again. Start a new order instead.",
};

function ReadBack({ run }: { run: StoredRun }) {
  const items = run.details.readback;
  const q = run.details.clarifying_question;
  // Open only when the next step is to check or add to what we understood.
  const open = run.outcome === "needs_confirmation" || run.outcome === "needs_clarification";
  const asking = run.outcome === "needs_clarification";
  return (
    <details className="readback" open={open}>
      <summary>
        <span className="readback-text">
          <span className="readback-label">We understood<span className="sr-only">:</span></span>{" "}
          {items[0]?.text ?? "Nothing yet"}
          {items.length > 1 && <span className="muted"> and {items.length - 1} more</span>}
        </span>
        <span className="readback-edit">
          <span className="if-closed">{run.text === null ? "Show" : <><PencilIcon />Change this</>}</span>
          <span className="if-open">Hide</span>
        </span>
      </summary>
      {run.text === null ? (
        <div className="readback-form">
          <ul className="have">{items.map((it) => <li key={it.id}>{it.text}</li>)}</ul>
          <p className="small muted">Your original wording for this order has expired, so it can’t be changed. <a href="/">Start a new order</a> instead.</p>
        </div>
      ) : (
      <form action={rerun} className="readback-form" id="readback-form">
        <input type="hidden" name="run" value={run.id} />
        {run.text && (
          <div className="part">
            <span className="part-label">You said</span>
            <blockquote className="said">{run.text}</blockquote>
          </div>
        )}
        {items.length > 0 && (
          <fieldset className="readback-items">
            <legend className="legend">Here’s what we understood. Change anything that’s off.</legend>
            {items.map((it, i) => (
              <div className="field" key={it.id}>
                <label htmlFor={`item-${i}`} className="sr-only">Understood item {i + 1}</label>
                <input type="hidden" name="item_id" value={it.id} />
                <input type="hidden" name="item_kind" value={it.kind} />
                <input id={`item-${i}`} name="item_text" className="input" defaultValue={it.text} maxLength={300} autoComplete="off" />
              </div>
            ))}
          </fieldset>
        )}
        <div className="field">
          <label htmlFor="add_item">Add something I missed</label>
          <input id="add_item" name="add_item" className="input" maxLength={300} autoComplete="off" />
        </div>
        {q && (
          <fieldset className={`chips${asking ? " ask" : ""}`}>
            <legend className="legend">{asking ? q.text : `One quick question (only if it changes a pick): ${q.text}`}</legend>
            {q.options.map((o) => (
              <label key={o} className="chip"><input type="radio" name="answer" value={o} /><span>{o}</span></label>
            ))}
          </fieldset>
        )}
        <div className="form-actions">
          <span className="small muted">{run.picks.length ? "Editing redoes the picks." : "We look again with your changes."}</span>
          <span className="form-buttons">
            <SubmitButton className={`btn${run.outcome === "needs_clarification" ? " primary" : ""}`} name="update" value="1" pendingText="Updating…">Update my picks</SubmitButton>
            {run.outcome === "needs_confirmation" && (
              <SubmitButton className="btn primary" name="confirm" value="1" pendingText="Checking…">Yes, that’s right</SubmitButton>
            )}
          </span>
        </div>
      </form>
      )}
    </details>
  );
}

function Outcome({ run, capName }: { run: StoredRun; capName: (id: string) => string }) {
  const present = run.details.present;
  const Have = () =>
    present.length ? (
      <div className="part">
        <span className="part-label">You already have this covered</span>
        <ul className="have">{present.map((p) => <li key={p.capability_id}>{capName(p.capability_id)}</li>)}</ul>
      </div>
    ) : null;
  const Again = () => <a className="btn primary fit" href="/">Start a new order<ArrowRightIcon /></a>;
  switch (run.outcome) {
    case "needs_confirmation":
      return (
        <section className="state">
          <h1>Is this right?</h1>
          {run.text !== null ? (
            <p>We are not sure we understood. Check what we understood below, then confirm it or change it.</p>
          ) : (
            <>
              <p>We were not sure we understood, and your original wording has expired, so this order can’t be checked again.</p>
              <Again />
            </>
          )}
        </section>
      );
    case "needs_clarification":
      return (
        <section className="state">
          <h1>Tell us a little more.</h1>
          <p>We need a bit more to go on. Below, add what you are building or what slows you down, or <a href="/#examples">start from an example</a>.</p>
        </section>
      );
    case "nothing_needed":
      return (
        <section className="state">
          <h1>You may not need anything new.</h1>
          <Have />
          <Again />
        </section>
      );
    case "no_good_pick":
      return (
        <section className="state">
          <h1>No good pick yet.</h1>
          <Have />
          <p className="muted">We noted the gap so our menu can grow where people need it.</p>
          <Again />
        </section>
      );
    case "out_of_scope":
      return (
        <section className="state">
          <h1>That is outside what we do.</h1>
          {/* Copy not in the plan (wireframe board 6 [COPY TBC]); placeholder wording, REGISTER A-030. */}
          <p>Caf.ai suggests tools and practices for something you are building or working on. Try describing a project.</p>
          <Again />
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
  const run = await getRun(runId);
  if (!run) notFound();
  const snapshot = await snapshotFor(run.catalog_version);
  if (!snapshot) notFound();

  const capName = (id: string) => snapshot.taxonomy.find((c) => c.id === id)?.plain_name ?? id;
  const clientNames = run.declared_clients.map((c) => snapshot.clients.find((k) => k.id === c)?.name).filter((n): n is string => !!n);
  const direct = run.picks.filter((p) => p.lane === "direct");
  const awk = run.picks.find((p) => p.lane === "also_worth_knowing");
  const notNeeded = run.details.not_needed;
  const offeringName = (id?: string) => (id ? snapshot.offerings.find((o) => o.id === id)?.identity.display_name : undefined);
  const card = (p: (typeof run.picks)[number], rank?: number) => (
    <PickCard key={p.id} runId={run.id} pick={p} snapshot={snapshot} readback={run.details.readback} clientNames={clientNames}
      thanks={sp.rec === p.id} revoked={flags.revoked.has(p.offering_id)} rank={rank} headingLevel={rank === undefined ? 3 : 2} />
  );

  const flags = await readFlags(pool);
  const notice = sp.error && Object.hasOwn(RUN_ERRORS, sp.error) ? RUN_ERRORS[sp.error] : undefined;
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
      <div className={`results${run.picks.length ? "" : " solo"}`}>
        <div className="results-main">
          {run.picks.length > 0 ? (
            <header className="results-head">
              <h1 id="picks-title">Barista’s picks</h1>
              <p className="muted">Best fit first. Each one is optional.</p>
            </header>
          ) : (
            <Outcome run={run} capName={capName} />
          )}
          <ReadBack run={run} />

          {direct.length > 0 && (
            <section className="pick-list" aria-labelledby="picks-title">
              {direct.map((p, i) => card(p, i + 1))}
            </section>
          )}

          {awk && (
            <section className="pick-list" aria-labelledby="awk-title">
              <div className="section-head">
                <h2 id="awk-title">Also worth knowing</h2>
                <p className="muted">One extra idea you did not ask about. We only show one, and only when we are fairly sure.</p>
              </div>
              {card(awk)}
            </section>
          )}
        </div>

        {run.picks.length > 0 && (
          <aside className="order" aria-labelledby="order-title">
            <h2 id="order-title">Your order</h2>
            <OrderSummary runId={run.id} items={[
              ...direct.map((p, i) => ({ id: p.offering_id, name: offeringName(p.offering_id) ?? p.offering_id, extra: false, rank: i + 1 }))
                .filter((i) => !flags.revoked.has(i.id)),
              ...(awk && !flags.revoked.has(awk.offering_id) ? [{ id: awk.offering_id, name: offeringName(awk.offering_id) ?? awk.offering_id, extra: true }] : []),
            ]} />
            <p className="small muted">Tick or untick picks on the cards to change what goes into setup.</p>
            <form id="order" action={`/r/${run.id}/setup`} method="get">
              {/* Marks a submitted order, so ticking nothing sets up nothing instead of the default picks. */}
              <input type="hidden" name="order" value="1" />
              <button className="btn primary wide">Set up in {clientNames.length === 1 ? clientNames[0] : "your AI tool"}<ArrowRightIcon /></button>
            </form>
            {run.text !== null && <form action={rerun} className="refine">
              <input type="hidden" name="run" value={run.id} />
              <input type="hidden" name="refine" value="1" />
              <fieldset className="chips compact">
                <legend className="legend">Refine my picks</legend>
                <label className="chip"><input type="checkbox" name="remote_only" defaultChecked={!!run.details.constraints.remote_only} /><span>Remote only</span></label>
                <label className="chip"><input type="checkbox" name="vendor_official_only" defaultChecked={!!run.details.constraints.vendor_official_only} /><span>Vendor-official only</span></label>
                <label className="chip"><input type="checkbox" name="free_only" defaultChecked={!!run.details.constraints.free_only} /><span>Free only</span></label>
              </fieldset>
              <SubmitButton className="btn quiet wide" pendingText="Updating…">Update picks</SubmitButton>
            </form>}
          </aside>
        )}

        {(notNeeded.length > 0 || run.concepts.length > 0 || run.picks.length > 0) && (
          <div className="results-more">
            {notNeeded.length > 0 && (
              <details className="disclosure">
                <summary>Not needed now <span className="count">{notNeeded.length} left out</span></summary>
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
              <details className="disclosure">
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
              <details className="disclosure">
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
        )}
      </div>
    </main>
  );
}
