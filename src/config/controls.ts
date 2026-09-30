// Abuse and cost controls (plan §14 risk 5, §24 must-have). EVERY DEFAULT IS A PLACEHOLDER: the plan gives no run cap
// (wireframe [RUN CAP]) and no daily budget; §22 estimates $90–120 a month for 1,000 users × 3 runs (REGISTER A-032).
// Overridable per environment (tests use higher caps).
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
export const CONTROLS = {
  runsPerHourPerClient: num(process.env.CAFAI_RUNS_PER_HOUR, 10),
  dailyAiBudgetUsd: num(process.env.CAFAI_DAILY_AI_BUDGET_USD, 5),
} as const;

// Kill switches (plan §14 incident response, §17 flag rows read on each request).
export const FLAG = {
  aiOff: "ai_off", // no model calls: deterministic rules and template explanations only
  runsOff: "runs_off", // stop new runs entirely
  revokePrefix: "revoke:", // "revoke:<offering_id>": never recommend, annotate old runs, hide setup
} as const;
