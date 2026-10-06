"use client";
import { useEffect, useRef, useState, type TextareaHTMLAttributes } from "react";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder"> & { hints: readonly string[] };

/** Project textarea whose placeholder cycles through example descriptions while it is empty and unfocused.
 *  Server-rendered with the first hint, so it works without JS; stays still under prefers-reduced-motion. */
export function ProjectInput({ hints, ...rest }: Props) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (hints.length < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      const el = ref.current;
      if (el && !el.value && document.activeElement !== el) setI((n) => (n + 1) % hints.length);
    }, 4000);
    return () => clearInterval(t);
  }, [hints.length]);
  return <textarea ref={ref} placeholder={`e.g. ${hints[i]}`} {...rest} />;
}
