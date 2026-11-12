import { describe, expect, it } from "vitest";
import {
  completedPerWeek,
  dateInTimezone,
  deadlineHealth,
  projectProgressRows,
  statusDistribution,
  tasksByPriority,
  weekLabel,
  weekStartKey,
  workloadByMember,
  type AnalyticsTaskInput,
} from "@/lib/analytics";
import type { Priority, Project, TaskStatus } from "@/types";

const TZ = "Asia/Dhaka";

function task(
  overrides: Partial<AnalyticsTaskInput> & { id: string },
): AnalyticsTaskInput {
  return {
    project_id: "p1",
    parent_task_id: null,
    status: "todo",
    priority: "medium",
    assigned_to: null,
    due_date: null,
    completed_at: null,
    ...overrides,
  };
}

function project(overrides: Partial<Project> & { id: string }): Project {
  return {
    workspace_id: "w1",
    name: "Project",
    description: null,
    status: "active",
    priority: "medium",
    start_date: null,
    due_date: null,
    created_by: "u1",
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  } as Project;
}

describe("statusDistribution", () => {
  it("counts top-level tasks per status and ignores subtasks", () => {
    const rows = statusDistribution([
      task({ id: "a", status: "todo" }),
      task({ id: "b", status: "in_progress" }),
      task({ id: "c", status: "completed" }),
      task({ id: "d", status: "completed", parent_task_id: "c" }),
    ]);
    expect(rows.find((r) => r.status === "todo")?.count).toBe(1);
    expect(rows.find((r) => r.status === "in_progress")?.count).toBe(1);
    expect(rows.find((r) => r.status === "in_review")?.count).toBe(0);
    expect(rows.find((r) => r.status === "completed")?.count).toBe(1);
  });

  it("returns all four statuses for an empty list", () => {
    const rows = statusDistribution([]);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.count === 0)).toBe(true);
  });
});

describe("deadlineHealth", () => {
  // Now: 2026-11-12 12:00 Dhaka = 06:00 UTC.
  const now = new Date("2026-11-12T06:00:00Z");
  it("buckets by getDeadlineState: on time / late / overdue / on track / none", () => {
    const rows = deadlineHealth(
      [
        // Completed 2026-11-10, due 2026-11-11 -> on time.
        task({ id: "a", status: "completed", due_date: "2026-11-11", completed_at: "2026-11-10T10:00:00Z" }),
        // Completed 2026-11-12 08:00 UTC, due 2026-11-11 (cutoff 2026-11-11 17:59:59Z) -> late.
        task({ id: "b", status: "completed", due_date: "2026-11-11", completed_at: "2026-11-12T08:00:00Z" }),
        // Open, due 2026-11-11 -> overdue.
        task({ id: "c", status: "todo", due_date: "2026-11-11" }),
        // Open, due 2026-11-20 -> on track.
        task({ id: "d", status: "in_progress", due_date: "2026-11-20" }),
        // No due date.
        task({ id: "e", status: "todo", due_date: null }),
      ],
      TZ,
      now,
    );
    const get = (key: string) => rows.find((r) => r.key === key)?.count;
    expect(get("on_time")).toBe(1);
    expect(get("completed_late")).toBe(1);
    expect(get("overdue")).toBe(1);
    expect(get("on_track")).toBe(1);
    expect(get("no_deadline")).toBe(1);
  });

  it("a completed task with no due date is 'No deadline', never late", () => {
    const rows = deadlineHealth(
      [task({ id: "a", status: "completed", due_date: null, completed_at: "2026-11-10T10:00:00Z" })],
      TZ,
      now,
    );
    expect(rows.find((r) => r.key === "no_deadline")?.count).toBe(1);
    expect(rows.find((r) => r.key === "completed_late")?.count).toBe(0);
  });
});

describe("tasksByPriority", () => {
  it("counts top-level tasks per priority", () => {
    const rows = tasksByPriority([
      task({ id: "a", priority: "urgent" }),
      task({ id: "b", priority: "high" }),
      task({ id: "c", priority: "high" }),
      task({ id: "d", priority: "low", parent_task_id: "a" }),
    ]);
    expect(rows.find((r) => r.priority === "urgent")?.count).toBe(1);
    expect(rows.find((r) => r.priority === "high")?.count).toBe(2);
    expect(rows.find((r) => r.priority === "medium")?.count).toBe(0);
    expect(rows.find((r) => r.priority === "low")?.count).toBe(0);
  });
});

