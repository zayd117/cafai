"use client";
// A submit button that shows the form is working. Redoing the picks runs the whole pipeline, which can take
// several seconds with a model connected; without this the page looks frozen and repeat clicks make extra runs.
import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * Every submit button of the form is disabled while it works. pendingText replaces the label only on the button that
 * was pressed: a named button is "pressed" when the submitted data carries its name and value.
 */
export function SubmitButton({ pendingText, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending, data } = useFormStatus();
  const pressed = pending && (!rest.name || data?.get(String(rest.name)) === String(rest.value ?? ""));
  return (
    <button {...rest} type="submit" disabled={pending} aria-busy={pressed || undefined}>
      {pressed && pendingText ? pendingText : children}
    </button>
  );
}
