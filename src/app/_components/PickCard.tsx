// The pick card (plan §8 Card anatomy), redesigned 2026-10-07 from a mockup zay approved: a decision pill, a facts
// line, one sentence on what it does and four short lines, then "How to set it up" and "More details". Match and
// Confidence moved into More details (REGISTER A-042). Level 1 never shows MCP, stdio, OAuth, API or SDK; catalog facts
// (names, access, setup) render from the run's catalog snapshot, never from model text (§9).
import { Fragment } from "react";
import type { CatalogSnapshot, Fact } from "@/catalog/types";
import type { StoredPick } from "@/server/runService";
import type { ProfileItem } from "@/engine/types";
import { sendFeedback } from "../actions";
import { tagOf } from "@/engine/tags";
import { accessShort, costLabel, effortShort, forClient, pickState, skipLine, startsInOrder, vendorShort, whenLine } from "./cardCopy";
import { CopyButton } from "./CopyButton";
import { formatDate } from "./format";
import { AlertIcon, CheckIcon, ChevronDownIcon, ClockIcon, EyeIcon, SkipIcon, TargetIcon, ThumbDownIcon, ThumbUpIcon } from "./icons";
import { SubmitButton } from "./SubmitButton";
import { Thanks } from "./Thanks";
import { CONFIDENCE_DOTS, CONFIDENCE_LABEL, EVIDENCE_LABEL, KIND_LABEL, MATCH_LABEL, MATCH_SEGMENTS, PILL_LABEL, TRUST_LABEL } from "./labels";

/** Catalog text with exactly one closing full stop, whether or not the entry ends with one. */
const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

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

