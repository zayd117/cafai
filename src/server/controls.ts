// Runtime checks for quotas, the global AI budget and kill switches (plan §14, §17).
import { createHash } from "node:crypto";
import type pg from "pg";
import { CONTROLS, FLAG } from "@/config/controls";

export interface Flags {
  aiOff: boolean;
  runsOff: boolean;
  revoked: Set<string>;
}

/** Flag rows are read on each request (§17): manual, but instant. */
export async function readFlags(pool: pg.Pool): Promise<Flags> {
  const r = await pool.query<{ key: string; enabled: boolean }>("SELECT key, enabled FROM flags WHERE enabled");
  const on = new Set(r.rows.map((x) => x.key));
  return {
    aiOff: on.has(FLAG.aiOff),
    runsOff: on.has(FLAG.runsOff),
    revoked: new Set([...on].filter((k) => k.startsWith(FLAG.revokePrefix)).map((k) => k.slice(FLAG.revokePrefix.length))),
  };
}

/** Salted hash so raw client addresses are never stored (§12). The salt is a server secret. */
export function clientKey(kind: "ip", raw: string, salt = process.env.QUOTA_SALT): string {
  if (!salt) throw new Error("QUOTA_SALT is not set");
  return `${kind}:${createHash("sha256").update(salt + "|" + raw).digest("hex")}`;
}

export async function hitQuota(pool: pg.Pool, key: string, now = new Date()): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const windowStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const r = await pool.query<{ quota_hit: number }>("SELECT quota_hit($1, $2)", [key, windowStart]);
  const count = r.rows[0]!.quota_hit;
  return { allowed: count <= CONTROLS.runsPerHourPerClient, retryAfterSec: Math.ceil((windowStart.getTime() + 3_600_000 - now.getTime()) / 1000) };
}

/** Global daily budget with a circuit breaker (§14): when spent, no model calls today. */
export async function budgetSpent(pool: pg.Pool): Promise<boolean> {
  const r = await pool.query<{ spend_today_micros: string }>("SELECT spend_today_micros()");
  return Number(r.rows[0]!.spend_today_micros) >= CONTROLS.dailyAiBudgetUsd * 1_000_000;
}
