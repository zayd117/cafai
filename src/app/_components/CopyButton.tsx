"use client";
// Copies text on click. Falls back to selecting the text when the clipboard is refused.
import { useState } from "react";

export function CopyButton({ targetId, label = "Copy message" }: { targetId: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "select">("idle");
  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        const el = document.getElementById(targetId);
        if (!el) return;
        try {
          await navigator.clipboard.writeText(el.textContent ?? "");
          setState("copied");
        } catch {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          setState("select");
        }
      }}
    >
      {state === "copied" ? "Copied" : state === "select" ? "Selected: press Ctrl+C" : label}
    </button>
  );
}
