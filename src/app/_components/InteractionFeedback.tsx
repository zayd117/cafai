"use client";
import { useEffect } from "react";

/** Optional tactile feedback at the interaction boundary; never changes a control's behavior or markup. */
export function InteractionFeedback() {
  useEffect(() => {
    if (typeof navigator.vibrate !== "function") return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const pulse = () => { if (!motion.matches) navigator.vibrate(8); };
    const press = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("button:not(:disabled), summary")) pulse();
    };
    const select = (event: Event) => {
      if (event.target instanceof HTMLInputElement && ["checkbox", "radio"].includes(event.target.type)) pulse();
    };
    document.addEventListener("click", press);
    document.addEventListener("change", select);
    return () => {
      document.removeEventListener("click", press);
      document.removeEventListener("change", select);
    };
  }, []);
  return null;
}
