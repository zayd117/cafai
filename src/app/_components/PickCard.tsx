// The 12-part card on three levels (plan §8 Card anatomy). Level 1 never shows MCP, stdio, OAuth, API or SDK;
// catalog facts (names, access, setup) render from the run's catalog snapshot, never from model text (§9).
import { Fragment } from "react";
import type { CatalogSnapshot, Fact } from "@/catalog/types";
import type { StoredPick } from "@/server/runService";
import type { ProfileItem } from "@/engine/types";
import { sendFeedback } from "../actions";
import { formatDate } from "./format";
import { SubmitButton } from "./SubmitButton";
import { Thanks } from "./Thanks";
import { CONFIDENCE_DOTS, CONFIDENCE_LABEL, EVIDENCE_LABEL, KIND_LABEL, MATCH_LABEL, MATCH_SEGMENTS, NEED_LABEL, TRUST_LABEL } from "./labels";

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
      <span className={`ev ev-${f.evidence}`}>{EVIDENCE_LABEL[f.evidence]}</span>
      <span>{f.evidence === "inferred" ? `We think: ${f.text}` : f.text}</span>
      <span className="muted small nums">{new URL(f.source_url).hostname} · <time dateTime={f.as_of}>{formatDate(f.as_of)}</time></span>
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
  /** Position in "Best fit first" (direct picks only); matches the numbers in the order panel. */
  rank?: number;
  /** h2 when the card sits right under the page h1, h3 under a section h2. */
  headingLevel?: 2 | 3;
}) {
  const { runId, pick, snapshot, readback, clientNames } = props;
  const o = snapshot.offerings.find((x) => x.id === pick.offering_id);
  if (!o) return null; // offering left the snapshot: never render a pick without catalog facts
  const ex = pick.explanation;
  const evidence = readback.find((i) => ex.evidence_ids.includes(i.id));
  const awk = pick.lane === "also_worth_knowing";
  const facts = [...o.resource_profile.provides, ...o.resource_profile.requires, ...o.resource_profile.limits];
  const lowConfidence = pick.confidence_band === "low";
  const H = props.headingLevel === 2 ? "h2" : "h3";

  if (props.revoked) {
    return (
      <article className="card" id={`pick-${pick.id}`} aria-labelledby={`t-${pick.id}`}>
        <H id={`t-${pick.id}`}>{o.identity.display_name}</H>
        {/* Revoked notice copy is not in the plan (board 5 [COPY TBC]); placeholder, REGISTER A-030. */}
        <p className="danger">We no longer recommend this, so its setup is hidden. If you added it, remove it where you added it.</p>
      </article>
    );
  }
  return (
    <article className={`card${awk ? " awk" : ""}`} id={`pick-${pick.id}`} aria-labelledby={`t-${pick.id}`}>
      {/* Level 1: parts 1, 2, 3, 5, 6, 7, 8, 10, 11 */}
      <div className="card-head">
        <div className="card-title">
          <H id={`t-${pick.id}`}>
            {props.rank !== undefined && <span className="rank" aria-hidden="true">{props.rank}</span>}
            {o.identity.display_name}
          </H>
          <span className="maker">by {o.identity.vendor}</span>
        </div>
        {/* The label follows the box: "In my order" when ticked, "Add to my order" when not. */}
        <label className="chip order-toggle">
          <input type="checkbox" name="pick" value={o.id} form="order" defaultChecked={!awk} />
          <span><span className="if-on">In my order</span><span className="if-off">Add to my order</span><span className="sr-only">: {o.identity.display_name}</span></span>
        </label>
      </div>
      <p className="card-lead">{o.editorial.what_it_is}</p>
      <dl className="signals">
        <div><dt className="part-label">Match</dt><dd><MatchMeter band={pick.match_band} /></dd></div>
        <div><dt className="part-label">Confidence</dt><dd><ConfidenceDots band={pick.confidence_band} /></dd></div>
        <div><dt className="part-label">Do you need it?</dt><dd><span className={`need${pick.do_you_need_it === "needed_now" ? "" : " later"}`}>{NEED_LABEL[pick.do_you_need_it]}</span></dd></div>
      </dl>
      <div className="part">
        <span className="part-label">{awk ? "Why it is here" : "Why we showed it"}</span>
        {evidence && <blockquote className="said">{evidence.quote}</blockquote>}
        <p>{ex.why} {ex.do_you_need_it}</p>
      </div>
      <div className="part">
        <span className="part-label">What it could help with</span>
        <p>{o.editorial.could_help_with}</p>
      </div>
      {(lowConfidence || pick.notes.includes("checked_trust") || ex.skip_if) && (
        <div className="part">
          <span className="part-label">Before you add it</span>
          <ul className="caveats">
            {lowConfidence && <li>This looks relevant, but we don’t have enough evidence to be confident.</li>}
            {pick.notes.includes("checked_trust") && <li>Our checks on this one are automated only so far.</li>}
            {ex.skip_if && <li>{ex.skip_if}</li>}
          </ul>
        </div>
      )}
      <dl className="meta">
        <div><dt className="part-label">Set up in</dt><dd>{clientNames.length ? clientNames.join(", ") : "your AI tool"}</dd></div>
        <div><dt className="part-label">Effort</dt><dd>{o.access.effort_plain}</dd></div>
        <div><dt className="part-label">Access</dt><dd>{o.access.access_plain}</dd></div>
      </dl>

      <form action={sendFeedback} className="feedback">
        <input type="hidden" name="run" value={runId} />
        <input type="hidden" name="rec" value={pick.id} />
        <span className="small muted">Was this useful?</span>
        {/* Each button is described by the card title, so a list of buttons still says which card it is about. */}
        <SubmitButton className="btn quiet small" name="kind" value="useful" aria-describedby={`t-${pick.id}`}>Useful</SubmitButton>
        <SubmitButton className="btn quiet small" name="kind" value="not_useful" aria-describedby={`t-${pick.id}`}>Not useful</SubmitButton>
        <SubmitButton className="btn quiet small" name="kind" value="already_knew" aria-describedby={`t-${pick.id}`}>I knew this already</SubmitButton>
        {props.thanks && <Thanks text="Thanks, noted." />}
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
            {o.access.least_privilege_steps?.map((s) => <p key={s} className="caution">{s}</p>)}
          </div>
          <div className="part">
            <span className="part-label">First thing to try</span>
            <p className="prompt">{o.editorial.first_prompt}</p>
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
            <dt>Reviewed by</dt><dd>{o.editorial.reviewer}, <time dateTime={o.editorial.reviewed_on}>{formatDate(o.editorial.reviewed_on)}</time></dd>
            <dt>Last verified</dt><dd><time dateTime={o.last_verified_on}>{formatDate(o.last_verified_on)}</time></dd>
            <dt>Sources</dt><dd>{[...new Set(facts.map((f) => new URL(f.source_url).hostname))].join(", ")}</dd>
          </dl>
          <div className="part">
            <span className="part-label">Score components</span>
            <p className="small muted">Numbers stay here until calibration shows they mean something. Weights are placeholders.</p>
            <dl className="kv">
              {[
                ...Object.entries(pick.match_components).map(([k, v]) => [`Match · ${k.replace(/_/g, " ")}`, Number(v).toFixed(2)]),
                ...Object.entries(pick.confidence_inputs).map(([k, v]) => [
                  `Confidence · ${k.replace(/_/g, " ")}`,
                  typeof v === "number" ? v.toFixed(2) : typeof v === "boolean" ? (v ? "yes" : "no") : String(v),
                ]),
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
