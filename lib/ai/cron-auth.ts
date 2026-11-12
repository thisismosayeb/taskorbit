// Daily scheduler — CRON_SECRET check (Part 3, spec section 9).
//
// The /api/cron/daily route requires `Authorization: Bearer <secret>`.
// Missing, wrong or unconfigured secret -> 401, fail closed. Compared
// with a constant-time equality so the check does not leak the secret
// through timing.

import { timingSafeEqual } from "node:crypto";

/** True only when the request carries the exact configured CRON_SECRET. */
export function isValidCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim().length === 0) return false;
  const header = request.headers.get("authorization");
  if (!header) return false;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const provided = match[1]?.trim() ?? "";
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
