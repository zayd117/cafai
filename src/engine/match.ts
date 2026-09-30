// Stages 5-10 (plan §9): discovery (catalog only), resource profiles, candidate filter, two-way match,
// Match and Confidence scoring (never merged), evidence check.
import type { CatalogSnapshot, Offering } from "@/catalog/types";
import { ENGINE_CONFIG as C } from "./config";
import type { CandidateForModel, DecisionProvider, Usage } from "./providers/types";
import { validateJudgment } from "./schemas";
import { quoteIsInText } from "./understand";
import type { CapabilityNeed, ConfidenceBand, Judgment, MatchBand, NotNeeded, ProfileItem, ScoredCandidate, UnderstandingOutput } from "./types";

export interface Constraints {
  remote_only?: boolean;
  vendor_official_only?: boolean;
  free_only?: boolean;
}

export const ACTIONABLE: CapabilityNeed["need_type"][] = ["stated", "implied", "latent"];
const DAY = 86_400_000;
const ageDays = (date: string, now: Date) => Math.floor((now.getTime() - new Date(date + "T00:00:00Z").getTime()) / DAY);

export interface Candidate {
  offering: Offering;
  need: CapabilityNeed;
  notes: string[];
}

export interface FilterResult {
  candidates: Candidate[];
  capabilitiesWithoutOffering: string[];
  filtered: { offering_id: string; reason: string }[];
}

/** Stages 5-7: map needs to catalog offerings, then drop what cannot or must not be recommended. */
export function discoverAndFilter(args: {
  snapshot: CatalogSnapshot;
  needs: CapabilityNeed[];
  declaredClients: string[];
  constraints: Constraints;
  now: Date;
}): FilterResult {
  const { snapshot, declaredClients, constraints, now } = args;
  const candidates: Candidate[] = [];
  const filtered: FilterResult["filtered"] = [];
  const capabilitiesWithoutOffering: string[] = [];

  for (const need of args.needs.filter((n) => ACTIONABLE.includes(n.need_type))) {
    const offerings = snapshot.offerings.filter((o) => o.capabilities.includes(need.capability_id));
    if (offerings.length === 0) capabilitiesWithoutOffering.push(need.capability_id);
    for (const o of offerings) {
      const drop = (reason: string) => filtered.push({ offering_id: o.id, reason });
      // Trust is an eligibility gate, never a ranking bonus (§9 CHANGED, §11).
      if (!["reviewed", "checked"].includes(o.trust.state)) { drop(`trust_${o.trust.state}`); continue; }
      const age = ageDays(o.last_verified_on, now);
      if (age > C.staleness.removeAfterDays) { drop("stale_verification"); continue; }
      // Declared clients: a distribution for one of them, or a client-independent one (§9 stage 7).
      if (declaredClients.length && !o.distributions.some((d) => d.client === "any" || declaredClients.includes(d.client))) {
        drop("no_distribution_for_declared_clients");
        continue;
      }
      if (constraints.remote_only && o.runtime.location === "local") { drop("constraint_remote_only"); continue; }
      if (constraints.vendor_official_only && !o.trust.vendor_official) { drop("constraint_vendor_official_only"); continue; }
      if (constraints.free_only && o.cost.model !== "free") { drop("constraint_free_only"); continue; }
      // An INFERRED fact can raise a candidate for review but cannot justify a pick alone (§9).
      if (o.resource_profile.provides.every((f) => f.evidence === "inferred")) { drop("inferred_only_profile"); continue; }
      const notes: string[] = [];
      if (o.trust.state === "checked") notes.push("checked_trust");
      if (age > C.staleness.lowerConfidenceAfterDays) notes.push("stale_verification");
      candidates.push({ offering: o, need, notes });
    }
  }
  return { candidates, capabilitiesWithoutOffering, filtered };
}

