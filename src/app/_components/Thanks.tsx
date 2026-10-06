"use client";
// Feedback confirmation. The page reloads after feedback, and a status region that is already filled on load is not
// read out, so the message takes focus once it appears: screen readers announce it, and keyboard users stay at the card.
import { useEffect, useRef } from "react";

export function Thanks({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (text) ref.current?.focus();
  }, [text]);
  return (
    <span ref={ref} role="status" tabIndex={-1} className="small thanks">
      {text}
    </span>
  );
}
