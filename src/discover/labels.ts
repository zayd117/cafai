// Labelling sheet for the discovery bake-off (docs/DISCOVER_BAKEOFF.md): every listing a case's queries retrieve, one row each, in
// slug order so the reader cannot tell which arm ranked what. A person fills `label`; import writes the slugs into the case files.
import type { DiscoverCase } from "./bakeoff";
import type { Listing } from "./types";

export const SHEET_COLUMNS = ["case_id", "need", "slug", "title", "description", "url", "label", "note"] as const;
/** Blank leaves the case as it is; unsure takes the slug out of both lists. */
export const SHEET_LABELS = ["relevant", "irrelevant", "unsure"] as const;
export type SheetLabel = (typeof SHEET_LABELS)[number];

const SLUG = /^[A-Za-z0-9._-]+$/;

/** Third-party or personal text: stop a spreadsheet reading it as a formula. */
const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF, and the BOM Excel adds. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += ch;
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Header plus one row per (case, listing), cases in file order, listings by slug. Labels already in the case files are filled in. */
export function sheetCsv(cases: { c: DiscoverCase; listings: Listing[] }[]): string {
  const rows: string[][] = [[...SHEET_COLUMNS]];
  for (const { c, listings } of cases) {
    for (const l of [...listings].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))) {
      const label = c.relevant?.includes(l.slug) ? "relevant" : c.irrelevant?.includes(l.slug) ? "irrelevant" : "";
      rows.push([c.id, safe(c.text), l.slug, safe(l.title ?? l.name), safe(l.description), l.url, label, ""]);
    }
  }
  return toCsv(rows);
}

export interface LabelResult {
  /** New relevant / irrelevant lists for each case that changed. */
  changes: Map<string, { relevant: string[]; irrelevant: string[] }>;
  errors: string[];
  counts: { relevant: number; irrelevant: number; unsure: number; blank: number };
}

/** Reads a filled sheet. Any bad row is an error and nothing is applied: a typo never silently becomes "not labelled". */
export function readLabels(csv: string, cases: DiscoverCase[]): LabelResult {
  const errors: string[] = [];
  const counts = { relevant: 0, irrelevant: 0, unsure: 0, blank: 0 };
  const changes: LabelResult["changes"] = new Map();
  const rows = parseCsv(csv);
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries((["case_id", "slug", "label"] as const).map((k) => [k, head.indexOf(k)]));
  const missing = Object.entries(col).filter(([, i]) => i < 0).map(([k]) => k);
  if (missing.length) return { changes, errors: [`header is missing column(s): ${missing.join(", ")}`], counts };

  const byId = new Map(cases.map((c) => [c.id, c]));
  const seen = new Map<string, string>();
  rows.forEach((r, n) => {
    const line = n + 2;
    const id = (r[col.case_id!] ?? "").trim();
    const slug = (r[col.slug!] ?? "").trim();
    const raw = (r[col.label!] ?? "").trim().toLowerCase();
    if (!raw) { counts.blank++; return; }
    if (!byId.has(id)) return void errors.push(`line ${line}: unknown case "${id}"`);
    if (!SLUG.test(slug)) return void errors.push(`line ${line}: bad slug "${slug}"`);
    if (!(SHEET_LABELS as readonly string[]).includes(raw)) return void errors.push(`line ${line}: label "${raw}" is not one of ${SHEET_LABELS.join(", ")} (or blank)`);
    const key = `${id}\u0000${slug}`;
    if (seen.has(key) && seen.get(key) !== raw) return void errors.push(`line ${line}: ${id}/${slug} is labelled both ${seen.get(key)} and ${raw}`);
    seen.set(key, raw);
    counts[raw as SheetLabel]++;
    const c = byId.get(id)!;
    const cur = changes.get(id) ?? { relevant: [...(c.relevant ?? [])], irrelevant: [...(c.irrelevant ?? [])] };
    cur.relevant = cur.relevant.filter((s) => s !== slug);
    cur.irrelevant = cur.irrelevant.filter((s) => s !== slug);
    if (raw === "relevant") cur.relevant.push(slug);
    if (raw === "irrelevant") cur.irrelevant.push(slug);
    changes.set(id, cur);
  });
  if (errors.length) changes.clear();
  for (const v of changes.values()) { v.relevant.sort(); v.irrelevant.sort(); }
  return { changes, errors, counts };
}

/** Case-file layout used in eval/discover/cases: keys one per line, arrays of words inline, arrays of objects one object per line. */
export function formatCase(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  const inline = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(inline).join(", ")}]`
    : v && typeof v === "object" ? `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ")} }`
    : JSON.stringify(v);
  if (Array.isArray(value)) {
    if (!value.length || value.every((x) => x === null || typeof x !== "object")) return inline(value);
    return `[\n${value.map((x) => `${pad}  ${inline(x)}`).join(",\n")}\n${pad}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return `{\n${entries.map(([k, x]) => `${pad}  ${JSON.stringify(k)}: ${formatCase(x, indent + 2)}`).join(",\n")}\n${pad}}`;
  }
  return JSON.stringify(value);
}