describe("weekStartKey / dateInTimezone / weekLabel", () => {
  it("weeks start on Monday", () => {
    // 2026-11-12 is a Thursday; its Monday is 2026-11-09.
    expect(weekStartKey(new Date("2026-11-12T06:00:00Z"), TZ)).toBe("2026-11-09");
    // A Monday stays itself.
    expect(weekStartKey(new Date("2026-11-09T00:00:00Z"), TZ)).toBe("2026-11-09");
    // A Sunday belongs to the Monday before it.
    expect(weekStartKey(new Date("2026-11-15T06:00:00Z"), TZ)).toBe("2026-11-09");
  });

  it("uses the workspace timezone, not UTC: Sunday 23:30 UTC is Monday in Dhaka", () => {
    // 2026-11-15 23:30 UTC = 2026-11-16 05:30 in Dhaka (Monday).
    expect(dateInTimezone(new Date("2026-11-15T23:30:00Z"), TZ)).toBe("2026-11-16");
    expect(weekStartKey(new Date("2026-11-15T23:30:00Z"), TZ)).toBe("2026-11-16");
    // Same instant in UTC would still be the week of 2026-11-09.
    expect(weekStartKey(new Date("2026-11-15T23:30:00Z"), "UTC")).toBe("2026-11-09");
  });

  it("labels a Monday like '9 Nov'", () => {
    expect(weekLabel("2026-11-09")).toBe("9 Nov");
  });
});

describe("completedPerWeek", () => {
  const now = new Date("2026-11-12T06:00:00Z"); // Thursday of the week starting Mon 9 Nov 2026.

  it("buckets completions by workspace-timezone week", () => {
    const buckets = completedPerWeek(
      [
        task({ id: "a", status: "completed", completed_at: "2026-11-10T10:00:00Z" }),
        task({ id: "b", status: "completed", completed_at: "2026-11-11T10:00:00Z" }),
        // Previous week (Mon 2 Nov).
        task({ id: "c", status: "completed", completed_at: "2026-11-03T10:00:00Z" }),
      ],
      TZ,
      now,
    );
    expect(buckets).toEqual([
      { weekStart: "2026-11-02", label: "2 Nov", completed: 1 },
      { weekStart: "2026-11-09", label: "9 Nov", completed: 2 },
    ]);
  });

  it("shows only weeks that exist: no padding before the first completion", () => {
    const buckets = completedPerWeek(
      [task({ id: "a", status: "completed", completed_at: "2026-11-10T10:00:00Z" })],
      TZ,
      now,
    );
    // Only the current week exists — no invented zero weeks before it.
    expect(buckets).toEqual([{ weekStart: "2026-11-09", label: "9 Nov", completed: 1 }]);
  });

  it("keeps zero weeks inside the span (a real week with no completions)", () => {
    const buckets = completedPerWeek(
      [
        task({ id: "a", status: "completed", completed_at: "2026-10-27T10:00:00Z" }),
        task({ id: "b", status: "completed", completed_at: "2026-11-10T10:00:00Z" }),
      ],
      TZ,
      now,
    );
    expect(buckets.map((b) => [b.weekStart, b.completed])).toEqual([
      ["2026-10-26", 1],
      ["2026-11-02", 0],
      ["2026-11-09", 1],
    ]);
  });

  it("caps at the 8 most recent weeks", () => {
    const tasks: AnalyticsTaskInput[] = [];
    // One completion in each of 10 consecutive weeks ending this week
    // (Mondays 7 Sep … 9 Nov 2026).
    for (let w = 0; w < 10; w++) {
      const monday = new Date(Date.UTC(2026, 10, 9 - w * 7, 10));
      tasks.push(task({ id: `w${w}`, status: "completed", completed_at: monday.toISOString() }));
    }
    const buckets = completedPerWeek(tasks, TZ, now);
    expect(buckets).toHaveLength(8);
    expect(buckets[0].weekStart).toBe("2026-09-21");
    expect(buckets[7].weekStart).toBe("2026-11-09");
  });

  it("ignores open tasks and completed tasks with no completed_at", () => {
    const buckets = completedPerWeek(
      [
        task({ id: "a", status: "todo", completed_at: "2026-11-10T10:00:00Z" }),
        task({ id: "b", status: "completed", completed_at: null }),
      ],
      TZ,
      now,
    );
    expect(buckets).toEqual([]);
  });

  it("a UTC-Sunday completion after midnight in Dhaka counts in Monday's week", () => {
    const buckets = completedPerWeek(
      [task({ id: "a", status: "completed", completed_at: "2026-11-15T23:30:00Z" })],
      TZ,
      new Date("2026-11-16T06:00:00Z"),
    );
    expect(buckets).toEqual([{ weekStart: "2026-11-16", label: "16 Nov", completed: 1 }]);
  });
});

