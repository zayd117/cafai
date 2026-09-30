// The 12-part card on three levels (plan §8 Card anatomy). Level 1 never shows MCP, stdio, OAuth, API or SDK;
// catalog facts (names, access, setup) render from the run's catalog snapshot, never from model text (§9).
import { Fragment } from "react";
import type { CatalogSnapshot, Fact } from "@/catalog/types";
import type { StoredPick } from "@/server/runService";
import type { ProfileItem } from "@/engine/types";
import { sendFeedback } from "../actions";
import { CONFIDENCE_DOTS, CONFIDENCE_LABEL, KIND_LABEL, MATCH_LABEL, MATCH_SEGMENTS, NEED_LABEL, TRUST_LABEL } from "./labels";

function MatchMeter({ band }: { band: string }) {
  const on = MATCH_SEGMENTS[band] ?? 0;
  return (
    <span className="signal">
      <span className="meter" aria-hidden="true">{[0, 1, 2, 3].map((i) => <i key={i} className={i < on ? "on" : ""} />)}</span>
      {MATCH_LABEL[band]}
    </span>
  );
}

function ConfidenceDots({ band }: { band: string }) {
  const on = CONFIDENCE_DOTS[band] ?? 0;
  return (
    <span className="signal">
      <span className="meter dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i < on ? "on" : ""} />)}</span>
      {CONFIDENCE_LABEL[band]}
    </span>
  );
}

function FactLine({ f }: { f: Fact }) {
  return (
    <li>
      <span className="ev">{f.evidence.toUpperCase()}</span>
      <span>{f.evidence === "inferred" ? `We think: ${f.text}` : f.text}</span>
      <span className="muted small">{new URL(f.source_url).hostname} · {f.as_of}</span>
    </li>
  );
}