export function candidateForModel(c: Candidate): CandidateForModel {
  const p = c.offering.resource_profile;
  return {
    offering_id: c.offering.id,
    capability_id: c.need.capability_id,
    plain_name: c.offering.identity.display_name,
    provides: p.provides.map((f) => f.text),
    requires: p.requires.map((f) => f.text),
    limits: p.limits.map((f) => f.text),
    signals: c.offering.need_signals.map((n, i) => ({ id: offeringSignalId(c.offering.id, i), text: n.text })),
  };
}

export const offeringSignalId = (offeringId: string, index: number) => `o:${offeringId}#${index}`;

const NEED_ORDER = { stated: 0, implied: 1, latent: 2, present: 3, not_relevant: 4 } as const;

export function shortlist(cands: Candidate[]): Candidate[] {
  return [...cands]
    .sort((a, b) => NEED_ORDER[a.need.need_type] - NEED_ORDER[b.need.need_type] || a.offering.id.localeCompare(b.offering.id))
    .slice(0, C.caps.maxShortlist);
}

/** Stage 8: one schema-bound call; closed world (only shortlisted ids), quotes must be the user's words. */
export async function judge(args: {
  decision: DecisionProvider;
  text: string;
  items: ProfileItem[];
  candidates: Candidate[];
}): Promise<{ judgments: Map<string, Judgment>; usage: Usage[]; failed: boolean }> {
  const usage: Usage[] = [];
  const allowed = new Map(args.candidates.map((c) => [`${c.offering.id}|${c.need.capability_id}`, c]));
  if (args.candidates.length === 0) return { judgments: new Map(), usage, failed: false };
  const req = {
    text: args.text,
    items: args.items.map((i) => ({ id: i.id, kind: i.kind, text: i.text })),
    candidates: args.candidates.map(candidateForModel),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await args.decision.judge(req);
      usage.push(res.usage);
      if (!validateJudgment(res.json)) continue;
      const out = new Map<string, Judgment>();
      for (const j of (res.json as { judgments: Judgment[] }).judgments) {
        const key = `${j.offering_id}|${j.capability_id}`;
        if (!allowed.has(key) || out.has(key)) continue; // invented or duplicate ids are ignored (closed world)
        const quoteOk = j.intent_quote === "" || quoteIsInText(j.intent_quote, args.text) || args.items.some((i) => i.edited && quoteIsInText(j.intent_quote, i.text));
        const validSignals = new Set(allowed.get(key)!.offering.need_signals.map((_, i) => offeringSignalId(j.offering_id, i)));
        const fired_signal_ids = j.fired_signal_ids.filter((id) => validSignals.has(id));
        // An unquoted intent claim is not evidence: without the user's words, intent fit counts as none.
        out.set(key, quoteOk ? { ...j, fired_signal_ids } : { ...j, fired_signal_ids, intent_fit: "none", intent_quote: "" });
      }
      return { judgments: out, usage, failed: false };
    } catch {
      // retry, then deterministic-only
    }
  }
  return { judgments: new Map(), usage, failed: true };
}

const band = <B extends string>(score: number, bands: readonly { band: B; min: number }[]): B => bands.find((b) => score >= b.min)!.band;
const lowerOne: Record<ConfidenceBand, ConfidenceBand> = { high: "medium", medium: "low", low: "low" };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x: number) => Math.round(x * 1000) / 1000;

