"use server";
// Server actions for the counter and results pages. Forms post without client JS (progressive enhancement).
import { redirect } from "next/navigation";
import { isUuid } from "@/db/client";
import { addFeedback, type FeedbackKind } from "@/db/runs";
import type { UserItem } from "@/engine/understand";
import { getRuntime, mockProvidersFor } from "@/server/runtime";
import { loadRun, startRun, type StartRun } from "@/server/runService";

const CLIENTS = new Set(["claude_code", "cursor", "claude_desktop", "other"]);
const ITEM_KINDS = new Set(["goal", "task", "problem", "environment", "constraint", "current_tool", "interest", "possible_need"]);

async function run(input: StartRun) {
  const rt = getRuntime();
  const scripted = rt.mock ? mockProvidersFor(input.text) : null;
  return startRun({ pool: rt.pool, snapshot: rt.snapshot, llm: scripted?.llm ?? rt.llm, decision: scripted?.decision ?? rt.decision }, input);
}

/** Counter (plan §8): free text, optional AI tools, optional "something specific" (State A, extra signal only). */
export async function submitOrder(form: FormData) {
  const text = String(form.get("example") || form.get("text") || "").trim();
  if (!text) redirect("/?error=empty");
  const declaredClients = form.getAll("clients").map(String).filter((c) => CLIENTS.has(c));
  const specific = String(form.get("specific") || "").trim().slice(0, 300);
  const userItems: UserItem[] = specific ? [{ id: "s1", kind: "interest", text: specific }] : [];
  const id = await run({ text, declaredClients, userItems });
  redirect(`/r/${id}`);
}

/** Read-back edits are ground truth and redo the picks (plan §9). A new run keeps the old one intact. */
export async function rerun(form: FormData) {
  const parent = String(form.get("run") || "");
  if (!isUuid(parent)) redirect("/");
  const rt = getRuntime();
  const prev = await loadRun(rt.pool, parent);
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

  const constraints = form.has("refine")
    ? { remote_only: form.has("remote_only"), vendor_official_only: form.has("vendor_official_only"), free_only: form.has("free_only") }
    : prev.details.constraints;
  const id = await run({
    text: prev.text,
    declaredClients: prev.declared_clients,
    constraints,
    userItems: items.length ? items : undefined,
    confirmed: form.has("confirm") || prev.details.confirmed,
    parentRunId: parent,
  });
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
  redirect(`${path}?thanks=${kind}${recId ? `&rec=${recId}` : ""}#${recId ? `pick-${recId}` : "top"}`);
}