export function PickCard(props: {
  runId: string;
  pick: StoredPick;
  snapshot: CatalogSnapshot;
  readback: ProfileItem[];
  clientNames: string[];
  thanks: boolean;
  /** Revoked after this run was made (§11, §19): annotate, and hide setup. */
  revoked?: boolean;
}) {
  const { runId, pick, snapshot, readback, clientNames } = props;
  const o = snapshot.offerings.find((x) => x.id === pick.offering_id);
  if (!o) return null; // offering left the snapshot: never render a pick without catalog facts
  const ex = pick.explanation;
  const evidence = readback.find((i) => ex.evidence_ids.includes(i.id));
  const awk = pick.lane === "also_worth_knowing";
  const facts = [...o.resource_profile.provides, ...o.resource_profile.requires, ...o.resource_profile.limits];
  const lowConfidence = pick.confidence_band === "low";

  if (props.revoked) {
    return (
      <article className="card" id={`pick-${pick.id}`} aria-labelledby={`t-${pick.id}`}>
        <h3 id={`t-${pick.id}`}>{o.identity.display_name}</h3>
        {/* Revoked notice copy is not in the plan (board 5 [COPY TBC]); placeholder, REGISTER A-030. */}
        <p className="danger">We no longer recommend this, so its setup is hidden. If you added it, remove it where you added it.</p>
      </article>
    );
  }
  return (
    <article className={`card${awk ? " awk" : ""}`} id={`pick-${pick.id}`} aria-labelledby={`t-${pick.id}`}>
      {/* Level 1: parts 1, 2, 3, 5, 6, 7, 8, 10, 11 */}
      <div className="card-head">
        <div className="part">
          <h3 id={`t-${pick.id}`}>{o.identity.display_name}</h3>
          <span className="maker">by {o.identity.vendor}</span>
        </div>
        <label className="chip">
          <input type="checkbox" name="pick" value={o.id} form="order" defaultChecked={!awk} />
          <span>{awk ? "Add to my order" : "In my order"}</span>
        </label>
      </div>
      <p>{o.editorial.what_it_is}</p>
      <div className="signals" aria-label="How well it fits and how sure we are">
        <div className="part"><span className="part-label">Match</span><MatchMeter band={pick.match_band} /></div>
        <div className="part"><span className="part-label">Confidence</span><ConfidenceDots band={pick.confidence_band} /></div>
      </div>
      <div className="part">
        <span className="part-label">{awk ? "Why it is here" : "Why we showed it"}</span>
        {evidence && <p className="quote">“{evidence.quote}”</p>}
        <p>{ex.why}</p>
      </div>
      <div className="part">
        <span className="part-label">What it could help with</span>
        <p>{o.editorial.could_help_with}</p>
      </div>
      <div className="part">
        <span className="part-label">Do you need it?</span>
        <p><span className={`need${pick.do_you_need_it === "needed_now" ? "" : " later"}`}>{NEED_LABEL[pick.do_you_need_it]}</span> {ex.do_you_need_it}</p>
      </div>
      {lowConfidence && <p className="small">This looks relevant, but we don’t have enough evidence to be confident.</p>}
      {pick.notes.includes("checked_trust") && <p className="small muted">Our checks on this one are automated only so far.</p>}
      {ex.skip_if && <p className="small">{ex.skip_if}</p>}
      <dl className="meta">
        <div><dt className="part-label">Set up in</dt><dd>{clientNames.length ? clientNames.join(", ") : "your AI tool"}</dd></div>
        <div><dt className="part-label">Effort</dt><dd>{o.access.effort_plain}</dd></div>
        <div><dt className="part-label">Access</dt><dd>{o.access.access_plain}</dd></div>
      </dl>

      <form action={sendFeedback} className="feedback">
        <input type="hidden" name="run" value={runId} />
        <input type="hidden" name="rec" value={pick.id} />
        <span className="small muted">Was this useful?</span>
        <button className="btn small" name="kind" value="useful">Useful</button>
        <button className="btn small" name="kind" value="not_useful">Not useful</button>
        <button className="btn small" name="kind" value="already_knew">I knew this already</button>
        {props.thanks && <span className="small" role="status">Thanks, noted.</span>}
      </form>

      {/* Level 2: parts 4, 9, 11 (setup, access), first prompt */}
      <details className="level">
        <summary>How it fits and how to set it up</summary>
        <div className="level-body">
          <div className="part">
            <span className="part-label">How it relates to your project</span>
            <p>{ex.how_it_helps}</p>
          </div>
          <div className="part">
            <span className="part-label">Evidence</span>
            <ul className="evidence">{facts.map((f, i) => <FactLine key={i} f={f} />)}</ul>
          </div>
          <div className="part">
            <span className="part-label">Access and keys</span>
            <p>What it can reach: {o.access.access_plain}.{o.access.credential_needed ? ` You will need: ${o.access.credential_needed}.` : ""} Never paste keys into Caf.ai.</p>
            {o.access.least_privilege_steps?.map((s) => <p key={s} className="danger">{s}</p>)}
          </div>
          <div className="part">
            <span className="part-label">First thing to try</span>
            <p className="quote">“{o.editorial.first_prompt}”</p>
          </div>
          {pick.alternatives?.length > 0 && (
            <details className="alts">
              <summary>Show alternatives ({pick.alternatives.length})</summary>
              <ul>
                {pick.alternatives.map((a) => {
                  const alt = snapshot.offerings.find((x) => x.id === a.offering_id);
                  return alt ? (
                    <li key={a.offering_id}>
                      <strong>{alt.identity.display_name}</strong> <span className="muted small">by {alt.identity.vendor}</span>
                      <br />{alt.editorial.what_it_is}{" "}
                      <span className="small">{MATCH_LABEL[a.match_band]} · {CONFIDENCE_LABEL[a.confidence_band]}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </details>
          )}
        </div>
      </details>

      {/* Level 3: part 12 and the score components (numbers only here, §9 Bands) */}
      <details className="level">
        <summary>Technical details</summary>
        <div className="level-body">
          <dl className="kv">
            <dt>Offering type</dt><dd>{KIND_LABEL[o.kind]}</dd>
            <dt>Where it runs</dt><dd>{o.runtime.location.replace("_", " ")}</dd>
            <dt>Sign-in method</dt><dd>{o.access.auth === "none" ? "none" : o.access.auth === "oauth" ? "OAuth (you approve access in your browser)" : "API key"}</dd>
            <dt>Pinned version</dt><dd>{o.distributions.find((d) => d.version_pin)?.version_pin ?? "not pinned in the catalog"}</dd>
            <dt>Trust state</dt><dd>{TRUST_LABEL[o.trust.state] ?? o.trust.state} (a gate for eligibility, not a score)</dd>
            <dt>Last verified</dt><dd>{o.last_verified_on}</dd>
            <dt>Sources</dt><dd>{[...new Set(facts.map((f) => new URL(f.source_url).hostname))].join(", ")}</dd>
          </dl>
          <div className="part">
            <span className="part-label">Score components</span>
            <p className="small muted">Numbers stay here until calibration shows they mean something. Weights are placeholders.</p>
            <dl className="kv">
              {[
                ...Object.entries(pick.match_components).map(([k, v]) => [`Match · ${k}`, Number(v).toFixed(2)]),
                ...Object.entries(pick.confidence_inputs).map(([k, v]) => [`Confidence · ${k.replace(/_/g, " ")}`, typeof v === "number" ? v.toFixed(2) : String(v)]),
              ].map(([label, value]) => (
                <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>
              ))}
            </dl>
          </div>
        </div>
      </details>
    </article>
  );
}
