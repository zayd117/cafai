// Stage 12 (plan §9): plain-language explanation from structured inputs only, validated by code, with a template
// fallback built from catalog facts. Level-1 wording never uses MCP, stdio, OAuth, API or SDK (§8).
import type { CatalogSnapshot } from "@/catalog/types";
import { ENGINE_CONFIG as C } from "./config";
import type { Placed } from "./assemble";
import type { LlmProvider, Usage } from "./providers/types";
import { validateExplanation } from "./schemas";
import type { Explanation, ProfileItem } from "./types";

const FIELDS = ["why", "how_it_helps", "do_you_need_it", "skip_if", "summary"] as const;
const RULES: { name: string; re: RegExp }[] = [
  { name: "url", re: /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|io|dev|ai|org|net|app|sh)\b/i },
  { name: "command", re: /`|\$\s|(^|\s)(npx|npm|pnpm|yarn|pip|brew|curl|wget|sudo|git clone|claude mcp|claude plugin)\b|(^|\s)--?[a-z][a-z-]*\b/i },
  { name: "price", re: /[$€£]\s?\d|\b\d+(\.\d+)?\s?(usd|dollars?|euros?)\b|\bper (month|year|seat)\b|\/mo\b/i },
  { name: "safety_claim", re: /\b(safe|safely|safest|secure|guarantee[ds]?|best|trusted|risk-free)\b/i },
  { name: "jargon", re: /\b(MCP|stdio|OAuth|APIs?|SDKs?|JSON|CLI)\b/ },
];

export function checkExplanation(e: Explanation, pick: Placed, knownOfferingIds: Set<string>, itemIds: Set<string>): string[] {
  const problems: string[] = [];
  if (e.offering_id !== pick.offering_id) problems.push("offering_mismatch");
  if (!e.evidence_ids.some((id) => pick.evidence_ids.includes(id))) problems.push("no_valid_evidence");
  if (e.evidence_ids.some((id) => !itemIds.has(id))) problems.push("unknown_evidence_id");
  for (const f of FIELDS) {
    const text = e[f];
    if (text.length > C.explanation.maxFieldChars) problems.push(`${f}:too_long`);
    for (const r of RULES) if (r.re.test(text)) problems.push(`${f}:${r.name}`);
    for (const tok of text.match(/\b[a-z0-9]+(?:-[a-z0-9]+)+\b/g) ?? []) {
      if (knownOfferingIds.has(tok) && tok !== pick.offering_id) problems.push(`${f}:other_offering_id`);
    }
    for (const tok of text.match(/\bu\d+\b/g) ?? []) if (!itemIds.has(tok)) problems.push(`${f}:unknown_id`);
  }
  return problems;
}

const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…");

/** Template fallback: catalog facts plus the user's own words (§9 failure table). */
export function templateExplanation(pick: Placed, snapshot: CatalogSnapshot, items: ProfileItem[]): Explanation {
  const o = snapshot.offerings.find((x) => x.id === pick.offering_id)!;
  const cap = snapshot.taxonomy.find((c) => c.id === pick.capability_id);
  const ev = items.find((i) => pick.evidence_ids.includes(i.id));
  const quote = ev ? clip(ev.quote, 160) : "";
  const skip = o.skip_if[0] ?? cap?.skip_conditions[0] ?? "";
  return {
    offering_id: o.id,
    evidence_ids: ev ? [ev.id] : pick.evidence_ids.slice(0, 1),
    why: pick.need_type === "latent" ? `Projects like the one you described often need this: "${quote}"` : `You said: "${quote}"`,
    how_it_helps: o.editorial.could_help_with,
    do_you_need_it:
      pick.do_you_need_it === "needed_now"
        ? "Needed now: it serves something you described."
        : pick.do_you_need_it === "useful_later"
          ? "Useful later: you did not ask for this, but it fits your project."
          : "Probably not.",
    skip_if: skip ? `Skip it if: ${skip}` : "",
    summary: o.editorial.what_it_is,
  };
}

export async function explain(args: {
  llm: LlmProvider;
  picks: Placed[];
  snapshot: CatalogSnapshot;
  items: ProfileItem[];
}): Promise<{ explanations: Map<string, Explanation>; usage: Usage[]; degraded: boolean; rejected: Record<string, string[]> }> {
  const { llm, picks, snapshot, items } = args;
  const usage: Usage[] = [];
  const out = new Map<string, Explanation>();
  const rejected: Record<string, string[]> = {};
  if (picks.length === 0) return { explanations: out, usage, degraded: false, rejected };
  const known = new Set(snapshot.offerings.map((o) => o.id));
  const itemIds = new Set(items.map((i) => i.id));
  const req = {
    items: items.map((i) => ({ id: i.id, kind: i.kind, text: i.text })),
    picks: picks.map((p) => {
      const o = snapshot.offerings.find((x) => x.id === p.offering_id)!;
      const cap = snapshot.taxonomy.find((c) => c.id === p.capability_id);
      return {
        offering_id: p.offering_id,
        need_type: p.need_type,
        evidence_ids: p.evidence_ids,
        plain_name: o.identity.display_name,
        what_it_is: o.editorial.what_it_is,
        could_help_with: o.editorial.could_help_with,
        skip_conditions: [...o.skip_if, ...(cap?.skip_conditions ?? [])],
      };
    }),
  };

  for (let attempt = 0; attempt < 2 && out.size < picks.length; attempt++) {
    try {
      const res = await llm.explain(req);
      usage.push(res.usage);
      if (!validateExplanation(res.json)) continue;
      for (const e of (res.json as { explanations: Explanation[] }).explanations) {
        const pick = picks.find((p) => p.offering_id === e.offering_id);
        if (!pick || out.has(pick.offering_id)) continue;
        const problems = checkExplanation(e, pick, known, itemIds);
        if (problems.length) rejected[e.offering_id] = problems;
        else out.set(pick.offering_id, { ...e, evidence_ids: e.evidence_ids.filter((id) => pick.evidence_ids.includes(id)) });
      }
    } catch {
      // provider error or timeout: retry once, then template explanations with a banner
    }
  }
  let degraded = false;
  for (const p of picks) {
    if (!out.has(p.offering_id)) {
      out.set(p.offering_id, templateExplanation(p, snapshot, items));
      degraded = true;
    }
  }
  return { explanations: out, usage, degraded, rejected };
}
