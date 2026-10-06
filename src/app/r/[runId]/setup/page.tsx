// /r/:runId/setup (plan §8 Connection flow and Setup, §13 handoff, wireframe board 7).
// Caf.ai installs nothing and holds no keys: it hands the user to their own client's official path.
import { notFound } from "next/navigation";
import { cache } from "react";
import { isUuid } from "@/db/client";
import { readFlags } from "@/server/controls";
import { getRuntime, snapshotFor } from "@/server/runtime";
import { loadRun } from "@/server/runService";
import { handoffsFor, pasteMessage } from "@/setup/handoff";
import { sendFeedback } from "../../../actions";
import { CopyButton } from "../../../_components/CopyButton";
import { SubmitButton } from "../../../_components/SubmitButton";
import { Thanks } from "../../../_components/Thanks";
import { formatDate } from "../../../_components/format";
import { ArrowLeftIcon } from "../../../_components/icons";

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
};

export const dynamic = "force-dynamic";

const getRun = cache((id: string) => (isUuid(id) ? loadRun(getRuntime().pool, id) : Promise.resolve(null)));

export async function generateMetadata({ params }: { params: Promise<{ runId: string }> }) {
  return { title: (await getRun((await params).runId)) ? "Set up your order" : "Order not found" };
}

export default async function SetupPage({ params, searchParams }: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ pick?: string | string[]; client?: string; thanks?: string; rec?: string; order?: string }>;
}) {
  const { runId } = await params;
  const sp = await searchParams;
  if (!isUuid(runId)) notFound();
  const run = await getRun(runId);
  if (!run) notFound();
  const snapshot = await snapshotFor(run.catalog_version);
  if (!snapshot) notFound();

  // Only picks from this run. The order form sends the ticked ones plus order=1, so ticking nothing sets up nothing;
  // a bare link to this page (no picks, no order mark) gets the direct picks.
  const requested = new Set([sp.pick ?? []].flat());
  const chosen = requested.size > 0 || sp.order !== undefined;
  const flags = await readFlags(getRuntime().pool);
  // Revoked offerings never get setup steps (§11 "Setup hidden"); say so rather than dropping them silently.
  const ordered = run.picks.filter((p) => (chosen ? requested.has(p.offering_id) : p.lane === "direct"));
  const picks = ordered.filter((p) => !flags.revoked.has(p.offering_id));
  const withdrawn = ordered.length - picks.length;
  // Tabs for declared clients only (§8); with none declared, the three supported clients (REGISTER A-031).
  const declared = run.declared_clients.filter((c) => snapshot.clients.some((k) => k.id === c));
  const clients = (declared.length ? declared : snapshot.clients.map((c) => c.id)).map((id) => snapshot.clients.find((c) => c.id === id)!);
  const client = clients.find((c) => c.id === sp.client) ?? clients[0]!;
  const handoffs = handoffsFor(snapshot, picks.map((p) => p.offering_id), client.id);
  const headlessNote = client.id === "claude_code" && handoffs.some((h) => h.distribution?.client === "claude_code");
  // Links and feedback carry the whole order (revoked ones too), so the "no longer recommended" note stays.
  const query = (clientId: string) => `?${[...ordered.map((p) => `pick=${encodeURIComponent(p.offering_id)}`), `client=${clientId}`].join("&")}`;
  const message = pasteMessage(client.name, handoffs);

  return (
    <main className="page">
      <div className="setup">
        <a className="back" href={`/r/${run.id}`}><ArrowLeftIcon />Back to your picks</a>
        {picks.length === 0 ? (
          <header className="results-head">
            <h1>Nothing to set up yet</h1>
            <p className="muted">{withdrawn ? "Go back and choose another pick." : "Go back and tick at least one pick."}</p>
          </header>
        ) : (
          <header className="results-head">
            <h1>Your order is ready</h1>
            <p className="muted">Your own AI tool does the setup, and asks before each step. Caf.ai installs nothing.</p>
            <p className="small muted setup-desktop-note">Setup works best on a computer.</p>
          </header>
        )}
        {withdrawn > 0 && (
          <p className="caution" role="note">
            {withdrawn === 1 ? "A pick you chose is" : `${withdrawn} picks you chose are`} no longer recommended, so {withdrawn === 1 ? "it is" : "they are"} not set up here.
          </p>
        )}

        {picks.length > 0 && (
          <>
            <div className="setup-tool">
              <span className="legend" id="tool-label">Your AI tool</span>
              <nav className="tabs" aria-labelledby="tool-label">
                {clients.map((c) => (
                  <a key={c.id} className="tab" href={query(c.id)} aria-current={c.id === client.id ? "page" : undefined}>{c.name}</a>
                ))}
              </nav>
            </div>

            <section className="card message" aria-labelledby="msg-title">
              <div className="message-head">
                <div>
                  <h2 id="msg-title">Message for {client.name}</h2>
                  <p className="small muted">Paste this into {client.name}. If it asks for a key, give it to {client.name}, never to Caf.ai.</p>
                </div>
                <CopyButton targetId="paste-message" text={message} />
              </div>
              <pre id="paste-message" className="paste" translate="no">{message}</pre>
              {client.plan_limits?.map((l) => <p key={l} className="small muted">{l}</p>)}
            </section>

            <div className="section-head">
              <h2>What your AI tool will do</h2>
              <p className="muted">You do not need to run these yourself. They are here so you can check them first.</p>
            </div>

            {handoffs.map((h, i) => {
              const d = h.distribution;
              const pick = picks.find((p) => p.offering_id === h.offering.id)!;
              return (
                <section key={h.offering.id} className="card tool" id={`pick-${pick.id}`} aria-labelledby={`s-${pick.id}`}>
                  {/* Numbered like the lines of the message above. */}
                  <h3 id={`s-${pick.id}`}><span className="tool-n" aria-hidden="true">{i + 1}</span>{h.offering.identity.display_name}</h3>
                  {!d ? (
                    <p>We do not have setup steps for {client.name} yet. Choose another AI tool above.</p>
                  ) : (
                    <>
                      {d.command && (
                        <div className="part">
                          <span className="part-label">Command it will run</span>
                          <pre className="code" translate="no">{d.command}</pre>
                        </div>
                      )}
                      {h.decoded && "config" in h.decoded && (
                        <div className="part">
                          <span className="part-label">What this install link will add</span>
                          <pre className="code" translate="no">{JSON.stringify(h.decoded.config, null, 2)}</pre>
                          <p className="caution">Read what this will add before you open the link.</p>
                          <a className="btn fit" href={d.link}>Open install link</a>
                        </div>
                      )}
                      {h.decoded && "error" in h.decoded && <p className="danger">{h.decoded.error}</p>}
                      {d.link && !h.decoded && <p className="source">Install link: <a href={d.link}>{hostOf(d.link)}</a></p>}
                      {d.url && (d.method === "connector"
                        ? <p className="source">Connector URL: <code className="inline-code" translate="no">{d.url}</code></p>
                        : <p className="source">Start here: <a href={d.url}>{hostOf(d.url)}</a></p>)}
                      {d.steps?.length ? <ol className="steps-list">{d.steps.map((s) => <li key={s}>{s}</li>)}</ol> : null}
                      {(h.warnings.length > 0 || (h.offering.access.least_privilege_steps?.length ?? 0) > 0) && (
                        <div className="caution list" role="note">
                          <ul>
                            {h.warnings.map((w) => <li key={w.kind}>{w.text}</li>)}
                            {h.offering.access.least_privilege_steps?.map((s) => <li key={s}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      <p className="small muted source">
                        Official guide: <a href={d.source_url}>{hostOf(d.source_url)}</a> · Checked <time className="nowrap" dateTime={d.verified_on}>{formatDate(d.verified_on)}</time>
                      </p>
                      {h.hosts.length > 0 && <p className="small muted source">Connects to: {h.hosts.join(", ")}</p>}
                    </>
                  )}
                  <div className="part">
                    <span className="part-label">First thing to try</span>
                    <p className="prompt">{h.offering.editorial.first_prompt}</p>
                  </div>
                  <form action={sendFeedback} className="feedback">
                    <input type="hidden" name="run" value={run.id} />
                    <input type="hidden" name="rec" value={pick.id} />
                    <input type="hidden" name="back" value="setup" />
                    <input type="hidden" name="client" value={client.id} />
                    {ordered.map((p) => <input key={p.id} type="hidden" name="pick" value={p.offering_id} />)}
                    <span className="small muted">How did it go?</span>
                    <SubmitButton className="btn quiet small" name="kind" value="it_worked" aria-describedby={`s-${pick.id}`}>It worked</SubmitButton>
                    <SubmitButton className="btn quiet small" name="kind" value="stuck" aria-describedby={`s-${pick.id}`}>I’m stuck</SubmitButton>
                    {sp.rec === pick.id && (sp.thanks === "it_worked" || sp.thanks === "stuck") && (
                      <Thanks text={sp.thanks === "it_worked" ? "Great. Thanks for telling us." : "Thanks. We will re-check this setup step."} />
                    )}
                  </form>
                </section>
              );
            })}

            <section className="aside-note" aria-labelledby="gtk-title">
              <h2 id="gtk-title">Good to know</h2>
              <ul>
                <li>Caf.ai holds no keys for your other services. Never paste keys or tokens into Caf.ai.</li>
                <li>To take a tool off, remove it where you added it.</li>
                {headlessNote && <li>Tools saved in a project’s shared settings switch on without asking when Claude Code runs in scripts (headless mode).</li>}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
