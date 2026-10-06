"use client";
// The order list follows the "In my order" boxes on the cards (they belong to form#order).
// Server-rendered with the default ticks, so it still reads right without JavaScript.
import { useEffect, useState } from "react";

// rank: the card's number under "Barista's picks"; the extra idea has none.
type Item = { id: string; name: string; extra: boolean; rank?: number };

// Ticks survive the reload after card feedback (per tab, per order). Storage can be blocked: then the defaults stay.
const KEY = (runId: string) => `cafai:order:${runId}`;
function load(runId: string): string[] | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY(runId)) ?? "null");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}
function save(runId: string, ids: string[]) {
  try {
    sessionStorage.setItem(KEY(runId), JSON.stringify(ids));
  } catch {
    /* storage blocked: nothing to remember */
  }
}

export function OrderSummary({ runId, items }: { runId: string; items: Item[] }) {
  const [ticked, setTicked] = useState(() => new Set(items.filter((i) => !i.extra).map((i) => i.id)));
  useEffect(() => {
    const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[name="pick"][form="order"]')];
    const read = () => boxes().filter((b) => b.checked).map((b) => b.value);
    const saved = load(runId);
    if (saved) boxes().forEach((b) => (b.checked = saved.includes(b.value)));
    setTicked(new Set(read())); // also picks up ticks the browser restored on back/forward
    const sync = () => {
      const ids = read();
      setTicked(new Set(ids));
      save(runId, ids);
    };
    const all = boxes();
    all.forEach((b) => b.addEventListener("change", sync));
    return () => all.forEach((b) => b.removeEventListener("change", sync));
  }, [runId]);
  const chosen = items.filter((i) => ticked.has(i.id));
  const extra = items.find((i) => i.extra && !ticked.has(i.id));
  return (
    <>
      {/* One live region that stays mounted, so emptying and refilling the list are both announced. */}
      <div aria-live="polite" className="order-live">
        {chosen.length ? (
          <ul className="order-list">
            {chosen.map((i) => <li key={i.id}><span className="order-n" aria-hidden="true">{i.rank ?? "+"}</span>{i.name}</li>)}
          </ul>
        ) : (
          <p className="order-empty">Nothing ticked yet. Tick at least one pick to set it up.</p>
        )}
      </div>
      {extra && <p className="small">Extra idea, only if you tick it: {extra.name}</p>}
    </>
  );
}
