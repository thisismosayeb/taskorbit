// Task filter / sort / pagination helpers (lib/filters.ts).

import { describe, expect, it } from "vitest";
import {
  filterHref,
  filterTasks,
  paginate,
  parseTaskFilters,
  resolveMine,
  serializeTaskFilters,
  sortTasks,
  DEFAULT_FILTERS,
  type TaskFilterState,
} from "@/lib/filters";
import type { Task } from "@/types";

function task(overrides: Partial<Task>): Task {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    project_id: "p1",
    parent_task_id: null,
    title: "Task",
    description: null,
    assigned_to: null,
    created_by: "u1",
    status: "todo",
    priority: "medium",
    start_date: null,
    due_date: null,
    completed_at: null,
    position: 1,
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  } as Task;
}

describe("parseTaskFilters", () => {
  it("parses a full valid query string", () => {
    const f = parseTaskFilters({
      status: "in_progress",
      priority: "high",
      assignee: "user-1",
      project: "proj-1",
      due_from: "2026-11-01",
      due_to: "2026-11-30",
      overdue: "1",
      sort: "priority",
      page: "3",
      mine: "1",
    });
    expect(f).toEqual({
      status: "in_progress",
      priority: "high",
      assignee: "user-1",
      project: "proj-1",
      dueFrom: "2026-11-01",
      dueTo: "2026-11-30",
      overdueOnly: true,
      sort: "priority",
      page: 3,
      mine: true,
    });
  });

  it("falls back to defaults for invalid values", () => {
    const f = parseTaskFilters({
      status: "bogus",
      priority: "bogus",
      due_from: "not-a-date",
      due_to: "2026-13-40",
      overdue: "yes",
      sort: "bogus",
      page: "abc",
      mine: "maybe",
    });
    expect(f.status).toBe("all");
    expect(f.priority).toBe("all");
    expect(f.dueFrom).toBeNull();
    expect(f.dueTo).toBeNull();
    expect(f.overdueOnly).toBe(false);
    expect(f.sort).toBe("due_date");
    expect(f.page).toBe(1);
    expect(f.mine).toBeNull();
  });

  it("clamps page to 1 and accepts mine=0 as an explicit false", () => {
    expect(parseTaskFilters({ page: "0" }).page).toBe(1);
    expect(parseTaskFilters({ page: "-2" }).page).toBe(1);
    expect(parseTaskFilters({ mine: "0" }).mine).toBe(false);
    expect(parseTaskFilters({}).mine).toBeNull();
  });
});

describe("resolveMine", () => {
  it("explicit URL value wins; otherwise developers default ON, managers OFF", () => {
    expect(resolveMine({ mine: true }, "developer")).toBe(true);
    expect(resolveMine({ mine: false }, "developer")).toBe(false);
    expect(resolveMine({ mine: null }, "developer")).toBe(true);
    expect(resolveMine({ mine: null }, "manager")).toBe(false);
    expect(resolveMine({ mine: null }, null)).toBe(false);
  });
});

describe("serializeTaskFilters / filterHref", () => {
  it("omits defaults and round-trips through parse", () => {
    const f: TaskFilterState = {
      ...DEFAULT_FILTERS,
      status: "todo",
      priority: "urgent",
      dueFrom: "2026-11-01",
      overdueOnly: true,
      sort: "priority",
      page: 2,
      mine: false,
    };
    const qs = serializeTaskFilters(f).toString();
    expect(qs).not.toContain("assignee");
    expect(qs).not.toContain("project");
    expect(parseTaskFilters(Object.fromEntries(new URLSearchParams(qs)))).toEqual(f);
  });

  it("filterHref keeps the path and overrides", () => {
    expect(filterHref("/dashboard/my-tasks", DEFAULT_FILTERS)).toBe("/dashboard/my-tasks");
    expect(filterHref("/dashboard/my-tasks", DEFAULT_FILTERS, { status: "todo", page: 2 })).toBe(
      "/dashboard/my-tasks?status=todo&page=2",
    );
  });
});