/** Stages 9-10: Match (fit to this project) and Confidence (strength of evidence), computed separately. */
export function score(args: {
  candidate: Candidate;
  judgment: Judgment | undefined; // undefined = deterministic-only
  understanding: UnderstandingOutput;
  declaredClients: string[];
  ablations?: { forwardOnly?: boolean };
}): ScoredCandidate {
  const { candidate: c, judgment: j, understanding: u } = args;
  const o = c.offering;
  const needType = c.need.need_type as "stated" | "implied" | "latent";
  const neededCaps = new Set(u.needs.filter((n) => ACTIONABLE.includes(n.need_type)).map((n) => n.capability_id));
  const forwardOnly = args.ablations?.forwardOnly ?? false;

  // Deterministic-only intent: a rule hit counts as direct, anything else as partial.
  const intent = j ? C.intentScore[j.intent_fit] : c.need.source.includes("rule") ? C.intentScore.direct : C.intentScore.partial;
  const backward = forwardOnly ? 1 : C.requirementsScore[j?.requirements_met ?? "unknown"];
  const fired = forwardOnly ? false : (j?.fired_signal_ids.length ?? 0) > 0;
  const components = {
    // Project match: the offering's curated "who is this for" signals fire on this project (else neutral).
    project: fired ? 1 : C.neutral,
    // Capability match, the core of the two-way match: forward (it serves the need; candidates are selected by
    // capability) times backward (the project meets what the offering requires). A strong match needs both (§9).
    capability: 1 * backward,
    intent,
    // Technical fit: passed the compatibility filter (evidence level feeds Confidence, not Match).
    technical: 1,
    usefulness: C.needStrength[needType],
    // Specificity: penalty when the offering's capabilities far exceed what this project needs.
    specificity: o.capabilities.filter((cap) => neededCaps.has(cap)).length / o.capabilities.length,
  };
  const w = C.matchWeights;
  const matchScore = round(
    (components.project * w.project + components.capability * w.capability + components.intent * w.intent +
      components.technical * w.technical + components.usefulness * w.usefulness + components.specificity * w.specificity) /
      (w.project + w.capability + w.intent + w.technical + w.usefulness + w.specificity),
  );

  // Confidence: evidence strength (profile facts, client compatibility, trust state), input clarity, agreement.
  const facts = [...o.resource_profile.provides, ...o.resource_profile.requires];
  const factScore = mean(facts.map((f) => C.evidenceScore[f.evidence]));
  const dists = o.distributions.filter((d) => d.client === "any" || args.declaredClients.includes(d.client));
  const compat = dists.length ? Math.max(...dists.map((d) => C.compatibilityScore[d.compatibility])) : C.compatibilityScore.derived;
  const trust = C.trustScore[o.trust.state as "reviewed" | "checked"];
  const evidenceStrength = mean([factScore, compat, trust]);
  const clarity = C.clarityScore[u.confidence];
  const agreement = j && !j.evidence_enough ? C.agreementScore.evidence_not_enough : c.need.source === "rule+model" ? C.agreementScore.both : C.agreementScore.one;
  const confScore = round(mean([evidenceStrength, clarity, agreement]));
  let confBand = band(confScore, C.confidenceBands);
  if (c.notes.includes("stale_verification")) confBand = lowerOne[confBand];
  const notes = [...c.notes];
  if (j && !j.evidence_enough) notes.push("evidence_not_enough");

  return {
    offering_id: o.id,
    capability_id: c.need.capability_id,
    need_type: c.need.need_type,
    evidence_ids: c.need.evidence_ids,
    match: { band: band(matchScore, C.matchBands) as MatchBand, score: matchScore, components },
    confidence: {
      band: confBand,
      score: confScore,
      inputs: { evidence_strength: round(evidenceStrength), fact_evidence: round(factScore), compatibility: compat, trust, input_clarity: clarity, agreement, stale: c.notes.includes("stale_verification") },
    },
    notes,
  };
}

/** Evidence check (stage 10): every scored candidate must cite at least one kept read-back item. */
export function evidenceCheck(scored: ScoredCandidate[], items: ProfileItem[]): { kept: ScoredCandidate[]; dropped: NotNeeded[] } {
  const ids = new Set(items.map((i) => i.id));
  const kept: ScoredCandidate[] = [];
  const dropped: NotNeeded[] = [];
  for (const s of scored) {
    const ev = s.evidence_ids.filter((e) => ids.has(e));
    if (ev.length) kept.push({ ...s, evidence_ids: ev });
    else dropped.push({ capability_id: s.capability_id, offering_id: s.offering_id, reason: "thin_evidence", detail: "no evidence in your description" });
  }
  return { kept, dropped };
}
