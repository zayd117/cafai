"use client";
// Copies text on click. Falls back to selecting the text when the clipboard is refused.
import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

/** `text`, when given, is what gets copied (the server-built string, safe from in-page translation); otherwise the target's text. */
export function CopyButton({ targetId, text: source, label = "Copy message", className = "btn primary", describedBy }: { targetId: string; text?: string; label?: string; className?: string; describedBy?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "select">("idle");
  const [shortcut, setShortcut] = useState("Ctrl+C");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (s: "copied" | "select") => {
    setState(s);
    clearTimeout(timer.current);
    // Back to the normal label so a second copy gives feedback again.
    timer.current = setTimeout(() => setState("idle"), s === "copied" ? 2000 : 6000);
  };
  const text = state === "copied" ? "Copied" : state === "select" ? `Selected: press ${shortcut}` : label;
  return (
    <>
      <button
        type="button"
        className={className}
        aria-describedby={describedBy}
        onClick={async () => {
          const el = document.getElementById(targetId);
          if (!el) return;
          try {
            await navigator.clipboard.writeText(source ?? el.textContent ?? "");
            show("copied");
          } catch {
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            setShortcut(/Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘ C" : "Ctrl+C");
            show("select");
          }
        }}
      >
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
        {text}
      </button>
      {/* Announce the result; the button's own label change is not read out reliably. */}
      <span className="sr-only" role="status">{state === "idle" ? "" : text}</span>
    </>
  );
}