describe("workloadByMember", () => {
  const now = new Date("2026-11-12T06:00:00Z");
  it("counts open tasks by status plus overdue, per member; members with no tasks appear with zeroes", () => {
    const rows = workloadByMember(
      [
        task({ id: "a", status: "todo", assigned_to: "u1", due_date: "2026-11-11" }),
        task({ id: "b", status: "in_progress", assigned_to: "u1", due_date: "2026-11-20" }),
        task({ id: "c", status: "completed", assigned_to: "u1" }),
        task({ id: "d", status: "in_review", assigned_to: "u2", due_date: "2026-11-11" }),
        task({ id: "e", status: "todo", assigned_to: "u1", parent_task_id: "a" }),
      ],
      [
        { user_id: "u1", name: "Dev One" },
        { user_id: "u2", name: "Dev Two" },
        { user_id: "u3", name: "Dev Three" },
      ],
      TZ,
      now,
    );
    const one = rows.find((r) => r.userId === "u1")!;
    expect(one.byStatus).toEqual({ todo: 1, in_progress: 1, in_review: 0 });
    expect(one.open).toBe(2);
    expect(one.overdue).toBe(1);
    expect(one.completed).toBe(1);
    const two = rows.find((r) => r.userId === "u2")!;
    expect(two.open).toBe(1);
    expect(two.overdue).toBe(1);
    const three = rows.find((r) => r.userId === "u3")!;
    expect(three.open).toBe(0);
    expect(three.overdue).toBe(0);
    expect(three.completed).toBe(0);
  });
});

describe("projectProgressRows", () => {
  const now = new Date("2026-11-12T06:00:00Z");
  it("uses the official progress formula and counts overdue per project", () => {
    const rows = projectProgressRows(
      [
        project({ id: "p1", name: "Alpha", due_date: "2026-11-30" }),
        project({ id: "p2", name: "Beta", due_date: null }),
      ],
      [
        task({ id: "a", project_id: "p1", status: "completed" }),
        task({ id: "b", project_id: "p1", status: "todo", due_date: "2026-11-11" }),
        task({ id: "c", project_id: "p1", status: "todo", parent_task_id: "a" }),
        task({ id: "d", project_id: "p2", status: "todo" }),
      ],
      TZ,
      now,
    );
    const alpha = rows.find((r) => r.projectId === "p1")!;
    expect(alpha.progress.percent).toBe(50);
    expect(alpha.progress.completed).toBe(1);
    expect(alpha.progress.total).toBe(2);
    expect(alpha.overdue).toBe(1);
    expect(alpha.dueState).toBe("neutral");
    expect(alpha.dueLabel).toBe("Due in 18 days");
    const beta = rows.find((r) => r.projectId === "p2")!;
    expect(beta.progress.percent).toBe(0);
    expect(beta.progress.label).toBe("0%"); // 1 task, none completed — not "No tasks yet"
    expect(beta.dueState).toBe("none");
    expect(beta.dueLabel).toBe("No deadline");
  });

  it("an empty project list returns no rows, and a project with no tasks shows 'No tasks yet'", () => {
    expect(projectProgressRows([], [], TZ, now)).toEqual([]);
    const rows = projectProgressRows([project({ id: "p9", name: "Empty" })], [], TZ, now);
    expect(rows).toHaveLength(1);
    expect(rows[0].progress).toEqual({ percent: 0, completed: 0, total: 0, label: "No tasks yet" });
  });
});
