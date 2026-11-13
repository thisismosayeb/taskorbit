// Demo-data tests (Track E, Part 4).
//
// These tests prove the demo plan in scripts/demo-plan.ts renders exactly
// the intended deadline states and progress percentages — using the real
// getDeadlineState() / projectProgress() / taskProgress() from the app —
// without ever touching a database. The seed inserts the same plan, with
// completed_at = now() stamped by the maintain_completed_at() trigger, so
// the "now" used here is the same instant the seed would complete a task.
import { describe, expect, it } from "vitest";
import { getDeadlineState } from "@/lib/date/deadline";
import { projectProgress, taskProgress } from "@/lib/progress";
import {
  addDays,
  buildDemoPlan,
  dateStringInTimezone,
  dueDateForOffset,
  todayInTimezone,
  type DemoTask,
} from "../../scripts/demo-plan";
import type { TaskStatus } from "@/types";

const TZ = "Asia/Dhaka";
// A fixed "seed moment": 2026-11-13 16:00 in Dhaka (10:00 UTC), so the UTC
// and Dhaka calendar dates agree and each due offset maps to a known date.
const NOW = new Date("2026-11-13T10:00:00Z");

function flattenTasks(plan: ReturnType<typeof buildDemoPlan>): DemoTask[] {
  return plan.projects.flatMap((p) => p.tasks);
}

describe("demo date math (Asia/Dhaka)", () => {
  it("todayInTimezone uses the Dhaka calendar day, not the UTC day", () => {
    // 2026-11-12 20:00 UTC is already 2026-11-13 02:00 in Dhaka.
    expect(dateStringInTimezone(new Date("2026-11-12T20:00:00Z"), TZ)).toBe("2026-11-13");
    expect(dateStringInTimezone(new Date("2026-11-12T20:00:00Z"), "UTC")).toBe("2026-11-12");
    expect(todayInTimezone(TZ, NOW)).toBe("2026-11-13");
  });

  it("addDays crosses month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-11-13", -3)).toBe("2026-11-10");
    expect(addDays("2026-11-13", 0)).toBe("2026-11-13");
  });

  it("dueDateForOffset is relative to today in Dhaka; null stays null", () => {
    expect(dueDateForOffset(5, TZ, NOW)).toBe("2026-11-18");
    expect(dueDateForOffset(-3, TZ, NOW)).toBe("2026-11-10");
    expect(dueDateForOffset(0, TZ, NOW)).toBe("2026-11-13");
    expect(dueDateForOffset(null, TZ, NOW)).toBeNull();
  });
});

describe("demo plan shape", () => {
  const plan = buildDemoPlan(NOW);

  it("is the 'Software Engineering Lab' workspace in Asia/Dhaka", () => {
    expect(plan.workspace.name).toBe("Software Engineering Lab");
    expect(plan.workspace.timezone).toBe(TZ);
  });

  it("has 3 projects and 15 top-level tasks", () => {
    expect(plan.projects).toHaveLength(3);
    expect(flattenTasks(plan)).toHaveLength(15);
    expect(plan.projects.map((p) => p.tasks.length)).toEqual([4, 6, 5]);
  });

  it("has 3 subtasks (all under 'Implement the task board') and 8 comments", () => {
    const subtasks = flattenTasks(plan).flatMap((t) => t.subtasks ?? []);
    expect(subtasks).toHaveLength(3);
    const board = flattenTasks(plan).find((t) => t.title === "Implement the task board");
    expect(board?.subtasks).toHaveLength(3);
    const comments = flattenTasks(plan).flatMap((t) => t.comments ?? []);
    expect(comments).toHaveLength(8);
  });
});

describe("demo deadline states (real getDeadlineState)", () => {
  const plan = buildDemoPlan(NOW);
  const tasks = flattenTasks(plan);

  // Simulate the row the seed will insert: due_date from the offset, and
  // completed_at = now for completed tasks (the trigger stamps now()).
  function stateOf(task: DemoTask): string {
    return getDeadlineState(
      {
        status: task.status as TaskStatus,
        due_date: dueDateForOffset(task.dueOffsetDays, TZ, NOW),
        completed_at: task.status === "completed" ? NOW.toISOString() : null,
      },
      TZ,
      NOW,
    ).state;
  }

  it("shows every deadline state: green, red, amber, neutral, none", () => {
    const states = new Set(tasks.map(stateOf));
    expect(states).toEqual(new Set(["green", "red", "amber", "neutral", "none"]));
  });

  it("green: the 3 completed tasks due in the future", () => {
    const green = tasks.filter((t) => stateOf(t) === "green").map((t) => t.title);
    expect(green).toEqual([
      "Design the database schema",
      "Build auth & workspace onboarding",
      "Write the Part 1 report",
    ]);
  });

  it("amber: the 1 task completed after its deadline", () => {
    const amber = tasks.filter((t) => stateOf(t) === "amber").map((t) => t.title);
    expect(amber).toEqual(["Fix the overdue notification bug"]);
  });

  it("red: the 2 uncompleted tasks past their deadline", () => {
    const red = tasks.filter((t) => stateOf(t) === "red").map((t) => t.title);
    expect(red).toEqual([
      "Submit Lab 3: ER diagram",
      "Fix the bell live-update bug",
    ]);
  });

  it("neutral: due today, tomorrow and in N days (7 tasks)", () => {
    const neutral = tasks.filter((t) => stateOf(t) === "neutral");
    expect(neutral).toHaveLength(7);
    expect(stateOf(tasks.find((t) => t.title === "Draft the viva presentation")!)).toBe("neutral");
    expect(stateOf(tasks.find((t) => t.title === "Review the Supabase RLS policies")!)).toBe("neutral");
  });

  it("none: the 2 tasks with no deadline", () => {
    const none = tasks.filter((t) => stateOf(t) === "none").map((t) => t.title);
    expect(none).toEqual([
      "Collect peer feedback on the UI",
      "Prepare viva Q&A notes",
    ]);
  });
});

describe("demo progress (real lib/progress.ts)", () => {
  const plan = buildDemoPlan(NOW);
  const capstone = plan.projects[0];
  const board = capstone.tasks.find((t) => t.title === "Implement the task board")!;

  function row(status: TaskStatus, parent_task_id: string | null = null) {
    return { status, parent_task_id };
  }

  it("'Capstone: TaskOrbit MVP' is 75% (3 of 4 top-level tasks completed)", () => {
    const r = projectProgress(capstone.tasks.map((t) => row(t.status)));
    expect(r.percent).toBe(75);
    expect(r.completed).toBe(3);
    expect(r.total).toBe(4);
    expect(r.label).toBe("75%");
  });

  it("'Implement the task board' is 67% (2 of 3 subtasks completed)", () => {
    const r = taskProgress((board.subtasks ?? []).map((s) => row(s.status, "parent-id")));
    expect(r.percent).toBe(66.67);
    expect(r.completed).toBe(2);
    expect(r.total).toBe(3);
    expect(r.label).toBe("67%");
  });
});
