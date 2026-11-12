// TaskOrbit AI — rate limits + cache digests (Part 3, spec section 8).
//
// Pure helpers (unit-tested): a stable SHA-256 digest of the minimised
// input (cache reuse when the digest is unchanged) and the limit checks.
// The durable counters live in ai_usage (migration 0007); the in-memory
// per-user hourly counter below is the fallback when that table is not
// available yet (migration not applied), so limits still apply.

import { createHash } from "node:crypto";

/** Stable JSON: object keys sorted recursively, so equal input always hashes equal. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** SHA-256 hex of the canonical input JSON. */
export function computeDigest(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

/** Workspace daily limit: allowed while today's calls are under the cap. */
export function workspaceDailyAllowed(callsToday: number, limit: number): boolean {
  return callsToday < limit;
}

/** Per-user hourly limit: allowed while the last hour's calls are under the cap. */
export function userHourlyAllowed(callsLastHour: number, limit: number): boolean {
  return callsLastHour < limit;
}

// ---------------------------------------------------------------------------
// In-memory per-user hourly counter (fallback when ai_usage is unavailable).
// Best-effort only: it lives in one server process, so it is a backstop,
// not the source of truth — the ai_usage ledger is authoritative.
// ---------------------------------------------------------------------------

const memoryCalls = new Map<string, number[]>();

/** Record a call and say whether the user is still within their hourly limit. */
export function checkMemoryHourlyLimit(userId: string, nowMs: number, limit: number): boolean {
  const key = userId;
  const windowStart = nowMs - 60 * 60 * 1000;
  const recent = (memoryCalls.get(key) ?? []).filter((t) => t > windowStart);
  if (recent.length >= limit) {
    memoryCalls.set(key, recent);
    return false;
  }
  recent.push(nowMs);
  memoryCalls.set(key, recent);
  return true;
}

/** Test hook: clear the in-memory counters. */
export function resetMemoryLimits(): void {
  memoryCalls.clear();
}
