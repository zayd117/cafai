"use client";
// The order list follows the "In my order" boxes on the cards (they belong to form#order).
// Server-rendered with the default ticks, so it still reads right without JavaScript.
import { useEffect, useState } from "react";

// rank: the card's number under "Barista's picks"; the extra idea has none.
type Item = { id: string; name: string; extra: boolean; rank?: number };

export function OrderSummary({ items }: { items: Item[] }) {
  const [ticked, setTicked] = useState(() => new Set(items.filter((i) => !i.extra).map((i) => i.id)));
  useEffect(() => {
    const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[name="pick"][form="order"]')];
    const sync = () => setTicked(new Set(boxes().filter((b) => b.checked).map((b) => b.value)));
    sync(); // the browser may restore ticks on back/forward
    const all = boxes();
    all.forEach((b) => b.addEventListener("change", sync));
    return () => all.forEach((b) => b.removeEventListener("change", sync));
  }, []);
  const chosen = items.filter((i) => ticked.has(i.id));
  const extra = items.find((i) => i.extra && !ticked.has(i.id));
  return (
    <>
      {chosen.length ? (
        <ul className="order-list" aria-live="polite">
          {chosen.map((i) => <li key={i.id}><span className="order-n" aria-hidden="true">{i.rank ?? "+"}</span>{i.name}</li>)}
        </ul>
      ) : (
        <p className="order-empty" aria-live="polite">Nothing ticked yet. Tick at least one pick to set it up.</p>
      )}
      {extra && <p className="small">Extra idea, only if you tick it: {extra.name}</p>}
    </>
  );
}