describe("filterTasks", () => {
  const now = new Date("2026-11-12T12:00:00Z"); // noon UTC = 18:00 Dhaka, 12 Nov
  const rows = [
    task({ id: "a", status: "todo", priority: "urgent", due_date: "2026-11-11", assigned_to: "u1" }), // overdue in Dhaka (cutoff 11 Nov 23:59 Dhaka)
    task({ id: "b", status: "in_progress", priority: "low", due_date: "2026-11-12", assigned_to: "u2" }), // due today
    task({ id: "c", status: "completed", priority: "high", due_date: "2026-11-10", assigned_to: "u1", completed_at: "2026-11-10T10:00:00.000Z" }),
    task({ id: "d", status: "todo", priority: "medium", due_date: null, assigned_to: null }),
  ];

  it("filters by status, priority, assignee and project", () => {
    const ids = (list: Task[]) => list.map((t) => t.id);
    expect(ids(filterTasks(rows, { ...DEFAULT_FILTERS, status: "todo" }, "Asia/Dhaka", now))).toEqual(["a", "d"]);
    expect(ids(filterTasks(rows, { ...DEFAULT_FILTERS, priority: "urgent" }, "Asia/Dhaka", now))).toEqual(["a"]);
    expect(ids(filterTasks(rows, { ...DEFAULT_FILTERS, assignee: "u1" }, "Asia/Dhaka", now))).toEqual(["a", "c"]);
    expect(ids(filterTasks(rows, { ...DEFAULT_FILTERS, project: "p1" }, "Asia/Dhaka", now))).toEqual(["a", "b", "c", "d"]);
    expect(ids(filterTasks(rows, { ...DEFAULT_FILTERS, project: "p2" }, "Asia/Dhaka", now))).toEqual([]);
  });

  it("filters by due-date range, inclusive, and drops tasks without a due date", () => {
    const ids = (list: Task[]) => list.map((t) => t.id);
    expect(
      ids(filterTasks(rows, { ...DEFAULT_FILTERS, dueFrom: "2026-11-11", dueTo: "2026-11-12" }, "Asia/Dhaka", now)),
    ).toEqual(["a", "b"]);
    expect(ids(filterTasks(rows, { ...DEFAULT_FILTERS, dueFrom: "2026-11-12" }, "Asia/Dhaka", now))).toEqual(["b"]);
  });

  it("overdue only: only the red deadline state passes (uses getDeadlineState)", () => {
    const ids = filterTasks(rows, { ...DEFAULT_FILTERS, overdueOnly: true }, "Asia/Dhaka", now).map((t) => t.id);
    expect(ids).toEqual(["a"]);
  });
});

describe("sortTasks", () => {
  it("due date: earliest first, no due date last", () => {
    const rows = [
      task({ id: "a", due_date: null, position: 1 }),
      task({ id: "b", due_date: "2026-11-20", position: 2 }),
      task({ id: "c", due_date: "2026-11-10", position: 3 }),
    ];
    expect(sortTasks(rows, "due_date").map((t) => t.id)).toEqual(["c", "b", "a"]);
  });

  it("priority: urgent first, then high, medium, low", () => {
    const rows = [
      task({ id: "a", priority: "low", due_date: "2026-11-01", position: 1 }),
      task({ id: "b", priority: "urgent", due_date: "2026-11-30", position: 2 }),
      task({ id: "c", priority: "high", due_date: "2026-11-01", position: 3 }),
      task({ id: "d", priority: "medium", due_date: "2026-11-01", position: 4 }),
    ];
    expect(sortTasks(rows, "priority").map((t) => t.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("recently updated: newest first", () => {
    const rows = [
      task({ id: "a", updated_at: "2026-11-01T00:00:00.000Z", position: 1 }),
      task({ id: "b", updated_at: "2026-11-05T00:00:00.000Z", position: 2 }),
      task({ id: "c", updated_at: "2026-11-03T00:00:00.000Z", position: 3 }),
    ];
    expect(sortTasks(rows, "updated").map((t) => t.id)).toEqual(["b", "c", "a"]);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 45 }, (_, i) => i + 1);

  it("pages of 20 with next/prev flags", () => {
    const p1 = paginate(rows, 1);
    expect(p1.items).toHaveLength(20);
    expect(p1.items[0]).toBe(1);
    expect(p1.totalPages).toBe(3);
    expect(p1.hasNext).toBe(true);
    expect(p1.hasPrev).toBe(false);

    const p2 = paginate(rows, 2);
    expect(p2.items[0]).toBe(21);
    expect(p2.hasNext).toBe(true);
    expect(p2.hasPrev).toBe(true);

    const p3 = paginate(rows, 3);
    expect(p3.items).toHaveLength(5);
    expect(p3.hasNext).toBe(false);
  });

  it("clamps out-of-range pages and handles empty lists", () => {
    expect(paginate(rows, 99).page).toBe(3);
    expect(paginate(rows, 0).page).toBe(1);
    const empty = paginate([], 1);
    expect(empty.totalPages).toBe(1);
    expect(empty.items).toEqual([]);
  });
});
