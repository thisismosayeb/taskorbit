// Daily scheduler — due-soon / overdue selection + idempotency tests
// (Part 3, spec section 9, test 11). The rules mirror
// run_daily_reminders() in migration 0007; the Dhaka midnight boundary
// is the point: "today" is the workspace-local date, never the UTC date.
//   - Asia/Dhaka is UTC+6: 2026-11-11 19:00 UTC is already 2026-11-12
//     in Dhaka (so a task due 2026-11-12 is due-soon then, not "today"
//     in UTC terms), and 2026-11-12 18:00 UTC is still 2026-11-13 00:00
//     in Dhaka — a task due 2026-11-12 is NOT overdue until after
//     2026-11-12 17:59:59.999 UTC (23:59:59.999 Dhaka).

import { describe, it, expect } from "vitest";
import {
  addDays,
  dailyJobKey,
  localDateInTimezone,
  selectDueSoonTasks,
  selectOverdueTasks,
  type ReminderTaskInput,
} from "@/lib/ai/cron-select";

function task(overrides: Partial<ReminderTaskInput> & { id: string }): ReminderTaskInput {
  return {
    parent_task_id: null,
    status: "todo",
    due_date: null,
    assigned_to: "user-1",
    ...overrides,
  };
}

describe("local date in the workspace timezone", () => {
  it("uses the Dhaka wall-clock date, not the UTC date", () => {
    // 2026-11-11 19:00 UTC = 2026-11-12 01:00 in Dhaka.
    expect(localDateInTimezone(new Date("2026-11-11T19:00:00Z"), "Asia/Dhaka")).toBe("2026-11-12");
    // 2026-11-12 17:59 UTC = 2026-11-12 23:59 in Dhaka — still the 12th.
    expect(localDateInTimezone(new Date("2026-11-12T17:59:00Z"), "Asia/Dhaka")).toBe("2026-11-12");
    // 2026-11-12 18:00 UTC = 2026-11-13 00:00 in Dhaka — now the 13th.
    expect(localDateInTimezone(new Date("2026-11-12T18:00:00Z"), "Asia/Dhaka")).toBe("2026-11-13");
    expect(localDateInTimezone(new Date("2026-11-12T18:00:00Z"), "UTC")).toBe("2026-11-12");
  });

  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-11-12", -1)).toBe("2026-11-11");
  });
});

describe("due-soon selection", () => {
  const localDate = "2026-11-12";
  const tasks = [
    task({ id: "due-today", due_date: "2026-11-12" }),
    task({ id: "due-tomorrow", due_date: "2026-11-13" }),
    task({ id: "due-day-after", due_date: "2026-11-14" }),
    task({ id: "due-yesterday", due_date: "2026-11-11" }),
    task({ id: "completed-today", due_date: "2026-11-12", status: "completed" }),
    task({ id: "unassigned", due_date: "2026-11-12", assigned_to: null }),
    task({ id: "no-deadline", due_date: null }),
    task({ id: "subtask-due-today", due_date: "2026-11-12", parent_task_id: "parent-1" }),
  ];

  it("picks tasks due today or tomorrow only, top-level, open, assigned", () => {
    const picked = selectDueSoonTasks(tasks, localDate).map((t) => t.id);
    expect(picked).toEqual(["due-today", "due-tomorrow"]);
  });

  it("at 19:00 UTC on the 11th (already the 12th in Dhaka), the 12th-due task is due-soon", () => {
    const dhakaDate = localDateInTimezone(new Date("2026-11-11T19:00:00Z"), "Asia/Dhaka");
    expect(dhakaDate).toBe("2026-11-12");
    const picked = selectDueSoonTasks(tasks, dhakaDate).map((t) => t.id);
    expect(picked).toContain("due-today");
  });
});

