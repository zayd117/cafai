"use client";
// The read-back as tags (plan §9: read-back edits are ground truth). Each understood item shows as a short tag under a
// plain group name. Tapping a tag highlights the words it came from and offers other tags to swap in; × removes it.
// A sentence typed into the box joins what they said, and the next run turns it into new tags.
// Without JavaScript the tags still show, × still removes (it posts the form) and the box still adds.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { rerun } from "../actions";
import { TAG_GROUP, TAG_GROUP_ORDER } from "./labels";
import { PencilIcon } from "./icons";
import { SubmitButton } from "./SubmitButton";

export interface ReadBackTag {
  id: string;
  kind: string;
  text: string;
  tag: string;
  /** The words it came from. Once the person changes the tag this is cleared (an edit quotes itself). */
  quote: string;
  suggestions: string[];
  isNew: boolean;
}

interface Props {
  runId: string;
  /** What they said; null once it expired (tags show, nothing can change). */
  said: string | null;
  items: ReadBackTag[];
  question: { text: string; options: string[] } | null;
  asking: boolean;
  confirming: boolean;
  hasPicks: boolean;
  open: boolean;
}

const MINI = 4;

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Where `quote` sits in `said`, matched the way the engine checks quotes (any case, any spacing, either apostrophe). */
function findQuote(said: string, quote: string): [number, number] | null {
  const q = quote.trim();
  if (!q) return null;
  const pattern = q
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/['‘’]/g, "['‘’]").replace(/["“”]/g, "[\"“”]"))
    .join("\\s+");
  const m = new RegExp(pattern, "i").exec(said);
  return m ? [m.index, m.index + m[0].length] : null;
}

