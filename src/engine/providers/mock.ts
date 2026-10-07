// MOCK providers. No model is called. Every result produced with these is labeled MOCK by provider id and must never be
// presented as a real recommendation (REGISTER A-017: no ANTHROPIC_API_KEY in this environment).
import type {
  DecisionProvider,
  ExplanationRequest,
  JudgmentRequest,
  LlmProvider,
  ModelResponse,
  UnderstandingRequest,
} from "./types";
import { shortTag } from "../tags";

const ZERO = { model: "MOCK", input_tokens: 0, output_tokens: 0 };
/** "I don't really know what I need" says why they came, not what they are building: no item for it. */
const UNSURE = /\b(?:don(?:'|’)t|do not|not)\b.*\b(?:know|sure)\b.*\bneed\b/i;

type Handler<Req> = (req: Req) => unknown | Promise<unknown>;

/** Test double: each call answers from a handler; every request is recorded (canary tests read them). */
export class ScriptedProvider implements LlmProvider, DecisionProvider {
  id = "mock:scripted";
  requests: { kind: "understand" | "judge" | "explain"; req: unknown }[] = [];
  constructor(
    private handlers: {
      understand?: Handler<UnderstandingRequest>;
      judge?: Handler<JudgmentRequest>;
      explain?: Handler<ExplanationRequest>;
    },
  ) {}
  private async call<Req>(kind: "understand" | "judge" | "explain", req: Req, h?: Handler<Req>): Promise<ModelResponse> {
    this.requests.push({ kind, req });
    if (!h) throw new Error(`MOCK: no ${kind} handler`);
    return { json: await h(req), usage: ZERO };
  }
  understand(req: UnderstandingRequest) {
    return this.call("understand", req, this.handlers.understand);
  }
  judge(req: JudgmentRequest) {
    return this.call("judge", req, this.handlers.judge);
  }
  explain(req: ExplanationRequest) {
    return this.call("explain", req, this.handlers.explain);
  }
}

/**
 * Development stand-in with no intelligence: each sentence becomes a read-back item tagged with its first words, no needs are inferred
 * (the engine's deterministic job-phrase rules still run), every candidate is judged "partial", and explanations
 * are left to the engine's template fallback. Useful only to exercise the UI end to end.
 */
export class HeuristicMockProvider implements LlmProvider, DecisionProvider {
  id = "mock:heuristic";
  async understand(req: UnderstandingRequest): Promise<ModelResponse> {
    const sentences = req.text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).length >= 3 && !UNSURE.test(s));
    return {
      json: {
        in_scope: req.text.trim().length > 0,
        confidence: sentences.length ? "medium" : "low",
        items: sentences.slice(0, 8).map((s, i) => ({ id: `u${i + 1}`, kind: "task", text: s, quote: s, tag: shortTag(s) })),
        concepts: [],
        needs: [],
        clarifying_question: null,
      },
      usage: ZERO,
    };
  }
  async judge(req: JudgmentRequest): Promise<ModelResponse> {
    return {
      json: {
        judgments: req.candidates.map((c) => ({
          offering_id: c.offering_id,
          capability_id: c.capability_id,
          intent_fit: "partial",
          intent_quote: "",
          requirements_met: "unknown",
          fired_signal_ids: [],
          evidence_enough: true,
        })),
      },
      usage: ZERO,
    };
  }
  async explain(): Promise<ModelResponse> {
    throw new Error("MOCK: no explanation model; engine uses template explanations");
  }
}

/** Used when the "ai_off" kill switch is on or the daily AI budget is spent: every call fails, so the engine runs
 * its deterministic rules and template explanations (plan §9 degraded modes, §14 kill switches). */
export class DisabledProvider implements LlmProvider, DecisionProvider {
  constructor(readonly id: string) {}
  async understand(): Promise<ModelResponse> {
    throw new Error(`${this.id}: model calls are switched off`);
  }
  async judge(): Promise<ModelResponse> {
    throw new Error(`${this.id}: model calls are switched off`);
  }
  async explain(): Promise<ModelResponse> {
    throw new Error(`${this.id}: model calls are switched off`);
  }
}
