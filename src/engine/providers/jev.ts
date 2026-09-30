// Jev (TypeSafe) behind the Decision interface: stage 8 only (plan §9, §17), for the A2 bake-off arm (§25).
// UNVERIFIED LIVE until a key is set (REGISTER A-040); request shape follows docs.typesafe.ai (read 30 Sep 2026)
// and is unit-tested with a stub fetch.
// Jev is literal, does not generate text and can be steered by injected text, so it gets structured state only
// (read-back items + curated candidate profiles, never the raw description), one atomic question per judgment,
// and code turns its probabilities into the engine's judgment shape.
import { TypeSafeClient, choice, noul, type Fetch, type Questions } from "@typesafe-ai/sdk";
import type { DecisionProvider, JudgmentRequest, ModelResponse } from "./types";

/** Pinned so tuned thresholds keep meaning the same thing; the alias `jev-latest` moves without notice (docs: Models). */
export const JEV_DEFAULT_MODEL = "jev-1.13.0";
/** PLACEHOLDER thresholds (REGISTER A-040): tune on Phase 0 cases before the real run, then freeze. */
export const JEV_THRESHOLDS = { signal: 0.5, evidenceEnough: 0.5 };

export interface JevProviderOptions {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  /** Per-attempt timeout in ms (SDK default 10 000). */
  timeoutMs?: number;
  /** Tests only: stub transport. */
  fetch?: Fetch;
}

/** Key from TYPESAFE_API_KEY (the SDK's own name) or JEV_API_KEY; null when neither is set. */
export function jevKeyFrom(env: Record<string, string | undefined> = process.env): string | null {
  return env.TYPESAFE_API_KEY?.trim() || env.JEV_API_KEY?.trim() || null;
}

const NONE = "none";

export class JevDecisionProvider implements DecisionProvider {
  readonly id: string;
  private client: TypeSafeClient;
  private model: string;

  constructor(opts: JevProviderOptions = {}) {
    this.model = opts.model ?? JEV_DEFAULT_MODEL;
    this.id = `jev:${this.model}`;
    this.client = new TypeSafeClient({
      apiKey: opts.apiKey ?? jevKeyFrom() ?? undefined,
      baseURL: opts.baseURL,
      defaultModel: this.model,
      timeout: opts.timeoutMs,
      fetch: opts.fetch,
      // The SDK retries 408/429/5xx with backoff (Jev rate limits move); the engine adds its own single retry (§9).
      retry: { maxRetries: 2 },
      logLevel: "off",
    });
  }

  /** The questions for one request, keyed `c<i>_<what>`; keys are not sent to the model (docs: API reference). */
  static questions(req: JudgmentRequest): Questions {
    const q: Record<string, Questions[string]> = {};
    const itemOptions: Record<string, string> = Object.fromEntries(req.items.map((it) => [it.id, it.text]));
    itemOptions[NONE] = "No item in `items` shows this.";
    req.candidates.forEach((c, i) => {
      const candidate = { name: c.plain_name, provides: c.provides, requires: c.requires, limits: c.limits };
      const ask = (question: string, extra: Record<string, string> = {}) => ({ candidate, ...extra, question });
      q[`c${i}_intent`] = choice(ask("Does the project described in `items` need what `candidate.provides` lists?"), {
        direct: "Yes: an item asks for what the candidate provides.",
        partial: "Only related: an item asks for something near it, not the thing itself.",
        none: "No: no item asks for anything the candidate provides.",
      });
      if (req.items.length) {
        q[`c${i}_item`] = choice(ask("Which single item in `items` best shows the person needs what `candidate.provides` lists?"), itemOptions);
      }
      if (c.requires.length) {
        q[`c${i}_requires`] = choice(ask("Does the project described in `items` meet every entry in `candidate.requires`?"), {
          yes: "The items show the project meets every entry.",
          partly: "The items show the project meets some entries and not others.",
          no: "The items show the project cannot meet at least one entry.",
          unknown: "The items do not say whether the project meets the entries.",
        });
      }
      c.signals.forEach((s, j) => {
        q[`c${i}_s${j}`] = noul(ask("Does `signal` describe the project in `items`?", { signal: s.text }));
      });
      q[`c${i}_enough`] = noul(ask("Do the items say enough about the project to decide whether `candidate` fits it?"));
    });
    return q as Questions;
  }

  async judge(req: JudgmentRequest): Promise<ModelResponse> {
    // State is the read-back only: the raw description never reaches Jev (injection risk, docs: jaggedness #6).
    const state = { items: req.items.map((it) => ({ id: it.id, kind: it.kind, text: it.text })) };
    const res = await this.client.systemOne({ state, questions: JevDecisionProvider.questions(req), model: this.model });
    const a = res.answers as Record<string, { noul?: number; choice?: string } | undefined>;
    const judgments = req.candidates.map((c, i) => {
      const intent = a[`c${i}_intent`]?.choice as "direct" | "partial" | "none" | undefined;
      const item = req.items.find((it) => it.id === a[`c${i}_item`]?.choice);
      // Jev picks an item; code supplies that item's verified quote (Jev does not generate text).
      const quote = intent && intent !== "none" && item ? (item.edited ? item.text : (item.quote ?? "")) : "";
      return {
        offering_id: c.offering_id,
        capability_id: c.capability_id,
        intent_fit: quote ? intent! : "none",
        intent_quote: quote,
        requirements_met: c.requires.length ? ((a[`c${i}_requires`]?.choice as string | undefined) ?? "unknown") : "yes",
        fired_signal_ids: c.signals.filter((_, j) => (a[`c${i}_s${j}`]?.noul ?? 0) >= JEV_THRESHOLDS.signal).map((s) => s.id),
        evidence_enough: (a[`c${i}_enough`]?.noul ?? 0) >= JEV_THRESHOLDS.evidenceEnough,
      };
    });
    return { json: { judgments }, usage: { model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } };
  }
}