describe("overdue selection", () => {
  const localDate = "2026-11-12";
  const tasks = [
    task({ id: "overdue-1", due_date: "2026-11-11" }),
    task({ id: "overdue-2", due_date: "2026-11-10" }),
    task({ id: "due-today", due_date: "2026-11-12" }),
    task({ id: "due-tomorrow", due_date: "2026-11-13" }),
    task({ id: "completed-overdue", due_date: "2026-11-11", status: "completed" }),
    task({ id: "unassigned-overdue", due_date: "2026-11-11", assigned_to: null }),
    task({ id: "subtask-overdue", due_date: "2026-11-11", parent_task_id: "parent-1" }),
  ];

  it("picks only tasks whose due date has passed (due today is not overdue)", () => {
    const picked = selectOverdueTasks(tasks, localDate, new Set()).map((t) => t.id);
    expect(picked).toEqual(["overdue-1", "overdue-2"]);
  });

  it("never re-notifies a task that already had an overdue notification", () => {
    const picked = selectOverdueTasks(tasks, localDate, new Set(["overdue-1"])).map((t) => t.id);
    expect(picked).toEqual(["overdue-2"]);
  });

  it("across the Dhaka midnight boundary: at 17:59 UTC on the 12th the 12th-due task is still not overdue; at 18:00 UTC it is", () => {
    const before = localDateInTimezone(new Date("2026-11-12T17:59:00Z"), "Asia/Dhaka");
    expect(selectOverdueTasks(tasks, before, new Set()).map((t) => t.id)).not.toContain("due-today");
    const after = localDateInTimezone(new Date("2026-11-12T18:00:00Z"), "Asia/Dhaka");
    expect(after).toBe("2026-11-13");
    expect(selectOverdueTasks(tasks, after, new Set()).map((t) => t.id)).toContain("due-today");
  });
});

describe("cron idempotency key", () => {
  it("is unique per workspace + job + local date, and stable", () => {
    const key = dailyJobKey("ws-1", "daily_reminders", "2026-11-12");
    expect(key).toBe("ws-1:daily_reminders:2026-11-12");
    expect(dailyJobKey("ws-1", "daily_reminders", "2026-11-12")).toBe(key);
    expect(dailyJobKey("ws-1", "daily_reminders", "2026-11-13")).not.toBe(key);
    expect(dailyJobKey("ws-2", "daily_reminders", "2026-11-12")).not.toBe(key);
    expect(dailyJobKey("ws-1", "daily_brief", "2026-11-12")).not.toBe(key);
  });
});

describe("due-soon / overdue: every open status counts", () => {
  const localDate = "2026-11-12";
  const byStatus = (status: ReminderTaskInput["status"]) =>
    task({ id: `st-${status}`, due_date: "2026-11-12", status });

  it("due-soon includes in_progress and in_review, not only todo", () => {
    const picked = selectDueSoonTasks(
      [byStatus("todo"), byStatus("in_progress"), byStatus("in_review"), byStatus("completed")],
      localDate,
    ).map((t) => t.id);
    expect(picked).toEqual(["st-todo", "st-in_progress", "st-in_review"]);
  });

  it("overdue includes in_progress and in_review tasks whose date has passed", () => {
    const picked = selectOverdueTasks(
      [
        { ...byStatus("in_progress"), due_date: "2026-11-11" },
        { ...byStatus("in_review"), due_date: "2026-11-11" },
        { ...byStatus("completed"), due_date: "2026-11-11" },
      ],
      localDate,
      new Set(),
    ).map((t) => t.id);
    expect(picked).toEqual(["st-in_progress", "st-in_review"]);
  });
});

describe("date helpers across year boundaries", () => {
  it("addDays crosses the year boundary both ways", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("due-soon at 18:00 UTC on the 11th (already the 12th in Dhaka) picks the 13th-due task too", () => {
    const dhakaDate = localDateInTimezone(new Date("2026-11-11T18:00:00Z"), "Asia/Dhaka");
    expect(dhakaDate).toBe("2026-11-12");
    const tasks = [
      task({ id: "due-today", due_date: "2026-11-12" }),
      task({ id: "due-tomorrow", due_date: "2026-11-13" }),
      task({ id: "due-day-after", due_date: "2026-11-14" }),
    ];
    expect(selectDueSoonTasks(tasks, dhakaDate).map((t) => t.id)).toEqual([
      "due-today",
      "due-tomorrow",
    ]);
  });
});