const PILL_ICON = { now: <CheckIcon />, later: <ClockIcon />, maybe: <AlertIcon /> };

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
  // The read-back tags this pick rests on, so removing a tag visibly changes something.
  const pickedFor = readback.filter((i) => pick.evidence_ids.includes(i.id) || ex.evidence_ids.includes(i.id));
  const awk = pick.lane === "also_worth_knowing";
  const facts = [...o.resource_profile.provides, ...o.resource_profile.requires, ...o.resource_profile.limits];
  const state = pickState(pick);
  const H = props.headingLevel === 2 ? "h2" : "h3";
  const titleId = `t-${pick.id}`;
  const ai = clientNames.length === 1 ? clientNames[0]! : "your AI tool";
  const say = (s: string) => forClient(s, clientNames);
  const when = ex.do_you_need_it ? whenLine(ex.do_you_need_it) : "";
  const skip = ex.skip_if ? skipLine(ex.skip_if) : "";
  const headsUp = [
    pick.confidence_band === "low" && "We’re not sure this fits. Check “Why it fits” first.",
    pick.notes.includes("checked_trust") && "Our checks on this one are automated only so far.",
  ].filter((s): s is string => !!s);

  if (props.revoked) {
    return (
      <article className="card" id={`pick-${pick.id}`} aria-labelledby={titleId}>
        <H id={titleId}>{o.identity.display_name}</H>
        {/* Revoked notice copy is not in the plan (board 5 [COPY TBC]); placeholder, REGISTER A-030. */}
        <p className="danger">We no longer recommend this, so its setup is hidden. If you added it, remove it where you added it.</p>
      </article>
    );
  }

  // The heads-up never folds away: on an Add later card it sits above "Show why", so it is seen before ticking.
  const warn = headsUp.length > 0 && (
    <div className="warn"><dt><AlertIcon />Heads up</dt><dd>{headsUp.join(" ")}</dd></div>
  );
  const lines = (
    <dl className="lines">
      {state !== "later" && warn}
      <div>
        <dt><TargetIcon />Why it fits</dt>
        <dd>
          {say(ex.why)}
          {pickedFor.length > 0 && (
            <>
              {" "}
              <ul className="picked-for" aria-label="Picked for">{pickedFor.map((i) => <li key={i.id}>{tagOf(i)}</li>)}</ul>
            </>
          )}
        </dd>
      </div>
      {when && <div><dt><ClockIcon />When</dt><dd>{say(when)}</dd></div>}
      {skip && <div><dt><SkipIcon />Skip if</dt><dd>{say(skip)}</dd></div>}
      <div><dt><EyeIcon />It can see</dt><dd>{say(accessShort(o))}</dd></div>
    </dl>
  );

  const footer = (
    <div className="card-foot">
      {/* Level 2a: setup in three steps, with the first thing to ask ready to copy. */}
      <details className="card-more">
        <summary>How to set it up<ChevronDownIcon /></summary>
        <div className="card-more-body">
          <ol className="setup-steps">
            {o.access.first_step && <li>{say(o.access.first_step)}</li>}
            <li>Put it in your order, then press “Set up in {ai}”. You get one message to paste.</li>
            <li>
              <span>Then ask {ai}:</span>
              <p className="prompt" id={`fp-${pick.id}`}>{o.editorial.first_prompt}</p>
              <CopyButton targetId={`fp-${pick.id}`} text={o.editorial.first_prompt} label="Copy" className="btn quiet small fit" describedBy={titleId} />
            </li>
          </ol>
        </div>
      </details>

      {/* Level 2b: fit, the longer wording, evidence and alternatives; level 3 sits inside. */}
      <details className="card-more">
        <summary>More details<ChevronDownIcon /></summary>
        <div className="card-more-body">
          <dl className="kv">
            <dt>How well it fits</dt>
            <dd className="fit-signals"><MatchMeter band={pick.match_band} /><ConfidenceDots band={pick.confidence_band} /></dd>
            {ex.how_it_helps && <><dt>How it helps</dt><dd>{say(ex.how_it_helps)}</dd></>}
            {o.editorial.could_help_with !== ex.how_it_helps && <><dt>For example</dt><dd>{say(o.editorial.could_help_with)}</dd></>}
            <dt>Cost</dt><dd>{sentence(o.cost.plan_required ?? costLabel(o))}</dd>
            <dt>Time</dt><dd>{say(o.access.effort_plain)}</dd>
            <dt>Access in full</dt>
            <dd className="access-full">
              <p>{say(sentence(o.access.access_plain))}</p>
              {o.access.credential_needed && <p>You will need: {sentence(o.access.credential_needed)}</p>}
              <p>Never paste keys into Caf.ai.</p>
              {o.access.least_privilege_steps?.map((s) => <p key={s} className="caution">{s}</p>)}
            </dd>
          </dl>
          <div className="part">
            <span className="part-label">Evidence</span>
            <ul className="evidence">{facts.map((f, i) => <FactLine key={i} f={f} />)}</ul>
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
                      <br />{say(alt.editorial.what_it_is)}{" "}
                      <span className="small">{MATCH_LABEL[a.match_band]} · {CONFIDENCE_LABEL[a.confidence_band]}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </details>
          )}

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
                <dt>Maker</dt><dd>{o.identity.vendor}</dd>
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
        </div>
      </details>

      <form action={sendFeedback} className="feedback">
        <input type="hidden" name="run" value={runId} />
        <input type="hidden" name="rec" value={pick.id} />
        <span className="small muted">Useful?</span>
        {/* Each button is described by the card title, so a list of buttons still says which card it is about. */}
        <SubmitButton className="thumb" name="kind" value="useful" aria-label="Useful" aria-describedby={titleId}><ThumbUpIcon /></SubmitButton>
        <SubmitButton className="thumb" name="kind" value="not_useful" aria-label="Not useful" aria-describedby={titleId}><ThumbDownIcon /></SubmitButton>
        <SubmitButton className="thumb text" name="kind" value="already_knew" aria-describedby={titleId}>Knew it</SubmitButton>
        {props.thanks && <Thanks text="Thanks, noted." />}
      </form>
    </div>
  );

  return (
    <article className={`card pick ${state}${awk ? " awk" : ""}`} id={`pick-${pick.id}`} aria-labelledby={titleId}>
      {/* Level 1: decision, facts, what it is, then the short lines (folded for "Add later"). */}
      <div className="card-head">
        <div className="card-title">
          <span className={`pill ${state}`}>{PILL_ICON[state]}{PILL_LABEL[state]}</span>
          <H id={titleId}>
            {props.rank !== undefined && <span className="rank" aria-hidden="true">{props.rank}</span>}
            {o.identity.display_name}
          </H>
          <p className="facts">{[vendorShort(o), costLabel(o), effortShort(o)].filter(Boolean).map((f) => <span key={f}>{f}</span>)}</p>
        </div>
        {/* The label follows the box: "In my order" when ticked, "Add to my order" when not. Only "Add now" starts ticked. */}
        <label className="chip order-toggle">
          <input type="checkbox" name="pick" value={o.id} form="order" defaultChecked={startsInOrder(pick)} />
          <span><span className="if-on">In my order</span><span className="if-off">Add to my order</span><span className="sr-only">: {o.identity.display_name}</span></span>
        </label>
      </div>
      <p className="card-lead">{say(o.editorial.what_it_is)}</p>
      {state === "later" ? (
        <>
          {warn && <dl className="lines">{warn}</dl>}
          {/* Opened again after feedback, so the thanks it holds is seen and announced. */}
          <details className="why-fold" open={props.thanks || undefined}>
            <summary><span className="if-closed">Show why</span><span className="if-open">Hide why</span><ChevronDownIcon /></summary>
            <div className="why-body">{lines}{footer}</div>
          </details>
        </>
      ) : (
        <>{lines}{footer}</>
      )}
    </article>
  );
}
