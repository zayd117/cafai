// Display formats (Vercel web interface guidelines: dates through Intl, never hand-built strings).
const DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** "2026-09-29" -> "Sep 29, 2026". Falls back to the input when it is not a date. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : DATE.format(d);
}
