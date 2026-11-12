import { describe, expect, it } from "vitest";
import { formatRelativeTime, formatExactTime } from "@/lib/date/relative";

const NOW = new Date("2026-11-12T12:00:00Z");

describe("formatRelativeTime", () => {
  it("says just now within a minute", () => {
    expect(formatRelativeTime("2026-11-12T11:59:30Z", NOW)).toBe("just now");
  });

  it("says just now for future timestamps", () => {
    expect(formatRelativeTime("2026-11-12T12:00:30Z", NOW)).toBe("just now");
  });

  it("counts minutes", () => {
    expect(formatRelativeTime("2026-11-12T11:55:00Z", NOW)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-11-12T11:59:00Z", NOW)).toBe("1 minute ago");
  });

  it("counts hours", () => {
    expect(formatRelativeTime("2026-11-12T10:00:00Z", NOW)).toBe("2 hours ago");
    expect(formatRelativeTime("2026-11-12T11:00:00Z", NOW)).toBe("1 hour ago");
  });

  it("says Yesterday for one day ago", () => {
    expect(formatRelativeTime("2026-11-11T12:00:00Z", NOW)).toBe("Yesterday");
  });

  it("counts days under a week", () => {
    expect(formatRelativeTime("2026-11-09T12:00:00Z", NOW)).toBe("3 days ago");
  });

  it("falls back to a short date after a week", () => {
    expect(formatRelativeTime("2026-11-01T12:00:00Z", NOW)).toBe("1 Nov 2026");
  });
});

describe("formatExactTime", () => {
  it("formats in the given timezone", () => {
    // 12:00 UTC is 18:00 in Asia/Dhaka.
    expect(formatExactTime("2026-11-12T12:00:00Z", "Asia/Dhaka")).toBe("12 Nov 2026, 18:00");
    expect(formatExactTime("2026-11-12T12:00:00Z", "UTC")).toBe("12 Nov 2026, 12:00");
  });
});
