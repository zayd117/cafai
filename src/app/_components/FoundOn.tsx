"use client";
// The card's "Found on" line (UX_DECISIONS §11, zay's pick 2026-10-08): a link to the page the facts cite, and a
// Preview button that shows a dated picture of that page we took ourselves. Resting on the link or tabbing to it
// opens the same picture. The picture is served by Caf.ai (public/found-on/), so the other site hears nothing until
// the link is clicked, and it loads only when someone asks for it.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { ArrowUpRightIcon, EyeIcon } from "./icons";
import { formatDate } from "./format";

/** Rest this long on the link before the picture opens, so passing over it or tabbing past opens nothing. */
export const OPEN_DELAY_MS = 400;
/** Grace to move from the link into the picture. */
export const CLOSE_DELAY_MS = 200;
/** Mouse movement smaller than this still counts as resting. */
const REST_PX = 4;
/** Below this height the picture is dropped and the box shows its words only, so it still fits the window. */
const MIN_PICTURE_PX = 48;

/** Only one picture is open at a time across the page. */
let closeOpen: (() => void) | null = null;

/** Pictures are named by the day they were taken, so a run made from an older catalog keeps showing its own. */
export const pictureFor = (offeringId: string, snapshotOn: string, phone = false) =>
  `/found-on/${offeringId}-${snapshotOn}${phone ? "-phone" : ""}.jpg`;

