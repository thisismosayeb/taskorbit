// Calendar date helpers (lib/calendar.ts).
//
// The timezone tests use the Asia/Dhaka vs UTC midnight boundary:
// 18:30 UTC is 00:30 the next day in Dhaka (UTC+6), so the same instant
// falls on different calendar dates — and sometimes different ISO weeks —
// depending on the timezone. That is exactly what "dates calculated in
// the workspace timezone" has to get right.

import { describe, expect, it } from "vitest";
import {
  addDays,
  assignLanes,
  bucketEventsByDate,
  completedPerWeek,
  dateInTimezone,
  daysInMonth,
  eventSpanDays,
  isoWeekKey,
  mondayOfIsoWeek,
  monthGrid,
  todayInTimezone,
  weekContaining,
  weekStart,
} from "@/lib/calendar";

describe("todayInTimezone / dateInTimezone — Dhaka/UTC midnight boundary", () => {
  it("18:30 UTC is the next day in Dhaka (00:30) but the same day in UTC", () => {
    const instant = new Date("2026-11-11T18:30:00Z");
    expect(dateInTimezone(instant, "Asia/Dhaka")).toBe("2026-11-12");
    expect(dateInTimezone(instant, "UTC")).toBe("2026-11-11");
  });

  it("17:59:59 UTC is still the same day in Dhaka (23:59:59)", () => {
    expect(dateInTimezone(new Date("2026-11-11T17:59:59Z"), "Asia/Dhaka")).toBe("2026-11-11");
    expect(todayInTimezone("Asia/Dhaka", new Date("2026-11-11T17:59:59Z"))).toBe("2026-11-11");
  });

  it("midnight UTC is 06:00 in Dhaka on the same date", () => {
    expect(dateInTimezone(new Date("2026-11-12T00:00:00Z"), "Asia/Dhaka")).toBe("2026-11-12");
  });
});

describe("monthGrid", () => {
  it("November 2026 starts on a Sunday, so the Monday-first grid starts Mon 26 Oct", () => {
    const weeks = monthGrid(2026, 11);
    expect(weeks[0][0]).toBe("2026-10-26");
    expect(weeks[0][6]).toBe("2026-11-01");
    expect(weeks.length).toBe(6);
    for (const week of weeks) expect(week).toHaveLength(7);
    expect(weeks.flat()).toContain("2026-11-30");
    expect(weeks.flat()).toContain("2026-12-06");
  });

  it("February 2026 (28 days, starts Sunday) fits in 5 weeks", () => {
    const weeks = monthGrid(2026, 2);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-01-26");
    expect(weeks[4][6]).toBe("2026-03-01");
  });

  it("daysInMonth handles leap years", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2026, 11)).toBe(30);
  });
});

describe("weekContaining / weekStart", () => {
  it("Thursday 12 Nov 2026 sits in Mon 9 – Sun 15 Nov", () => {
    expect(weekContaining("2026-11-12")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    expect(weekStart("2026-11-12")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
  });

  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });
});

describe("isoWeekKey", () => {
  it("1 Jan 2026 is a Thursday, so it is week 1 of 2026", () => {
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01");
  });

  it("2026 has 53 ISO weeks: 31 Dec 2026 and 1 Jan 2027 are both W53", () => {
    expect(isoWeekKey("2026-12-31")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2027-01-04")).toBe("2027-W01");
  });

  it("12 Nov 2026 is week 46", () => {
    expect(isoWeekKey("2026-11-12")).toBe("2026-W46");
    expect(mondayOfIsoWeek(2026, 46)).toBe("2026-11-09");
  });
});

describe("completedPerWeek — timezone boundary changes the week", () => {
  it("an instant on Sunday evening UTC is Monday morning in Dhaka, so it counts in different weeks", () => {
    // 2026-11-08T18:30Z = 2026-11-09 00:30 Dhaka (Mon, W46) but 2026-11-08 UTC (Sun, W45).
    const tasks = [{ status: "completed", completed_at: "2026-11-08T18:30:00.000Z" }];
    expect(completedPerWeek(tasks, "Asia/Dhaka")).toEqual([
      { weekKey: "2026-W46", weekStart: "2026-11-09", count: 1 },
    ]);
    expect(completedPerWeek(tasks, "UTC")).toEqual([
      { weekKey: "2026-W45", weekStart: "2026-11-02", count: 1 },
    ]);
  });

  it("counts per week, ignores incomplete tasks and missing completed_at", () => {
    const tasks = [
      { status: "completed", completed_at: "2026-11-09T06:00:00.000Z" },
      { status: "completed", completed_at: "2026-11-10T06:00:00.000Z" },
      { status: "completed", completed_at: "2026-11-17T06:00:00.000Z" },
      { status: "in_progress", completed_at: null },
      { status: "completed", completed_at: null },
    ];
    expect(completedPerWeek(tasks, "Asia/Dhaka")).toEqual([
      { weekKey: "2026-W46", weekStart: "2026-11-09", count: 2 },
      { weekKey: "2026-W47", weekStart: "2026-11-16", count: 1 },
    ]);
  });
});

describe("bucketEventsByDate", () => {
  it("groups by due date and skips events without one", () => {
    const events = [
      { id: "a", due_date: "2026-11-12" },
      { id: "b", due_date: "2026-11-12" },
      { id: "c", due_date: "2026-11-13" },
      { id: "d", due_date: null },
    ];
    const buckets = bucketEventsByDate(events);
    expect([...buckets.keys()].sort()).toEqual(["2026-11-12", "2026-11-13"]);
    expect(buckets.get("2026-11-12")!.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("eventSpanDays", () => {
  it("returns the span only when both dates exist", () => {
    expect(eventSpanDays({ start_date: "2026-11-10", due_date: "2026-11-20" })).toEqual({
      start: "2026-11-10",
      end: "2026-11-20",
    });
    expect(eventSpanDays({ start_date: null, due_date: "2026-11-20" })).toBeNull();
    expect(eventSpanDays({ start_date: "2026-11-10", due_date: null })).toBeNull();
  });

  it("normalises a reversed span", () => {
    expect(eventSpanDays({ start_date: "2026-11-20", due_date: "2026-11-10" })).toEqual({
      start: "2026-11-10",
      end: "2026-11-20",
    });
  });
});

describe("assignLanes", () => {
  const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

  it("non-overlapping events share lane 0", () => {
    const lanes = assignLanes(
      [
        { id: "a", start: "2026-11-09", end: "2026-11-10" },
        { id: "b", start: "2026-11-11", end: "2026-11-12" },
      ],
      week,
    );
    expect(lanes).toEqual([
      { id: "a", lane: 0, startCol: 1, span: 2 },
      { id: "b", lane: 0, startCol: 3, span: 2 },
    ]);
  });

  it("overlapping events stack into separate lanes", () => {
    const lanes = assignLanes(
      [
        { id: "a", start: "2026-11-09", end: "2026-11-11" },
        { id: "b", start: "2026-11-10", end: "2026-11-12" },
        { id: "c", start: "2026-11-10", end: "2026-11-10" },
      ],
      week,
    );
    expect(lanes.map((l) => l.lane)).toEqual([0, 1, 2]);
  });

  it("clamps spans to the week", () => {
    const lanes = assignLanes(
      [
        { id: "a", start: "2026-11-07", end: "2026-11-10" },
        { id: "b", start: "2026-11-14", end: "2026-11-20" },
      ],
      week,
    );
    expect(lanes).toEqual([
      { id: "a", lane: 0, startCol: 1, span: 2 },
      { id: "b", lane: 0, startCol: 6, span: 2 },
    ]);
  });
});
