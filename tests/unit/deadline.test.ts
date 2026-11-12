import { describe, expect, it } from "vitest";
import {
  DEADLINE_LEGEND,
  getDeadlineState,
  getDueCutoff,
} from "@/lib/date/deadline";
import type { TaskStatus } from "@/types";

const TZ = "Asia/Dhaka";
// Due 2026-11-12. Cutoff = 23:59:59.999 Dhaka = 17:59:59.999Z.
const DUE = "2026-11-12";
const CUTOFF_UTC = "2026-11-12T17:59:59.999Z";

function task(overrides: {
  status?: TaskStatus;
  due_date?: string | null;
  completed_at?: string | null;
}) {
  return {
    status: overrides.status ?? "in_progress",
    // Explicit null must stay null (?? would turn it into DUE).
    due_date: "due_date" in overrides ? overrides.due_date! : DUE,
    completed_at: overrides.completed_at ?? null,
  };
}

describe("getDueCutoff", () => {
  it("is 23:59:59.999 on the due date in the workspace timezone", () => {
    expect(getDueCutoff(DUE, TZ).toISOString()).toBe(CUTOFF_UTC);
  });

  it("is the same wall-clock instant in UTC", () => {
    expect(getDueCutoff(DUE, "UTC").toISOString()).toBe(
      "2026-11-12T23:59:59.999Z",
    );
  });
});

describe("getDeadlineState", () => {
  it("green: completed before the cutoff", () => {
    const r = getDeadlineState(
      task({ status: "completed", completed_at: "2026-11-12T10:00:00Z" }),
      TZ,
      new Date("2026-11-13T00:00:00Z"),
    );
    expect(r.state).toBe("green");
    expect(r.label).toBe("Completed on time");
  });

  it("neutral: not completed, 1 second before the cutoff", () => {
    const r = getDeadlineState(
      task({}),
      TZ,
      new Date("2026-11-12T17:59:59.000Z"),
    );
    expect(r.state).toBe("neutral");
    expect(r.label).toBe("Due today");
  });

  it("red: not completed, 1 second after the cutoff", () => {
    const r = getDeadlineState(
      task({}),
      TZ,
      new Date("2026-11-12T18:00:00.000Z"),
    );
    expect(r.state).toBe("red");
    expect(r.label).toMatch(/^Overdue by/);
  });

  it("red: overdue by exactly 2 days 3 hours", () => {
    const r = getDeadlineState(
      task({}),
      TZ,
      new Date("2026-11-14T20:59:59.999Z"),
    );
    expect(r.state).toBe("red");
    expect(r.label).toBe("Overdue by 2 days 3 hours");
  });

  it("amber: completed 1 day late", () => {
    const r = getDeadlineState(
      task({ status: "completed", completed_at: "2026-11-13T18:00:00.000Z" }),
      TZ,
      new Date("2026-11-14T00:00:00Z"),
    );
    expect(r.state).toBe("amber");
    expect(r.label).toBe("Completed late (1 day)");
  });

  it("amber: completed just after the cutoff", () => {
    const r = getDeadlineState(
      task({ status: "completed", completed_at: "2026-11-12T18:00:00.000Z" }),
      TZ,
      new Date("2026-11-13T00:00:00Z"),
    );
    expect(r.state).toBe("amber");
    expect(r.label).toMatch(/^Completed late \(/);
  });

  it("none: no due date is never overdue", () => {
    const r = getDeadlineState(
      task({ due_date: null }),
      TZ,
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(r.state).toBe("none");
    expect(r.label).toBe("No deadline");
  });

  it("reopened task: completed_at cleared and past due is red, not green", () => {
    const r = getDeadlineState(
      task({ status: "in_progress", completed_at: null }),
      TZ,
      new Date("2026-11-13T00:00:00Z"),
    );
    expect(r.state).toBe("red");
  });

  it("Dhaka vs UTC boundary: 11:30 PM Dhaka is still on time", () => {
    // 2026-11-12T17:30:00Z = 23:30 Dhaka, same calendar day, before cutoff.
    const r = getDeadlineState(
      task({}),
      TZ,
      new Date("2026-11-12T17:30:00Z"),
    );
    expect(r.state).toBe("neutral");
    expect(r.label).toBe("Due today");
  });

  it("Dhaka vs UTC boundary: the same UTC instant is overdue in UTC terms", () => {
    // In UTC the due date already ended at 23:59Z, but in Dhaka it has not.
    const inDhaka = getDeadlineState(
      task({}),
      TZ,
      new Date("2026-11-12T17:30:00Z"),
    );
    const inUtc = getDeadlineState(
      task({}),
      "UTC",
      new Date("2026-11-12T17:30:00Z"),
    );
    expect(inDhaka.state).toBe("neutral");
    expect(inUtc.state).toBe("neutral");
    // 30 minutes later it is past midnight in Dhaka, but still 12 Nov in UTC.
    const afterMidnightDhaka = getDeadlineState(
      task({}),
      TZ,
      new Date("2026-11-12T18:30:00Z"),
    );
    const sameInstantUtc = getDeadlineState(
      task({}),
      "UTC",
      new Date("2026-11-12T18:30:00Z"),
    );
    expect(afterMidnightDhaka.state).toBe("red");
    expect(sameInstantUtc.state).toBe("neutral");
  });

  it("neutral: due tomorrow and due in 3 days wording", () => {
    const tomorrow = getDeadlineState(
      { status: "todo", due_date: "2026-11-13", completed_at: null },
      TZ,
      new Date("2026-11-12T00:00:00Z"),
    );
    expect(tomorrow.label).toBe("Due tomorrow");

    const inThreeDays = getDeadlineState(
      { status: "todo", due_date: "2026-11-15", completed_at: null },
      TZ,
      new Date("2026-11-12T00:00:00Z"),
    );
    expect(inThreeDays.state).toBe("neutral");
    expect(inThreeDays.label).toBe("Due in 3 days");
  });

  it("completed exactly at the cutoff counts as on time", () => {
    const r = getDeadlineState(
      task({ status: "completed", completed_at: CUTOFF_UTC }),
      TZ,
      new Date("2026-11-13T00:00:00Z"),
    );
    expect(r.state).toBe("green");
  });

  it("legend covers all five states", () => {
    expect(DEADLINE_LEGEND.map((l) => l.state).sort()).toEqual([
      "amber",
      "green",
      "neutral",
      "none",
      "red",
    ]);
  });
});
