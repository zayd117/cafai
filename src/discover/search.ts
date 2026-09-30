// mcp.market public JSON search (docs: mcp.market/docs/gateway, "Machine-readable": /api/search?q=, CORS open).
// Listing text is third-party: strip control characters, cap lengths, and keep only fields we use.
import type { Listing } from "./types";

export const MCP_MARKET_API = "https://mcp.market/api/search";
const MAX_DESCRIPTION = 300;
const MAX_NAME = 120;

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Validates one raw result; returns null for anything that lacks a usable slug and description. */
export function toListing(raw: unknown): Listing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slug = clean(r.slug, 120);
  const description = clean(r.description, MAX_DESCRIPTION);
  if (!/^[A-Za-z0-9._-]+$/.test(slug) || !description) return null;
  const score = typeof r.gradeScore === "number" && Number.isFinite(r.gradeScore) ? r.gradeScore : null;
  const price = typeof r.defaultPriceMicros === "number" && Number.isFinite(r.defaultPriceMicros) ? r.defaultPriceMicros : 0;
  return {
    slug,
    name: clean(r.name, MAX_NAME) || slug,
    title: clean(r.title, MAX_NAME) || null,
    description,
    grade: /^[A-F]$/.test(String(r.grade)) ? String(r.grade) : null,
    grade_score: score,
    certified: r.certified === true,
    category: clean(r.category, 40) || null,
    price_micros: price,
    // Built from the slug, never from the response, so a listing cannot point the reader somewhere else.
    url: `https://mcp.market/server/${slug}`,
  };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function searchMarket(query: string, opts: { limit?: number; fetch?: FetchLike; timeoutMs?: number } = {}): Promise<Listing[]> {
  const f = opts.fetch ?? fetch;
  const url = `${MCP_MARKET_API}?q=${encodeURIComponent(query)}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await f(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000) });
      if (!res.ok) throw new Error(`mcp.market search ${res.status}`);
      const body = (await res.json()) as { results?: unknown };
      if (!Array.isArray(body.results)) throw new Error("mcp.market search: no results array");
      return body.results.flatMap((r) => toListing(r) ?? []).slice(0, opts.limit ?? 8);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
