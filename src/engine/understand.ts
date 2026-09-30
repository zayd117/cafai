// Stages 2-4 (plan §9): project understanding + concept expansion (one model call), then potential-need detection
// (rules first, model fills gaps). Everything the model returns is checked against the user's text and the taxonomy.
import type { Capability } from "@/catalog/types";
import { ENGINE_CONFIG } from "./config";
import type { LlmProvider, TaxonomyEntryForModel, Usage } from "./providers/types";
import { validateUnderstanding } from "./schemas";
import type { CapabilityNeed, NeedType, ProfileItem, UnderstandingOutput } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
export const quoteIsInText = (quote: string, text: string) => norm(quote).length > 0 && norm(text).includes(norm(quote));

export const signalId = (capabilityId: string, index: number) => `${capabilityId}#${index}`;

export function taxonomyForModel(taxonomy: Capability[]): TaxonomyEntryForModel[] {
  return taxonomy.map((c) => ({
    id: c.id,
    plain_name: c.plain_name,
    job_phrases: c.job_phrases,
    signals: c.need_signals.map((s, i) => ({ id: signalId(c.id, i), text: s.text, need_type: s.need_type })),
  }));
}

export interface UserItem {
  id: string;
  kind: ProfileItem["kind"];
  text: string;
}

export interface UnderstandingResult {
  output: UnderstandingOutput;
  usage: Usage[];
  failed: boolean; // model output invalid twice or provider error: deterministic rules only
  dropped: { items: number; needs: number };
}

async function callWithRetry(llm: LlmProvider, req: Parameters<LlmProvider["understand"]>[0], usage: Usage[]) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await llm.understand(req);
      usage.push(res.usage);
      if (validateUnderstanding(res.json)) return res.json as unknown as UnderstandingOutput;
    } catch {
      // provider error: fall through to retry, then deterministic-only (§9 failure table)
    }
  }
  return null;
}

/** Deterministic rule (§9 "rules first"): a taxonomy job phrase found in the text is a stated need, quoted. */
function ruleNeeds(text: string, taxonomy: Capability[]): { need: CapabilityNeed; sentence: string }[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const out: { need: CapabilityNeed; sentence: string }[] = [];
  for (const c of taxonomy) {
    for (const phrase of c.job_phrases) {
      const sentence = sentences.find((s) => norm(s).includes(norm(phrase)));
      if (sentence) {
        out.push({ need: { capability_id: c.id, need_type: "stated", evidence_ids: [], source: "rule" }, sentence });
        break;
      }
    }
  }
  return out;
}

export async function understand(args: {
  llm: LlmProvider;
  text: string; // redacted
  declaredClients: string[];
  taxonomy: Capability[];
  userItems?: UserItem[];
}): Promise<UnderstandingResult> {
  const { llm, text, taxonomy } = args;
  const userItems = args.userItems ?? [];
  const usage: Usage[] = [];
  const raw = await callWithRetry(
    llm,
    { text, declared_clients: args.declaredClients, user_items: userItems, taxonomy: taxonomyForModel(taxonomy) },
    usage,
  );
  const failed = raw === null;
  const capIds = new Set(taxonomy.map((c) => c.id));
  const signals = new Map(taxonomyForModel(taxonomy).flatMap((c) => c.signals.map((s) => [s.id, { ...s, capability_id: c.id }] as const)));
  let droppedItems = 0;
  let droppedNeeds = 0;

  // Items: user edits are ground truth; model items must quote the user's text or they are dropped (§9).
  const items: ProfileItem[] = userItems.map((u) => ({ ...u, quote: u.text, edited: true }));
  const idMap = new Map<string, string>(userItems.map((u) => [u.id, u.id]));
  let next = 1;
  const freshId = () => {
    while (items.some((i) => i.id === `u${next}`)) next++;
    return `u${next++}`;
  };
  const evidenceText = [text, ...userItems.map((u) => u.text)].join("\n");
  for (const it of raw?.items ?? []) {
    if (idMap.has(it.id)) continue; // model may not overwrite a user-edited item
    if (!quoteIsInText(it.quote, evidenceText)) {
      droppedItems++;
      continue;
    }
    const newId = freshId();
    idMap.set(it.id, newId);
    items.push({ id: newId, kind: it.kind, text: it.text, quote: it.quote });
  }

  // Needs from the model: closed-world capability ids; evidence must resolve to kept items; latent only via curated signals.
  const needs = new Map<string, CapabilityNeed>();
  let latentKept = 0;
  for (const n of raw?.needs ?? []) {
    const evidence_ids = n.evidence_ids.map((e) => idMap.get(e)).filter((e): e is string => !!e);
    const ok = (() => {
      if (!capIds.has(n.capability_id)) return false;
      if (n.need_type === "not_relevant") return !!n.reason;
      if (evidence_ids.length === 0) return false;
      if (n.need_type === "latent") {
        const s = n.signal_id ? signals.get(n.signal_id) : undefined;
        return !!s && s.need_type === "latent" && s.capability_id === n.capability_id && latentKept < ENGINE_CONFIG.caps.maxLatentNeedsPerRun;
      }
      return true;
    })();
    if (!ok || needs.has(n.capability_id)) {
      droppedNeeds++;
      continue;
    }
    if (n.need_type === "latent") latentKept++;
    needs.set(n.capability_id, {
      capability_id: n.capability_id,
      need_type: n.need_type as NeedType,
      evidence_ids,
      source: "model",
      ...(n.signal_id ? { signal_id: n.signal_id } : {}),
      ...(n.reason ? { reason: n.reason } : {}),
    });
  }

  // Rules first: a job-phrase hit is a stated need. It upgrades model needs and adds its sentence as evidence.
  for (const { need, sentence } of ruleNeeds(evidenceText, taxonomy)) {
    let item = items.find((i) => quoteIsInText(i.quote, sentence) || quoteIsInText(sentence, i.quote));
    if (!item) {
      item = { id: freshId(), kind: "task", text: sentence, quote: sentence };
      items.push(item);
    }
    const existing = needs.get(need.capability_id);
    if (existing && existing.need_type === "present") continue; // the user already has it
    needs.set(need.capability_id, {
      capability_id: need.capability_id,
      need_type: "stated",
      evidence_ids: [...new Set([...(existing?.evidence_ids ?? []), item.id])],
      source: existing ? "rule+model" : "rule",
    });
  }

  const concepts = (raw?.concepts ?? []).map((c) => ({ term: c.term, capability_id: c.capability_id && capIds.has(c.capability_id) ? c.capability_id : null }));
  const output: UnderstandingOutput = {
    in_scope: failed ? text.trim().length > 0 : raw!.in_scope,
    confidence: failed ? "low" : raw!.confidence,
    items,
    concepts,
    needs: [...needs.values()],
    clarifying_question: raw?.clarifying_question ?? null,
  };
  return { output, usage, failed, dropped: { items: droppedItems, needs: droppedNeeds } };
}
