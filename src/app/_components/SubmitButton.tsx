"use client";
// A submit button that shows the form is working. Redoing the picks runs the whole pipeline, which can take
// several seconds with a model connected; without this the page looks frozen and repeat clicks make extra runs.
import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/** Without pendingText the label stays put (useful when a form has several buttons) and only the busy state shows. */
export function SubmitButton({ pendingText, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending} aria-busy={pending || undefined}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
