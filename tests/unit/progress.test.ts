import { describe, expect, it } from "vitest";
import {
  formatPercent,
  projectProgress,
  taskProgress,
  topLevel,
} from "@/lib/progress";
import type { TaskStatus } from "@/types";

function t(
  status: TaskStatus,
  parent_task_id: string | null = null,
) {
  return { status, parent_task_id };
}

describe("formatPercent", () => {
  it("rounds to a whole number: 66.67 -> 67%", () => {
    expect(formatPercent(66.67)).toBe("67%");
    expect(formatPercent(75)).toBe("75%");
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(100)).toBe("100%");
  });
});

describe("projectProgress", () => {
  it("0 tasks -> 0% with a 'No tasks yet' note", () => {
    const r = projectProgress([]);
    expect(r).toEqual({ percent: 0, completed: 0, total: 0, label: "No tasks yet" });
  });

  it("3 of 4 completed -> 75%", () => {
    const r = projectProgress([
      t("completed"),
      t("completed"),
      t("completed"),
      t("todo"),
    ]);
    expect(r.percent).toBe(75);
    expect(r.completed).toBe(3);
    expect(r.total).toBe(4);
    expect(r.label).toBe("75%");
  });

  it("2 of 3 completed -> 66.67 exact, '67%' display", () => {
    const r = projectProgress([t("completed"), t("completed"), t("todo")]);
    expect(r.percent).toBe(66.67);
    expect(r.label).toBe("67%");
  });

  it("subtasks are not counted in project progress", () => {
    const mixed = [
      t("completed"),
      t("completed"),
      t("completed"),
      t("todo"),
      // Subtasks of the first task: must not change the 75%.
      t("completed", "parent-1"),
      t("todo", "parent-1"),
      t("todo", "parent-1"),
    ];
    expect(topLevel(mixed)).toHaveLength(4);
    const r = projectProgress(mixed);
    expect(r.percent).toBe(75);
    expect(r.total).toBe(4);
    expect(r.completed).toBe(3);
  });
});

describe("taskProgress", () => {
  it("0 subtasks -> 0% with a 'No subtasks' note", () => {
    const r = taskProgress([]);
    expect(r).toEqual({ percent: 0, completed: 0, total: 0, label: "No subtasks" });
  });

  it("2 of 3 subtasks done -> 66.67 exact, '67%' display", () => {
    const r = taskProgress([
      t("completed", "parent-1"),
      t("completed", "parent-1"),
      t("in_progress", "parent-1"),
    ]);
    expect(r.percent).toBe(66.67);
    expect(r.completed).toBe(2);
    expect(r.total).toBe(3);
    expect(r.label).toBe("67%");
  });
});
