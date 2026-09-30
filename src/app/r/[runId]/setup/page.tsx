// /r/:runId/setup (plan §8 Connection flow and Setup, §13 handoff, wireframe board 7).
// Caf.ai installs nothing and holds no keys: it hands the user to their own client's official path.
import { notFound } from "next/navigation";
import { isUuid } from "@/db/client";
import { readFlags } from "@/server/controls";
import { getRuntime, snapshotFor } from "@/server/runtime";
import { loadRun } from "@/server/runService";
import { handoffsFor, pasteMessage } from "@/setup/handoff";
import { sendFeedback } from "../../../actions";
import { CopyButton } from "../../../_components/CopyButton";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params, searchParams }: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ pick?: string | string[]; client?: string; thanks?: string; rec?: string }>;
}) {
  const { runId } = await params;
  const sp = await searchParams;
  if (!isUuid(runId)) notFound();
  const run = await loadRun(getRuntime().pool, runId);
  if (!run) notFound();
  const snapshot = await snapshotFor(run.catalog_version);
  if (!snapshot) notFound();

  // Only picks from this run; the order form sends the ticked ones (default: the direct picks).
  const requested = new Set([sp.pick ?? []].flat());
  const flags = await readFlags(getRuntime().pool);
  // Revoked offerings never get setup steps (§11 "Setup hidden").
  const picks = run.picks
    .filter((p) => (requested.size ? requested.has(p.offering_id) : p.lane === "direct"))
    .filter((p) => !flags.revoked.has(p.offering_id));
  // Tabs for declared clients only (§8); with none declared, the three supported clients (REGISTER A-031).
  const declared = run.declared_clients.filter((c) => snapshot.clients.some((k) => k.id === c));
  const clients = (declared.length ? declared : snapshot.clients.map((c) => c.id)).map((id) => snapshot.clients.find((c) => c.id === id)!);
  const client = clients.find((c) => c.id === sp.client) ?? clients[0]!;
  const handoffs = handoffsFor(snapshot, picks.map((p) => p.offering_id), client.id);
  const query = (clientId: string) => `?${[...picks.map((p) => `pick=${encodeURIComponent(p.offering_id)}`), `client=${clientId}`].join("&")}`;

  return (
    <main className="page">
      <div className="counter setup">
        <a href={`/r/${run.id}`}>Back to your picks</a>
        <div className="stack">
          <h1 className="section-title">Your order is ready</h1>
          <p>Your own AI tool does the setup, and asks before each step. Caf.ai installs nothing.</p>
          <p className="small muted setup-desktop-note">Setup works best on a computer.</p>
        </div>

        {picks.length === 0 ? (
          <section className="state"><h2>Nothing in your order</h2><p>Go back and tick at least one pick.</p></section>
        ) : (
          <>
            <nav className="tabs" aria-label="Set up in">
              {clients.map((c) => (
                <a key={c.id} className="tab" href={query(c.id)} aria-current={c.id === client.id ? "page" : undefined}>{c.name}</a>
              ))}
            </nav>

            <section className="card" aria-labelledby="msg-title">
              <div className="row">
                <h2 id="msg-title">Message for {client.name}</h2>
                <CopyButton targetId="paste-message" />
              </div>
              <pre id="paste-message" className="code">{pasteMessage(client.name, handoffs)}</pre>
              {client.plan_limits?.map((l) => <p key={l} className="small muted">{l}</p>)}
            </section>

            {handoffs.map((h) => {
              const d = h.distribution;
              const pick = picks.find((p) => p.offering_id === h.offering.id)!;
              return (
                <section key={h.offering.id} className="card" id={`pick-${pick.id}`} aria-labelledby={`s-${pick.id}`}>
                  <h3 id={`s-${pick.id}`}>{h.offering.identity.display_name}</h3>
                  {!d ? (
                    <p>No setup route for {client.name} in our catalog yet. Try another tab.</p>
                  ) : (
                    <>
                      {d.command && (
                        <div className="part">
                          <span className="part-label">Command</span>
                          <pre className="code">{d.command}</pre>
                        </div>
                      )}
                      {h.decoded && "config" in h.decoded && (
                        <div className="part">
                          <span className="part-label">What this install link will add</span>
                          <pre className="code">{JSON.stringify(h.decoded.config, null, 2)}</pre>
                          <p className="danger">Read what this will add before you open the link.</p>
                          <a className="btn fit" href={d.link}>Open install link</a>
                        </div>
                      )}
                      {h.decoded && "error" in h.decoded && <p className="danger">{h.decoded.error}</p>}
                      {d.link && !h.decoded && <p>Install link: <a href={d.link}>{d.link}</a></p>}
                      {d.url && <p>{d.method === "connector" ? "Connector URL" : "Start here"}: <span className="ph">{d.url}</span></p>}
                      {d.steps?.map((s) => <p key={s}>{s}</p>)}
                      {h.warnings.map((w) => <p key={w.kind} className="danger">{w.text}</p>)}
                      {h.offering.access.least_privilege_steps?.map((s) => <p key={s} className="danger">{s}</p>)}
                      {client.id === "claude_code" && d.client === "claude_code" && (
                        <p className="danger">Servers saved in a project&apos;s shared config load without asking in scripted (headless) runs.</p>
                      )}
                      <p className="small muted">
                        Official guide: <a href={d.source_url}>{new URL(d.source_url).hostname}</a> · Checked {d.verified_on}
                        {h.hosts.length > 0 && <> · Connects to: {h.hosts.join(", ")}</>}
                      </p>
                    </>
                  )}
                  <div className="part">
                    <span className="part-label">First thing to try</span>
                    <p className="quote">“{h.offering.editorial.first_prompt}”</p>
                  </div>
                  <form action={sendFeedback} className="feedback">
                    <input type="hidden" name="run" value={run.id} />
                    <input type="hidden" name="rec" value={pick.id} />
                    <input type="hidden" name="back" value="setup" />
                    <span className="small muted">How did it go?</span>
                    <button className="btn small" name="kind" value="it_worked">It worked</button>
                    <button className="btn small" name="kind" value="stuck">I&apos;m stuck</button>
                    {sp.rec === pick.id && sp.thanks === "it_worked" && <span role="status" className="small">Great. Thanks for telling us.</span>}
                    {sp.rec === pick.id && sp.thanks === "stuck" && (
                      <span role="status" className="small">Thanks. We will re-check this setup step.</span>
                    )}
                  </form>
                </section>
              );
            })}

            <section className="card">
              <h2>Good to know</h2>
              <p>Your AI tool asks before it installs anything.</p>
              <p>Caf.ai holds no keys for your other services. Never paste keys or tokens into Caf.ai.</p>
              <p>To take a tool off, remove it where you added it.</p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
