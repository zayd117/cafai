// Real provider over the Claude API. UNVERIFIED LIVE: no API credential in this environment (REGISTER A-017);
// request shape is type-checked against the SDK and unit-tested with a stub client.
// Models follow plan §9's cost math (Claude Sonnet 5.5, Claude Haiku 4.5); the split per call is configurable (REGISTER A-025).
import Anthropic from "@anthropic-ai/sdk";
import { EXPLANATION_SYSTEM, fence, JUDGMENT_SYSTEM, UNDERSTANDING_SYSTEM } from "../prompts";
import { explanationSchema, judgmentSchema, understandingSchema } from "../schemas";
import {
  BilledError,
  type DecisionProvider,
  type ExplanationRequest,
  type JudgmentRequest,
  type LlmProvider,
  type ModelResponse,
  type UnderstandingRequest,
} from "./types";

type Call = "understanding" | "judgment" | "explanation";
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type Effort = (typeof EFFORTS)[number];
export const isEffort = (v: unknown): v is Effort => EFFORTS.includes(v as Effort);
/** Haiku 4.5, Sonnet 4.5 and older models reject the effort setting, so it is only sent to models that take it. */
export const takesEffort = (model: string) => !/haiku|sonnet-4-5|claude-3|-4-0|-4-1|-4-20\d\d/.test(model);

/** How hard Claude thinks per call; thinking is billed as output, so this is the main cost lever (REGISTER A-025).
 * Understanding and judgment reason about needs and fit; the explanation only writes short text from given facts. */
export const DEFAULT_EFFORT: Record<Call, Effort> = { understanding: "medium", judgment: "medium", explanation: "low" };

export interface AnthropicProviderOptions {
  client?: Pick<Anthropic, "beta">;
  models?: Partial<Record<Call, string>>;
  effort?: Partial<Record<Call, Effort>>;
  /** Per-call timeout in ms. The engine itself retries once (§9 failure table), so the SDK does not retry. */
  timeoutMs?: number;
}

const DEFAULT_MODEL = "claude-sonnet-5-5";

/** Structured outputs accept a subset of JSON Schema: drop length/count/pattern constraints (ajv still enforces them). */
export function toApiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toApiSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema)) {
      if (["minLength", "maxLength", "minItems", "maxItems", "pattern"].includes(k)) continue;
      out[k] = toApiSchema(v);
    }
    return out;
  }
  return schema;
}

export class AnthropicProvider implements LlmProvider, DecisionProvider {
  readonly id: string;
  private client: Pick<Anthropic, "beta">;
  private models: Record<Call, string>;
  private effort: Record<Call, Effort>;
  private timeoutMs: number;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.client = opts.client ?? new Anthropic({ maxRetries: 0 });
    this.models = {
      understanding: opts.models?.understanding ?? DEFAULT_MODEL,
      judgment: opts.models?.judgment ?? DEFAULT_MODEL,
      explanation: opts.models?.explanation ?? DEFAULT_MODEL,
    };
    this.effort = {
      understanding: opts.effort?.understanding ?? DEFAULT_EFFORT.understanding,
      judgment: opts.effort?.judgment ?? DEFAULT_EFFORT.judgment,
      explanation: opts.effort?.explanation ?? DEFAULT_EFFORT.explanation,
    };
    this.timeoutMs = opts.timeoutMs ?? 30_000; // PLACEHOLDER; plan latency target is 15 s p95 for full picks (§17)
    const call = (c: Call) => `${this.models[c]}@${takesEffort(this.models[c]) ? this.effort[c] : "default"}`;
    this.id = `anthropic:${call("understanding")}/${call("judgment")}/${call("explanation")}`;
  }

  private async call(c: Call, system: string, user: string, schema: unknown): Promise<ModelResponse> {
    const model = this.models[c];
    // Server-side refusal fallback: the "default" form, Claude API only, for Claude Sonnet 5.5 (skill guidance).
    const fallback = model === "claude-sonnet-5-5" ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};
    const res = await this.client.beta.messages.create(
      {
        model,
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: user }],
        output_config: {
          format: { type: "json_schema", schema: toApiSchema(schema) as Record<string, unknown> },
          ...(takesEffort(model) ? { effort: this.effort[c] } : {}),
        },
        ...fallback,
      },
      { timeout: this.timeoutMs },
    );
    const usage = { model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens };
    // A refusal or a cut-off answer is not valid output: the engine retries once, then degrades (§9). It was still billed.
    if (res.stop_reason !== "end_turn") throw new BilledError(`model stopped: ${res.stop_reason}`, usage);
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    try {
      return { json: JSON.parse(text), usage };
    } catch {
      throw new BilledError("model answer is not JSON", usage);
    }
  }

  understand(req: UnderstandingRequest) {
    const user = [
      fence("taxonomy", req.taxonomy),
      fence("declared_ai_tools", req.declared_clients),
      req.user_items.length ? fence("items_the_person_edited (ground truth; keep their ids)", req.user_items) : "",
      fence("description", req.text),
    ].filter(Boolean).join("\n\n");
    return this.call("understanding", UNDERSTANDING_SYSTEM, user, understandingSchema);
  }

  judge(req: JudgmentRequest) {
    const items = req.items.map(({ id, kind, text }) => ({ id, kind, text })); // prompt unchanged by the Jev-only fields
    const user = [fence("candidates", req.candidates), fence("understood_items", items), fence("description", req.text)].join("\n\n");
    return this.call("judgment", JUDGMENT_SYSTEM, user, judgmentSchema);
  }

  explain(req: ExplanationRequest) {
    const user = [fence("picks", req.picks), fence("understood_items", req.items)].join("\n\n");
    return this.call("explanation", EXPLANATION_SYSTEM, user, explanationSchema);
  }
}
