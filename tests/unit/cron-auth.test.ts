// Daily scheduler — cron auth tests (Part 3, spec section 9, test 11).
// The pure check is unit-tested here; the route itself is checked live
// (dev server + curl, no secret -> 401, wrong secret -> 401, right
// secret -> 200) because importing a Next route handler in Vitest would
// pull in the server-only Gemini module. See docs/BUILD_LOG.md Part 3.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isValidCronAuth } from "@/lib/ai/cron-auth";

const SECRET = "test-cron-secret-do-not-use-in-production";
const OLD_SECRET = process.env.CRON_SECRET;

function req(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("http://localhost:3000/api/cron/daily", { headers });
}

describe("cron auth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (OLD_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_SECRET;
  });

  it("rejects a missing Authorization header", () => {
    expect(isValidCronAuth(req())).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(isValidCronAuth(req("Bearer wrong-secret"))).toBe(false);
    expect(isValidCronAuth(req("Bearer test-cron-secret-do-not-use-in-productio"))).toBe(false);
  });

  it("rejects a non-Bearer scheme and a bare secret without the scheme", () => {
    expect(isValidCronAuth(req("Basic " + SECRET))).toBe(false);
    expect(isValidCronAuth(req(SECRET))).toBe(false);
  });

  it("accepts the exact Bearer secret", () => {
    expect(isValidCronAuth(req(`Bearer ${SECRET}`))).toBe(true);
  });

  it("fails closed when no secret is configured at all", () => {
    delete process.env.CRON_SECRET;
    expect(isValidCronAuth(req(`Bearer ${SECRET}`))).toBe(false);
    process.env.CRON_SECRET = "";
    expect(isValidCronAuth(req("Bearer anything"))).toBe(false);
  });
});

describe("cron auth edge cases", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
  });
  afterEach(() => {
    if (OLD_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_SECRET;
  });

  it("accepts a lowercase bearer scheme", () => {
    expect(isValidCronAuth(req(`bearer ${SECRET}`))).toBe(true);
    expect(isValidCronAuth(req(`BeArEr ${SECRET}`))).toBe(true);
  });

  it("accepts extra whitespace around the token, but not an empty token", () => {
    expect(isValidCronAuth(req(`Bearer  ${SECRET}`))).toBe(true);
    expect(isValidCronAuth(req(`Bearer ${SECRET} `))).toBe(true);
    expect(isValidCronAuth(req("Bearer "))).toBe(false);
    expect(isValidCronAuth(req("Bearer    "))).toBe(false);
  });

  it("is case-sensitive on the secret value itself", () => {
    expect(isValidCronAuth(req(`Bearer ${SECRET.toUpperCase()}`))).toBe(false);
    // Same letters, one changed case — still a different secret.
    const mixed = SECRET.slice(0, 5).toUpperCase() + SECRET.slice(5);
    expect(mixed).not.toBe(SECRET);
    expect(isValidCronAuth(req(`Bearer ${mixed}`))).toBe(false);
  });
});
