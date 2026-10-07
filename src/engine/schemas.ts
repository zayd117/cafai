// JSON Schemas for the three model calls (plan §9: schema-bound). Code re-checks meaning (ids, quotes) after shape.
import { createAjv } from "@/lib/ajv";

const shortText = { type: "string", minLength: 1, maxLength: 400 };
const id = { type: "string", pattern: "^[A-Za-z0-9_#:.-]{1,80}$" };

export const understandingSchema = {
  type: "object",
  additionalProperties: false,
  required: ["in_scope", "confidence", "items", "concepts", "needs", "clarifying_question"],
  properties: {
    in_scope: { type: "boolean" },
    confidence: { enum: ["high", "medium", "low"] },
    items: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "text", "quote"],
        properties: {
          id,
          kind: { enum: ["goal", "task", "problem", "environment", "constraint", "current_tool", "interest", "possible_need"] },
          text: shortText,
          quote: { type: "string", maxLength: 1000 },
          tag: { type: "string", minLength: 1, maxLength: 60 },
          suggestions: { type: "array", maxItems: 5, items: { type: "string", minLength: 1, maxLength: 60 } },
        },
      },
    },
    concepts: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "capability_id"],
        properties: { term: { type: "string", minLength: 1, maxLength: 80 }, capability_id: { anyOf: [id, { type: "null" }] } },
      },
    },
    needs: {
      type: "array",
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["capability_id", "need_type", "evidence_ids"],
        properties: {
          capability_id: id,
          need_type: { enum: ["stated", "implied", "latent", "present", "not_relevant"] },
          evidence_ids: { type: "array", maxItems: 10, items: id },
          signal_id: id,
          reason: shortText,
        },
      },
    },
    clarifying_question: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["text", "options"],
          properties: { text: shortText, options: { type: "array", maxItems: 4, items: { type: "string", minLength: 1, maxLength: 80 } } },
        },
      ],
    },
  },
} as const;

export const judgmentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["judgments"],
  properties: {
    judgments: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offering_id", "capability_id", "intent_fit", "intent_quote", "requirements_met", "fired_signal_ids", "evidence_enough"],
        properties: {
          offering_id: id,
          capability_id: id,
          intent_fit: { enum: ["direct", "partial", "none"] },
          intent_quote: { type: "string", maxLength: 400 },
          requirements_met: { enum: ["yes", "partly", "no", "unknown"] },
          fired_signal_ids: { type: "array", maxItems: 10, items: id },
          evidence_enough: { type: "boolean" },
        },
      },
    },
  },
} as const;

export const explanationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["explanations"],
  properties: {
    explanations: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["offering_id", "why", "evidence_ids", "how_it_helps", "do_you_need_it", "skip_if", "summary"],
        properties: {
          offering_id: id,
          why: shortText,
          evidence_ids: { type: "array", minItems: 1, maxItems: 5, items: id },
          how_it_helps: shortText,
          do_you_need_it: shortText,
          skip_if: shortText,
          summary: shortText,
        },
      },
    },
  },
} as const;

const ajv = createAjv();
export const validateUnderstanding = ajv.compile(understandingSchema);
export const validateJudgment = ajv.compile(judgmentSchema);
export const validateExplanation = ajv.compile(explanationSchema);
