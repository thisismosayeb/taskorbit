// TaskOrbit AI — output schema tests (Part 3, spec section 8, test 11).
// Valid output validates; invalid output is rejected; references to
// tasks/projects that were not in the model input are dropped.

import { describe, it, expect } from "vitest";
import {
  validateAiOutput,
  filterReferences,
  collectReferencedIds,
} from "@/lib/ai/schemas";

const KNOWN_TASKS = new Set(["task-1", "task-2"]);
const KNOWN_PROJECTS = new Set(["proj-1"]);

describe("AI output schemas", () => {
  it("validates a well-formed daily brief", () => {
    const raw = {
      headline: "A solid day.",
      activeProjects: [{ projectId: "proj-1", name: "Website Redesign", completionPercent: 50, openTasks: 2 }],
      recentlyCompleted: [{ taskId: "task-1", title: "Design homepage" }],
      upcoming: [{ taskId: "task-2", title: "Fix footer", dueDate: "2026-11-13", reason: "Due tomorrow." }],
      overdue: [],
      blockers: [{ taskId: "task-2", text: "Waiting on copy." }],
      nextActions: [{ text: "Finish the footer fix.", taskId: "task-2" }],
    };
    const parsed = validateAiOutput("daily_brief", raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.headline).toBe("A solid day.");
  });

  it("rejects output with the wrong shape (missing keys, wrong types)", () => {
    expect(validateAiOutput("daily_brief", { headline: "x" })).toBeNull();
    expect(validateAiOutput("daily_brief", "not json at all")).toBeNull();
    expect(validateAiOutput("daily_brief", null)).toBeNull();
    expect(
      validateAiOutput("my_focus", { orderedTasks: [{ taskId: "task-1" }] }),
    ).toBeNull(); // missing title/reason
    expect(
      validateAiOutput("project_summary", {
        summary: "ok",
        status: "active",
        completionPercent: 150, // > 100
        activeTasks: 1,
        assignees: [],
        risks: [],
        latestActivity: [],
      }),
    ).toBeNull();
  });

  it("validates a standup and a deadline-risk reply", () => {
    expect(
      validateAiOutput("standup", {
        done: [{ taskId: "task-1", text: "Homepage done." }],
        inProgress: [],
        blocked: [],
        next: [{ text: "Start the footer." }],
      }),
    ).not.toBeNull();
    expect(
      validateAiOutput("deadline_risk", {
        risks: [{ taskId: "task-1", title: "Homepage", reason: "Due today, still in progress.", likelihood: "high" }],
      }),
    ).not.toBeNull();
    expect(
      validateAiOutput("deadline_risk", {
        risks: [{ taskId: "task-1", title: "Homepage", reason: "x", likelihood: "certain" }],
      }),
    ).toBeNull(); // likelihood must be low/medium/high — never certainty
  });

  it("drops references to tasks/projects that were not in the input", () => {
    const parsed = validateAiOutput("daily_brief", {
      headline: "Mixed.",
      activeProjects: [
        { projectId: "proj-1", name: "Real", completionPercent: 10, openTasks: 1 },
        { projectId: "proj-ghost", name: "Invented", completionPercent: 99, openTasks: 1 },
      ],
      recentlyCompleted: [{ taskId: "task-1", title: "Real task" }],
      upcoming: [{ taskId: "task-ghost", title: "Invented task", reason: "Made up." }],
      overdue: [],
      blockers: [],
      nextActions: [{ text: "Do the invented thing.", taskId: "task-ghost" }],
    });
    expect(parsed).not.toBeNull();
    const { output, dropped } = filterReferences("daily_brief", parsed!, KNOWN_TASKS, KNOWN_PROJECTS);
    expect(dropped).toBe(3); // ghost project + ghost upcoming + ghost next action
    expect(output.activeProjects.map((p) => p.projectId)).toEqual(["proj-1"]);
    expect(output.upcoming).toEqual([]);
    expect(output.nextActions).toEqual([]);
    const refs = collectReferencedIds(output);
    expect(refs.taskIds).toEqual(["task-1"]);
    expect(refs.projectIds).toEqual(["proj-1"]);
  });

  it("keeps output untouched when every reference is real", () => {
    const parsed = validateAiOutput("my_focus", {
      orderedTasks: [
        { taskId: "task-2", title: "Fix footer", reason: "Overdue." },
        { taskId: "task-1", title: "Homepage", reason: "Due soon." },
      ],
    });
    expect(parsed).not.toBeNull();
    const { output, dropped } = filterReferences("my_focus", parsed!, KNOWN_TASKS, KNOWN_PROJECTS);
    expect(dropped).toBe(0);
    expect(output.orderedTasks.map((t) => t.taskId)).toEqual(["task-2", "task-1"]);
  });
});

