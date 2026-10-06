// Small line icons (24px grid, 1.8 stroke). Decorative: always aria-hidden, the text beside them carries the meaning.
const base = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export function PencilIcon() {
  return <svg {...base}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>;
}

export function ArrowLeftIcon() {
  return <svg {...base}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
}

export function ArrowRightIcon() {
  return <svg {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

export function CopyIcon() {
  return <svg {...base}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
}

export function CheckIcon() {
  return <svg {...base}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
