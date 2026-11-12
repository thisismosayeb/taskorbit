// TaskOrbit AI — rate-limit and cache-digest tests (Part 3, spec section 8).
// The digest must be stable for equal input (key order independent) and
// change when the input changes; the limits must allow under the cap and
// block at/over it; the in-memory hourly fallback must reset after an hour.

import { describe, it, expect, beforeEach } from "vitest";
import {
  computeDigest,
  stableStringify,
  userHourlyAllowed,
  workspaceDailyAllowed,
  checkMemoryHourlyLimit,
  resetMemoryLimits,
} from "@/lib/ai/limits";
import { canGenerateFeature, featuresForRole } from "@/lib/ai/features";

describe("AI cache digest", () => {
  it("is stable regardless of object key order", () => {
    const a = computeDigest({ feature: "daily_brief", data: { b: 1, a: { y: 2, x: 1 } } });
    const b = computeDigest({ feature: "daily_brief", data: { a: { x: 1, y: 2 }, b: 1 } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the input changes", () => {
    const base = { feature: "daily_brief", data: { tasks: [{ id: "t1", status: "todo" }] } };
    const changed = { feature: "daily_brief", data: { tasks: [{ id: "t1", status: "completed" }] } };
    expect(computeDigest(base)).not.toBe(computeDigest(changed));
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe("AI rate limits", () => {
  it("workspace daily limit: 29 of 30 allowed, 30 of 30 blocked", () => {
    expect(workspaceDailyAllowed(0, 30)).toBe(true);
    expect(workspaceDailyAllowed(29, 30)).toBe(true);
    expect(workspaceDailyAllowed(30, 30)).toBe(false);
    expect(workspaceDailyAllowed(31, 30)).toBe(false);
  });

  it("user hourly limit: 9 of 10 allowed, 10 of 10 blocked", () => {
    expect(userHourlyAllowed(9, 10)).toBe(true);
    expect(userHourlyAllowed(10, 10)).toBe(false);
  });

  describe("in-memory hourly fallback", () => {
    beforeEach(() => resetMemoryLimits());
    it("allows 10 calls in an hour, blocks the 11th, allows again after an hour", () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        expect(checkMemoryHourlyLimit("user-1", now + i * 1000, 10)).toBe(true);
      }
      expect(checkMemoryHourlyLimit("user-1", now + 11 * 1000, 10)).toBe(false);
      // A different user is unaffected.
      expect(checkMemoryHourlyLimit("user-2", now + 11 * 1000, 10)).toBe(true);
      // After the window passes, the counter resets.
      expect(checkMemoryHourlyLimit("user-1", now + 61 * 60 * 1000, 10)).toBe(true);
    });
  });
});

describe("AI feature role gate", () => {
  it("manager-only features reject developers and null roles", () => {
    expect(canGenerateFeature("manager", "daily_brief")).toBe(true);
    expect(canGenerateFeature("manager", "project_summary")).toBe(true);
    expect(canGenerateFeature("developer", "daily_brief")).toBe(false);
    expect(canGenerateFeature("developer", "project_summary")).toBe(false);
    expect(canGenerateFeature(null, "daily_brief")).toBe(false);
    expect(canGenerateFeature(undefined, "my_focus")).toBe(false);
  });

  it("developers may use the personal features", () => {
    expect(canGenerateFeature("developer", "my_focus")).toBe(true);
    expect(canGenerateFeature("developer", "deadline_risk")).toBe(true);
    expect(canGenerateFeature("developer", "standup")).toBe(true);
    expect(canGenerateFeature("developer", "next_actions")).toBe(true);
    expect(featuresForRole("developer")).toEqual(["my_focus", "deadline_risk", "standup", "next_actions"]);
    expect(featuresForRole("manager")).toHaveLength(6);
  });
});

describe("stableStringify edge cases", () => {
  it("preserves array order but sorts object keys at every level", () => {
    expect(stableStringify([2, 1])).toBe("[2,1]");
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
    expect(stableStringify({ b: [{ d: 4, c: 3 }], a: 1 })).toBe('{"a":1,"b":[{"c":3,"d":4}]}');
  });

  it("renders null and undefined as null, never throws", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify({ a: undefined, b: null })).toBe('{"a":null,"b":null}');
    expect(computeDigest(null)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a zero limit allows nothing", () => {
    expect(workspaceDailyAllowed(0, 0)).toBe(false);
    expect(userHourlyAllowed(0, 0)).toBe(false);
  });
});

describe("in-memory hourly fallback: blocked calls are not recorded", () => {
  beforeEach(() => resetMemoryLimits());
  it("the 11th call is blocked and stays blocked until the window passes", () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      expect(checkMemoryHourlyLimit("user-9", now + i * 1000, 10)).toBe(true);
    }
    expect(checkMemoryHourlyLimit("user-9", now + 11 * 1000, 10)).toBe(false);
    // A blocked call does not push the window forward: still blocked.
    expect(checkMemoryHourlyLimit("user-9", now + 12 * 1000, 10)).toBe(false);
    expect(checkMemoryHourlyLimit("user-9", now + 59 * 60 * 1000, 10)).toBe(false);
    // Once the first calls age out of the window, the user is allowed again.
    expect(checkMemoryHourlyLimit("user-9", now + 61 * 60 * 1000, 10)).toBe(true);
  });
});
