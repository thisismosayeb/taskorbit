// Locale-aware formatting and translation (Part 3, §§6–7): dates, numbers
// and deadline/activity labels render in the selected locale, and user
// content is never translated.
import { describe, expect, it } from "vitest";
import { createTranslator } from "@/lib/i18n";
import {
  formatDateShortLocale,
  formatDateTimeLocale,
  formatDayMonthLocale,
  formatMonthYearLocale,
  formatNumberLocale,
} from "@/lib/i18n/format";
import {
  calendarDaysUntil,
  getDeadlineLegend,
  getDeadlineState,
} from "@/lib/date/deadline";
import { describeActivity } from "@/lib/activity/format";
import type { ActivityLog, TaskStatus } from "@/types";

const TZ = "Asia/Dhaka";
// Due 2026-11-12 (cutoff 23:59:59.999 Dhaka).
const DUE = "2026-11-12";

function task(overrides: {
  status?: TaskStatus;
  due_date?: string | null;
  completed_at?: string | null;
}) {
  return {
    status: overrides.status ?? "in_progress",
    due_date: "due_date" in overrides ? overrides.due_date! : DUE,
    completed_at: overrides.completed_at ?? null,
  };
}

describe("createTranslator", () => {
  it("returns Bangla labels for the bn locale and English for en", () => {
    expect(createTranslator("bn")("deadline.overdue")).toBe("মেয়াদোত্তীর্ণ");
    expect(createTranslator("bn")("deadline.noDeadline")).toBe("কোনো সময়সীমা নেই");
    expect(createTranslator("en")("deadline.overdue")).toBe("Overdue");
  });
});

describe("formatNumberLocale", () => {
  it("uses Latin digits in English and Bengali digits in Bangla", () => {
    expect(formatNumberLocale(12, "en")).toBe("12");
    expect(formatNumberLocale(12, "bn")).toBe("১২");
    expect(formatNumberLocale(1000, "bn")).toBe("১,০০০");
  });
});

describe("formatDateShortLocale / formatDateTimeLocale", () => {
  const date = new Date("2026-11-12T06:00:00Z"); // 12:00 Dhaka
  it("renders the same calendar date in both locales, digits localized", () => {
    expect(formatDateShortLocale(date, "en")).toBe("12 Nov 2026");
    const bn = formatDateShortLocale(date, "bn");
    expect(bn).toContain("১২");
    // bn-BD short month is "নভে" (the full form is "নভেম্বর").
    expect(bn).toContain("নভে");
    expect(bn).toContain("২০২৬");
  });

  it("renders the time in the workspace timezone in both locales", () => {
    const en = formatDateTimeLocale(date, "en", TZ);
    expect(en).toContain("12 Nov 2026");
    expect(en).toContain("12:00");
    const bn = formatDateTimeLocale(date, "bn", TZ);
    expect(bn).toContain("১২");
    expect(bn).toContain("নভে");
  });
});

describe("calendarDaysUntil (Deadline Radar day count)", () => {
  it("counts calendar days in the workspace timezone, locale-independent", () => {
    const now = new Date("2026-11-12T03:00:00Z"); // 09:00 Dhaka, 12 Nov
    expect(calendarDaysUntil("2026-11-12", TZ, now)).toBe(0);
    expect(calendarDaysUntil("2026-11-13", TZ, now)).toBe(1);
    expect(calendarDaysUntil("2026-11-15", TZ, now)).toBe(3);
    expect(calendarDaysUntil("2026-11-10", TZ, now)).toBe(-2);
  });
});

