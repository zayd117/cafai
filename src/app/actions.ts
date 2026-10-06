"use server";
// Server actions for the counter and results pages. Forms post without client JS (progressive enhancement).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isUuid } from "@/db/client";
import { addFeedback, type FeedbackKind } from "@/db/runs";
import type { UserItem } from "@/engine/understand";
import { DisabledProvider } from "@/engine/providers/mock";
import { budgetSpent, clientKey, hitQuota, readFlags } from "@/server/controls";
import { getRealSnapshot, getRuntime, isPublished, mockProvidersFor } from "@/server/runtime";
import { loadRun, startRun, type StartRun } from "@/server/runService";
import { sameReadback, savedExampleById, savedExampleFor, savedProviders, type SavedExample } from "@/server/savedExamples";

const CLIENTS = new Set(["claude_code", "cursor", "claude_desktop", "other"]);
const ITEM_KINDS = new Set(["goal", "task", "problem", "environment", "constraint", "current_tool", "interest", "possible_need"]);

/** Checks before any run (plan §14 denial of wallet, §17 kill switches). Redirects instead of running when refused. */
async function guarded(form: FormData, back: string) {
  const rt = getRuntime();
  if (String(form.get("website") || "")) redirect("/"); // honeypot: people never see or fill this field
  const flags = await readFlags(rt.pool);
  if (flags.runsOff) redirect(`${back}?error=paused`);
  const h = await headers();
  const client = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const q = await hitQuota(rt.pool, clientKey("ip", client));
  if (!q.allowed) redirect(`${back}?error=quota`);
  const aiOff = flags.aiOff ? "disabled:ai_off" : (await budgetSpent(rt.pool)) ? "disabled:budget" : null;
  return { rt, flags, aiOff };
}

async function run(g: Awaited<ReturnType<typeof guarded>>, input: StartRun, example?: SavedExample | null) {
  const { rt, flags, aiOff } = g;
  // An intake example answers from its saved script on the real catalog: no model call, so the AI switches don't apply.
  // Until the real snapshot is published (deploys publish it), the example falls back to the normal path.
  const real = example ? getRealSnapshot() : null;
  const saved = example && real && (await isPublished(real.version)) ? example : null;
  const base = saved ? real! : rt.snapshot;
  const snapshot = flags.revoked.size ? { ...base, offerings: base.offerings.filter((o) => !flags.revoked.has(o.id)) } : base;
  if (saved) {
    const p = savedProviders(saved);
    return startRun({ pool: rt.pool, snapshot, llm: p, decision: p }, { ...input, savedExample: saved.id });
  }
  const off = aiOff ? new DisabledProvider(aiOff) : null;
  const scripted = !off && rt.mock ? mockProvidersFor(input.text) : null;
  return startRun(
    { pool: rt.pool, snapshot, llm: off ?? scripted?.llm ?? rt.llm, decision: off ?? scripted?.decision ?? rt.decision },
    input,
  );
}

/** Counter (plan §8): free text, optional AI tools, optional "something specific" (State A, extra signal only). */
export async function submitOrder(form: FormData) {
  const text = String(form.get("example") || form.get("text") || "").trim();
  if (!text) redirect("/?error=empty");
  const g = await guarded(form, "/");
  const declaredClients = form.getAll("clients").map(String).filter((c) => CLIENTS.has(c));
  const specific = String(form.get("specific") || "").trim().slice(0, 300);
  const userItems: UserItem[] = specific ? [{ id: "s1", kind: "interest", text: specific }] : [];
  // Only the example buttons use saved answers; the same words typed in, or extra detail, go through the normal path.
  const example = form.get("example") && !specific ? savedExampleFor(text) : null;
  const clients = example && declaredClients.length === 0 ? example.declared_clients : declaredClients;
  const id = await run(g, { text, declaredClients: clients, userItems }, example);
  redirect(`/r/${id}`);
}

/** Read-back edits are ground truth and redo the picks (plan §9). A new run keeps the old one intact. */
export async function rerun(form: FormData) {
  const parent = String(form.get("run") || "");
  if (!isUuid(parent)) redirect("/");
  const g = await guarded(form, `/r/${parent}`);
  const prev = await loadRun(g.rt.pool, parent);
  if (!prev || prev.text === null) redirect(`/r/${parent}?error=expired`);

  const items: UserItem[] = [];
  const ids = form.getAll("item_id").map(String);
  const kinds = form.getAll("item_kind").map(String);
  const texts = form.getAll("item_text").map(String);
  ids.forEach((id, i) => {
    const t = (texts[i] ?? "").trim().slice(0, 300);
    if (t && /^[a-z0-9]{1,12}$/i.test(id) && ITEM_KINDS.has(kinds[i] ?? "")) items.push({ id, kind: kinds[i] as UserItem["kind"], text: t });
  });
  const added = String(form.get("add_item") || "").trim().slice(0, 300);
  if (added) items.push({ id: `a${items.length + 1}`, kind: "task", text: added });
  const answer = String(form.get("answer") || "").trim().slice(0, 120);
  if (answer) items.push({ id: `q${items.length + 1}`, kind: "constraint", text: answer });

  // A saved example still applies while the read-back is unchanged (Refine, or Update with no edits).
  const example = prev.details.saved_example && (items.length === 0 || sameReadback(items, prev.details.readback))
    ? savedExampleById(prev.details.saved_example) : null;
  const constraints = form.has("refine")
    ? { remote_only: form.has("remote_only"), vendor_official_only: form.has("vendor_official_only"), free_only: form.has("free_only") }
    : prev.details.constraints;
  const id = await run(g, {
    text: prev.text,
    declaredClients: prev.declared_clients,
    constraints,
    userItems: items.length && !example ? items : undefined,
    confirmed: form.has("confirm") || prev.details.confirmed,
    parentRunId: parent,
  }, example);
  redirect(`/r/${id}`);
}

const FEEDBACK = new Set<FeedbackKind>(["useful", "not_useful", "already_knew", "try_it", "it_worked", "stuck"]);

/** Per-card and setup feedback (plan §9 Feedback: card, setup, outcome levels). */
export async function sendFeedback(form: FormData) {
  const runId = String(form.get("run") || "");
  const kind = String(form.get("kind") || "") as FeedbackKind;
  const recId = String(form.get("rec") || "") || undefined;
  const back = String(form.get("back") || "results");
  if (!isUuid(runId) || !FEEDBACK.has(kind) || (recId && !isUuid(recId))) redirect("/");
  await addFeedback(getRuntime().pool, {}, runId, { recommendationId: recId, kind, value: true });
  const path = back === "setup" ? `/r/${runId}/setup` : `/r/${runId}`;
  const q = new URLSearchParams();
  if (back === "setup") {
    // Keep the setup page as it was: the same ticked picks and the same AI tool tab. Ids only, nothing else.
    const id = (v: FormDataEntryValue) => (typeof v === "string" && /^[a-z0-9_-]{1,80}$/i.test(v) ? v : null);
    for (const pick of form.getAll("pick").slice(0, 10).map(id)) if (pick) q.append("pick", pick);
    const client = form.get("client");
    if (client && id(client)) q.set("client", String(client));
  }
  q.set("thanks", kind);
  if (recId) q.set("rec", recId);
  redirect(`${path}?${q}#${recId ? `pick-${recId}` : "top"}`);
}