export function FoundOn(props: { offeringId: string; url: string; label: string; snapshotOn?: string; describedBy: string }) {
  const { offeringId, url, label, snapshotOn, describedBy } = props;
  const host = new URL(url).hostname.replace(/^www\./, "");
  const popId = `${useId()}-pop`;
  const [open, setOpen] = useState(false);
  // Opened with the button: stays while focus is in the line, until the button, Esc or a click elsewhere closes it.
  const [pinned, setPinned] = useState(false);
  // The picture element is rendered from the first time someone points at or reaches the link, not on page load.
  const [wanted, setWanted] = useState(false);
  const [above, setAbove] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const restFrom = useRef<{ x: number; y: number } | null>(null);
  // Closed with Esc or a click elsewhere while the mouse is on the link: resting there again does not reopen it
  // until the mouse leaves the link.
  const dismissed = useRef(false);
  const link = () => wrap.current?.querySelector<HTMLAnchorElement>(".found-link") ?? null;

  const close = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    restFrom.current = null;
    setOpen(false);
    setPinned(false);
  }, []);

  const dismiss = useCallback(() => {
    dismissed.current = !!link()?.matches(":hover");
    close();
  }, [close]);

  const show = useCallback((pin: boolean) => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    dismissed.current = false;
    setWanted(true);
    setOpen(true);
    setPinned(pin);
  }, [close]);

  const openSoon = useCallback(() => {
    if (!snapshotOn || open) return;
    setWanted(true);
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => show(false), OPEN_DELAY_MS);
  }, [show, snapshotOn, open]);

  const closeSoon = useCallback(() => {
    clearTimeout(openTimer.current);
    restFrom.current = null;
    // Opened with the button, or the keyboard is still on the link: the mouse leaving does not close it.
    const l = link();
    if (pinned || (l && l === document.activeElement && l.matches(":focus-visible"))) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  }, [close, pinned]);

  useEffect(() => () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    if (closeOpen === close) closeOpen = null;
  }, [close]);

  // Esc closes from anywhere (focus stays where it is); a click or tap outside the line and picture closes too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) dismiss(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, dismiss]);

  // Keep the picture inside the window: open above the line when there is more room there, and shorten the picture
  // when neither side has room for all of it (short windows, zoomed-in pages), down to words only. Set on the element
  // directly (CSSOM and a data attribute React does not manage), which the CSP allows.
  useLayoutEffect(() => {
    if (!open || !wrap.current || !pop.current) return;
    const el = pop.current;
    el.style.removeProperty("--found-pic-max");
    delete el.dataset.fit;
    const line = wrap.current.getBoundingClientRect();
    const below = window.innerHeight - line.bottom - 16;
    const overhead = line.top - 16;
    const h = el.offsetHeight;
    const up = h > below && overhead > below;
    const room = up ? overhead : below;
    const pic = el.querySelector("img")?.offsetHeight ?? 0;
    const fit = pic - (h - room);
    setAbove(up);
    if (h > room && fit < MIN_PICTURE_PX) el.dataset.fit = "words";
    else if (h > room) el.style.setProperty("--found-pic-max", `${fit}px`);
  }, [open]);

  if (!snapshotOn) {
    return (
      <div className="found-on">
        <p className="found-line">
          <span className="found-where">Found on <FoundLink url={url} label={label} host={host} /></span>
        </p>
      </div>
    );
  }

  const taken = formatDate(snapshotOn);
  return (
    <div
      className="found-on"
      ref={wrap}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") clearTimeout(closeTimer.current); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") closeSoon(); }}
      // Focus leaving the line closes the picture, so it never covers the next control. Moving between the link and
      // Preview keeps it; switching windows (no new focus target) keeps it too.
      onBlur={(e) => { const to = e.relatedTarget as Node | null; if (to && !wrap.current?.contains(to)) close(); }}
    >
      <p className="found-line">
        {/* One run of text, so a long link wraps beside "Found on" like a sentence; the button wraps as a whole. */}
        <span className="found-where">Found on <FoundLink
          url={url}
          label={label}
          host={host}
          // Mouse only: a tap opens the page, never the picture.
          onPointerMove={(e) => {
            if (e.pointerType !== "mouse" || open || dismissed.current) return;
            const r = restFrom.current;
            if (!r || Math.hypot(e.clientX - r.x, e.clientY - r.y) > REST_PX) {
              restFrom.current = { x: e.clientX, y: e.clientY };
              openSoon();
            }
          }}
          onPointerLeave={() => { clearTimeout(openTimer.current); restFrom.current = null; dismissed.current = false; }}
          onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) openSoon(); }}
          onBlur={() => clearTimeout(openTimer.current)}
        /></span>
        <button
          type="button"
          className="found-btn"
          aria-expanded={open}
          aria-controls={popId}
          aria-describedby={describedBy}
          onClick={() => (open ? close() : show(true))}
        >
          <EyeIcon />Preview
        </button>
      </p>
      <div className={`found-pop${above ? " above" : ""}`} id={popId} ref={pop} hidden={!open}>
        {wanted && (
          <picture>
            <source media="(max-width: 600px)" srcSet={pictureFor(offeringId, snapshotOn, true)} width={780} height={720} />
            <img src={pictureFor(offeringId, snapshotOn)} width={640} height={400} alt="Picture of the top of the page." />
          </picture>
        )}
        <span className="found-pop-text">
          <span className="found-pop-host">{host}</span>
          <strong>{label}</strong>
          <span className="found-pop-meta">Snapshot from <time dateTime={snapshotOn}>{taken}</time></span>
        </span>
      </div>
    </div>
  );
}

function FoundLink(props: { url: string; label: string; host: string } & Pick<ComponentProps<"a">, "onPointerMove" | "onPointerLeave" | "onFocus" | "onBlur">) {
  const { url, label, host, ...on } = props;
  // Named in full so screen readers say "Shopify’s help page help.shopify.com, opens in a new tab". A hidden span
  // for the last part gets a stray space read before its comma (it is positioned, so browsers treat it as a block).
  return (
    <a className="found-link" href={url} target="_blank" rel="noopener noreferrer" aria-label={`${label} ${host}, opens in a new tab`} {...on}>
      <span className="found-label">{label}</span>{" "}
      <span className="found-host">· {host}</span>
      <ArrowUpRightIcon />
    </a>
  );
}