describe("getDeadlineState with locale", () => {
  // 2026-11-13 03:00Z = 09:00 Dhaka on 13 Nov: the 12 Nov due date is past.
  const afterCutoff = new Date("2026-11-13T03:00:00Z");
  it("labels an overdue task in Bangla without changing the state", () => {
    // The chip label carries the duration (deadline.overdueBy); the bare
    // "Overdue" word is only the legend/group label. The duration's digit
    // stays Latin: t() substitutes params verbatim (see i18n.test.ts).
    const result = getDeadlineState(task({}), TZ, afterCutoff, "bn");
    expect(result.state).toBe("red");
    expect(result.label).toBe("9 ঘণ্টা মেয়াদোত্তীর্ণ");
    expect(getDeadlineState(task({}), TZ, afterCutoff, "en").label).toBe("Overdue by 9 hours");
  });

  it("labels a task due in 2 days in Bangla", () => {
    const before = new Date("2026-11-10T03:00:00Z");
    expect(getDeadlineState(task({}), TZ, before, "bn").label).toBe("2 দিন বাকি");
    expect(getDeadlineState(task({}), TZ, before, "en").label).toBe("Due in 2 days");
    // "On track" is the legend word for the neutral state, not the chip.
    expect(getDeadlineLegend("bn").find((l) => l.state === "neutral")?.label).toBe("সঠিক পথে আছে");
  });

  it("the Bangla legend matches getDeadlineLegend('bn')", () => {
    const legend = getDeadlineLegend("bn");
    expect(legend.map((l) => l.label)).toEqual(
      expect.arrayContaining(["সময়ে শেষ হয়েছে", "মেয়াদোত্তীর্ণ", "সঠিক পথে আছে"]),
    );
    expect(getDeadlineLegend("en")[0].label).toBe("Completed on time");
  });
});

describe("describeActivity with locale", () => {
  function log(action: string, metadata: Record<string, unknown>): ActivityLog {
    return {
      id: "log-1",
      workspace_id: "ws-1",
      project_id: "proj-1",
      task_id: "task-1",
      actor_id: "user-1",
      action,
      metadata: metadata as ActivityLog["metadata"],
      created_at: "2026-11-12T12:00:00Z",
    };
  }

  it("translates the action words but never the user-created title", () => {
    const bn = describeActivity(
      log("task.completed", { title: "Design homepage" }),
      undefined,
      "bn",
    );
    expect(bn.actionText).toBe("টাস্ক শেষ করেছেন");
    // The user's own title is shown exactly as written.
    expect(bn.objectLabel).toBe("Design homepage");
  });
});

describe("formatMonthYearLocale / formatDayMonthLocale", () => {
  const date = new Date("2026-11-12T06:00:00Z"); // 12:00 Dhaka
  it("renders month + year in both locales", () => {
    expect(formatMonthYearLocale(date, "en")).toBe("November 2026");
    expect(formatMonthYearLocale(date, "bn")).toBe("নভেম্বর ২০২৬");
  });

  it("renders day + month without the year in both locales", () => {
    expect(formatDayMonthLocale(date, "en")).toBe("12 Nov");
    expect(formatDayMonthLocale(date, "bn")).toBe("১২ নভে");
  });

  it("respects an explicit timezone for the calendar date", () => {
    // 2026-11-12 01:00 UTC is still 2026-11-11 in America/New_York.
    const early = new Date("2026-11-12T01:00:00Z");
    expect(formatDayMonthLocale(early, "en", "America/New_York")).toBe("11 Nov");
    expect(formatDayMonthLocale(early, "en", "Asia/Dhaka")).toBe("12 Nov");
  });
});

describe("formatNumberLocale edge cases", () => {
  it("renders zero and decimals with localized digits", () => {
    expect(formatNumberLocale(0, "en")).toBe("0");
    expect(formatNumberLocale(0, "bn")).toBe("০");
    expect(formatNumberLocale(3.5, "en")).toBe("3.5");
    expect(formatNumberLocale(3.5, "bn")).toBe("৩.৫");
  });

  it("groups large numbers per locale (bn-BD uses South-Asian grouping)", () => {
    expect(formatNumberLocale(1234567, "en")).toBe("1,234,567");
    expect(formatNumberLocale(1234567, "bn")).toBe("১২,৩৪,৫৬৭");
  });
});