describe("next_actions schema (not covered above)", () => {
  it("validates a well-formed next-actions reply", () => {
    expect(
      validateAiOutput("next_actions", {
        actions: [
          { text: "Finish the footer fix.", taskId: "task-2" },
          { text: "Review the homepage.", projectId: "proj-1" },
          { text: "Plan next week." },
        ],
      }),
    ).not.toBeNull();
  });

  it("rejects empty text and more than 10 actions", () => {
    expect(validateAiOutput("next_actions", { actions: [{ text: "" }] })).toBeNull();
    expect(
      validateAiOutput("next_actions", {
        actions: Array.from({ length: 11 }, (_, i) => ({ text: `Action ${i}` })),
      }),
    ).toBeNull();
    expect(validateAiOutput("next_actions", { actions: "do things" })).toBeNull();
  });

  it("validates a well-formed project summary", () => {
    expect(
      validateAiOutput("project_summary", {
        summary: "On track.",
        status: "active",
        completionPercent: 50,
        activeTasks: 2,
        assignees: [{ name: "Test Developer", openTasks: 2 }],
        risks: [{ text: "Footer copy is late.", severity: "medium" }],
        latestActivity: ["Task completed."],
      }),
    ).not.toBeNull();
    expect(
      validateAiOutput("project_summary", {
        summary: "x",
        status: "active",
        completionPercent: 50,
        activeTasks: 1,
        assignees: [],
        risks: [{ text: "Risk.", severity: "critical" }], // not low/medium/high
        latestActivity: [],
      }),
    ).toBeNull();
  });
});

describe("filterReferences for the remaining features", () => {
  it("drops ghost task/project refs from next_actions and standup", () => {
    const next = validateAiOutput("next_actions", {
      actions: [
        { text: "Real.", taskId: "task-1" },
        { text: "Invented.", taskId: "task-ghost" },
        { text: "Invented project.", projectId: "proj-ghost" },
      ],
    });
    expect(next).not.toBeNull();
    const cleaned = filterReferences("next_actions", next!, KNOWN_TASKS, KNOWN_PROJECTS);
    expect(cleaned.dropped).toBe(2);
    expect(cleaned.output.actions).toEqual([{ text: "Real.", taskId: "task-1" }]);

    const standup = validateAiOutput("standup", {
      done: [{ taskId: "task-ghost", text: "Invented done." }],
      inProgress: [{ taskId: "task-2", text: "Real work." }],
      blocked: [],
      next: [{ text: "No ref at all." }],
    });
    expect(standup).not.toBeNull();
    const cleanedStandup = filterReferences("standup", standup!, KNOWN_TASKS, KNOWN_PROJECTS);
    expect(cleanedStandup.dropped).toBe(1);
    expect(cleanedStandup.output.done).toEqual([]);
    expect(cleanedStandup.output.inProgress).toHaveLength(1);
  });

  it("drops ghost refs from deadline_risk and leaves a clean project_summary untouched", () => {
    const risks = validateAiOutput("deadline_risk", {
      risks: [
        { taskId: "task-1", title: "Real", reason: "Due today.", likelihood: "high" },
        { taskId: "task-ghost", title: "Invented", reason: "Made up.", likelihood: "low" },
      ],
    });
    expect(risks).not.toBeNull();
    const cleaned = filterReferences("deadline_risk", risks!, KNOWN_TASKS, KNOWN_PROJECTS);
    expect(cleaned.dropped).toBe(1);
    expect(cleaned.output.risks).toHaveLength(1);

    const summary = validateAiOutput("project_summary", {
      summary: "Fine.",
      status: "active",
      completionPercent: 0,
      activeTasks: 0,
      assignees: [],
      risks: [],
      latestActivity: [],
    });
    expect(summary).not.toBeNull();
    expect(filterReferences("project_summary", summary!, KNOWN_TASKS, KNOWN_PROJECTS).dropped).toBe(0);
  });

  it("collectReferencedIds finds ids nested in any feature output", () => {
    const refs = collectReferencedIds({
      actions: [{ text: "x", taskId: "task-1", projectId: "proj-1" }],
      extra: { nested: [{ taskId: "task-2" }] },
    });
    expect(refs.taskIds.sort()).toEqual(["task-1", "task-2"]);
    expect(refs.projectIds).toEqual(["proj-1"]);
  });
});