export function ReadBackTags(props: Props) {
  const { runId, said, question: q } = props;
  const [tags, setTags] = useState(props.items);
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<{ tag: ReadBackTag; index: number; edited: boolean }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  // × posts the form until the page's script runs; after that it removes in place and waits for "Update my picks".
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);

  const current = tags.find((t) => t.id === active) ?? null;
  const span = current && said ? findQuote(said, current.quote) : null;
  const changes = edited.size + removed.length;

  const groups = useMemo(
    () => TAG_GROUP_ORDER.map((g) => ({ ...g, tags: tags.filter((t) => (TAG_GROUP[t.kind] ?? "know") === g.id) })).filter((g) => g.tags.length),
    [tags],
  );

  function pick(id: string) {
    setActive((a) => (a === id ? null : id));
    setOwn("");
  }
  function remove(t: ReadBackTag) {
    setRemoved((r) => [...r, { tag: t, index: tags.indexOf(t), edited: edited.has(t.id) }]);
    setTags((all) => all.filter((x) => x.id !== t.id));
    setEdited((e) => { const n = new Set(e); n.delete(t.id); return n; });
    if (active === t.id) setActive(null);
  }
  function undo() {
    const last = removed[removed.length - 1];
    if (!last) return;
    setRemoved((r) => r.slice(0, -1));
    setTags((all) => [...all.slice(0, last.index), last.tag, ...all.slice(last.index)]);
    if (last.edited) setEdited((e) => new Set(e).add(last.tag.id));
  }
  function swap(id: string, value: string) {
    const v = value.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!v) return;
    setTags((all) => all.map((t) => (t.id === id && t.tag !== v ? { ...t, tag: v, text: v, quote: "", suggestions: [t.tag, ...t.suggestions.filter((s) => s !== v)].slice(0, 3) } : t)));
    if (tags.find((t) => t.id === id)?.tag !== v) setEdited((e) => new Set(e).add(id));
    setActive(null);
    setOwn("");
  }

  const mini = (
    <span className="tag-mini">
      {tags.slice(0, MINI).map((t) => <span key={t.id}>{t.tag}</span>)}
      {tags.length > MINI && <span className="more">+{tags.length - MINI} more</span>}
      {tags.length === 0 && <span className="none">Nothing yet</span>}
    </span>
  );

  let saidView: ReactNode = said;
  if (said && span) {
    saidView = <>{said.slice(0, span[0])}<mark>{said.slice(span[0], span[1])}</mark>{said.slice(span[1])}</>;
  }

  return (
    <details className="readback" open={props.open}>
      <summary>
        <span className="readback-text">
          <span className="readback-label">We understood<span className="sr-only">:</span></span>
          {mini}
        </span>
        <span className="readback-edit">
          <span className="if-closed">{said === null ? "Show" : <><PencilIcon />Change this</>}</span>
          <span className="if-open">Hide</span>
        </span>
      </summary>
      {said === null ? (
        <div className="readback-form">
          <ul className="have">{tags.map((t) => <li key={t.id}>{t.tag}</li>)}</ul>
          <p className="small muted">Your original wording for this order has expired, so it can’t be changed. <a href="/">Start a new order</a> instead.</p>
        </div>
      ) : (
        <form action={rerun} className="readback-form" id="readback-form">
          <input type="hidden" name="run" value={runId} />
          <input type="hidden" name="readback" value="1" />
          {/* Enter in a text box presses the form's first submit button: make that "Add", never a tag's ×. */}
          <button type="submit" name="update" value="add" className="sr-only" tabIndex={-1} aria-hidden="true">Add</button>
          <div className="part">
            <span className="part-label">You said</span>
            <blockquote className="said" aria-live="polite">{saidView}</blockquote>
          </div>

          <div className="tag-section">
            <div className="tag-lead">
              <p className="legend" id="tags-title">Here’s what we picked up</p>
              <p className="small muted" id="tags-help">These shape your picks. Tap a tag to see where it came from or change it. × removes it.</p>
            </div>
            {groups.length > 0 ? (
              <div className="tag-groups">
                {groups.map((g) => (
                  <div className="tag-group" key={g.id}>
                    <span className="tag-group-name" id={`tg-${g.id}`}>{g.label}</span>
                    <ul className="tags" aria-labelledby={`tg-${g.id}`}>
                      {g.tags.map((t) => (
                        <li key={t.id} className={`tag${t.isNew ? " new" : ""}${edited.has(t.id) ? " edited" : ""}${active === t.id ? " active" : ""}`}>
                          <button type="button" className="tag-t" aria-expanded={active === t.id} aria-controls="tag-editor" onClick={() => pick(t.id)}>
                            {t.tag}
                            {t.isNew && <span className="sr-only"> (new)</span>}
                          </button>
                          <button type={live ? "button" : "submit"} name="remove" value={t.id} className="tag-x" aria-label={`Remove ${t.tag}`}
                            onClick={(e) => { if (live) { e.preventDefault(); remove(t); } }}>
                            <XIcon />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="small muted">No tags yet. Add a sentence below and we’ll pick some out.</p>
            )}

            {current && (
              <div className="tag-editor" id="tag-editor" role="group" aria-label={`Change ${current.tag}`}>
                <p className="small muted">
                  {span ? "This tag comes from the highlighted words above." : "You added or changed this one."}
                </p>
                {current.suggestions.length > 0 && (
                  <div className="tag-suggest">
                    <span className="small">Swap it for</span>
                    {current.suggestions.map((s) => (
                      <button type="button" className="tag-pill" key={s} onClick={() => swap(current.id, s)}>{s}</button>
                    ))}
                  </div>
                )}
                <div className="tag-own">
                  <label htmlFor="tag-own" className="small">{current.suggestions.length ? "Or say it your way" : "Say it your way"}</label>
                  <div className="tag-own-row">
                    <input id="tag-own" className="input" value={own} maxLength={40} autoComplete="off" placeholder={current.tag}
                      onChange={(e) => setOwn(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); swap(current.id, own); }
                        if (e.key === "Escape") { e.preventDefault(); setActive(null); }
                      }} />
                    <button type="button" className="btn quiet small" onClick={() => swap(current.id, own)} disabled={!own.trim()}>Save</button>
                    <button type="button" className="btn quiet small" onClick={() => setActive(null)}>Close</button>
                  </div>
                </div>
              </div>
            )}

            {removed.length > 0 && (
              <p className="tag-undo small" role="status">
                Removed “{removed[removed.length - 1]!.tag.tag}”.{" "}
                <button type="button" className="link-btn" onClick={undo}>Undo</button>
              </p>
            )}
          </div>

          {tags.map((t) => (
            <span key={t.id} hidden>
              <input type="hidden" name="item_id" value={t.id} />
              <input type="hidden" name="item_kind" value={t.kind} />
              <input type="hidden" name="item_text" value={t.text} />
              <input type="hidden" name="item_tag" value={t.tag} />
              <input type="hidden" name="item_quote" value={t.quote} />
              <input type="hidden" name="item_suggestions" value={JSON.stringify(t.suggestions)} />
            </span>
          ))}

          {q && (
            <fieldset className={`chips${props.asking ? " ask" : ""}`}>
              <legend className="legend">{props.asking ? q.text : `One quick question (only if it changes a pick): ${q.text}`}</legend>
              {q.options.map((o) => (
                <label key={o} className="chip"><input type="radio" name="answer" value={o} /><span>{o}</span></label>
              ))}
            </fieldset>
          )}

          <div className="field">
            <label htmlFor="add_item">Add something we missed</label>
            <div className="add-row">
              <input id="add_item" name="add_item" className="input" maxLength={300} autoComplete="off"
                placeholder="Say it your way, like “people should sign in with Google”" />
              <SubmitButton className="btn" name="update" value="add" pendingText="Adding…">Add</SubmitButton>
            </div>
            <span className="small muted">We turn it into tags for you. No need to know the right words.</span>
          </div>

          <div className="form-actions">
            <span className="small muted" aria-live="polite">
              {changes ? `${changes} change${changes > 1 ? "s" : ""}. ${props.hasPicks ? "Your picks will be redone." : "We look again with your changes."}`
                : props.hasPicks ? "Editing redoes the picks." : "We look again with your changes."}
            </span>
            <span className="form-buttons">
              <SubmitButton className={`btn${props.asking || changes ? " primary" : ""}`} name="update" value="1" pendingText="Updating…">Update my picks</SubmitButton>
              {props.confirming && (
                <SubmitButton className="btn primary" name="confirm" value="1" pendingText="Checking…">Yes, that’s right</SubmitButton>
              )}
            </span>
          </div>
        </form>
      )}
    </details>
  );
}
