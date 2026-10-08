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

export function ArrowUpRightIcon() {
  return <svg {...base}><path d="M7 17 17 7M8 7h9v9" /></svg>;
}

export function CopyIcon() {
  return <svg {...base}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
}

export function CheckIcon() {
  return <svg {...base}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

export function PlusIcon() {
  return <svg {...base}><path d="M12 5v14M5 12h14" /></svg>;
}

export function ChevronDownIcon() {
  return <svg {...base}><path d="m6 9 6 6 6-6" /></svg>;
}

/** Card line icons: why it fits, when, skip if, it can see, heads up. */
export function TargetIcon() {
  return <svg {...base}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></svg>;
}

export function ClockIcon() {
  return <svg {...base}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

export function SkipIcon() {
  return <svg {...base}><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></svg>;
}

export function EyeIcon() {
  return <svg {...base}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export function AlertIcon() {
  return <svg {...base}><path d="M12 3 22 21H2L12 3Z" /><path d="M12 10v5M12 18v.01" /></svg>;
}

export function ThumbUpIcon() {
  return <svg {...base}><path d="M7 11v9H4v-9h3ZM7 11l4-8c1.7 0 3 1.3 3 3v3h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" /></svg>;
}

export function ThumbDownIcon() {
  return <svg {...base}><path d="M17 13V4h3v9h-3ZM17 13l-4 8c-1.7 0-3-1.3-3-3v-3H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 4H17" /></svg>;
}
