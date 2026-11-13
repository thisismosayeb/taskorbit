// TaskOrbit demo data — pure plan + date math (no Supabase, no I/O).
//
// This module is the single source of truth for what the demo seed creates.
// `scripts/seed-demo.ts` inserts exactly this plan; `tests/unit/demo-data.test.ts`
// checks it against the real `getDeadlineState()` / progress formulas, so the
// demo is proven to render the intended deadline states and percentages
// without ever touching a database.
//
// Dates are RELATIVE to the run day in the workspace timezone (Asia/Dhaka):
// the seed computes "today" in Dhaka at run time and offsets from it, so the
// demo always shows the right states no matter when it is seeded.

export const DEMO_WORKSPACE_NAME = "Software Engineering Lab";
export const DEMO_WORKSPACE_TIMEZONE = "Asia/Dhaka";

export type DemoAssignee = "manager" | "dev1" | "dev2";
export type DemoTaskStatus = "todo" | "in_progress" | "in_review" | "completed";
export type DemoPriority = "low" | "medium" | "high" | "urgent";
export type DemoProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";

export interface DemoComment {
  author: DemoAssignee;
  content: string;
}

export interface DemoSubtask {
  title: string;
  description: string;
  status: DemoTaskStatus;
  priority: DemoPriority;
  /** Days from today in the workspace timezone; null = no deadline. */
  dueOffsetDays: number | null;
}

export interface DemoTask {
  title: string;
  description: string;
  assignee: DemoAssignee;
  status: DemoTaskStatus;
  priority: DemoPriority;
  /** Days from today in the workspace timezone; null = no deadline. */
  dueOffsetDays: number | null;
  subtasks?: DemoSubtask[];
  comments?: DemoComment[];
}

export interface DemoProject {
  name: string;
  description: string;
  status: DemoProjectStatus;
  priority: DemoPriority;
  /** Days from today in the workspace timezone; null = no deadline. */
  dueOffsetDays: number | null;
  tasks: DemoTask[];
}

export interface DemoPlan {
  workspace: { name: string; timezone: string };
  projects: DemoProject[];
}

// ---------------------------------------------------------------------------
// Date math — dependency-free, Intl-based, workspace-timezone aware.
// ---------------------------------------------------------------------------

/** Calendar date ("YYYY-MM-DD") of an instant in the given timezone. */
export function dateStringInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** "YYYY-MM-DD" shifted by `days` (negative = past). Month/year safe. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** "Today" as a calendar date in the workspace timezone. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return dateStringInTimezone(now, timeZone);
}

/**
 * Due date ("YYYY-MM-DD") for a task that is due `offsetDays` from today in
 * the workspace timezone. `null` offset = no deadline.
 */
export function dueDateForOffset(
  offsetDays: number | null,
  timeZone: string,
  now: Date = new Date(),
): string | null {
  if (offsetDays === null) return null;
  return addDays(todayInTimezone(timeZone, now), offsetDays);
}

// ---------------------------------------------------------------------------
// The plan.
// ---------------------------------------------------------------------------
//
// Deadline-state coverage (see docs/DECISIONS.md — getDeadlineState):
//   green  = completed, completed_at <= 23:59:59.999 Dhaka on the due date
//            (due in the future, completed "now" by the seed)
//   amber  = completed, completed_at > cutoff (due in the past, completed "now")
//   red    = not completed, now > cutoff (due in the past)
//   neutral= not completed, now <= cutoff (due today / tomorrow / in N days)
//   none   = no due date
//
// Progress coverage (see lib/progress.ts):
//   Project A: 3 of 4 top-level tasks completed -> 75%
//   "Implement the task board": 2 of 3 subtasks completed -> 67%
//
// Insert order matters (see docs/DECISIONS.md — DB triggers): the parent is
// created open, its subtasks are created and completed first, and only then
// could a parent be completed — the seed inserts completed top-level tasks
// directly with status "completed" (the trigger sets completed_at = now()),
// and the one parent with subtasks stays in_progress at 2/3 done.
export function buildDemoPlan(now: Date = new Date()): DemoPlan {
  return {
    workspace: {
      name: DEMO_WORKSPACE_NAME,
      timezone: DEMO_WORKSPACE_TIMEZONE,
    },
    projects: [
      {
        name: "Capstone: TaskOrbit MVP",
        description:
          "The Part 1–4 build: database, auth, workspaces, projects, tasks, subtasks, comments and deadline logic.",
        status: "active",
        priority: "high",
        dueOffsetDays: 30,
        tasks: [
          {
            title: "Design the database schema",
            description:
              "ER diagram for workspaces, members, projects, tasks, subtasks, comments, activity and notifications, with RLS on every table.",
            assignee: "dev1",
            status: "completed",
            priority: "high",
            dueOffsetDays: 5,
            comments: [
              {
                author: "manager",
                content:
                  "Schema looks solid — the RLS rules in DECISIONS.md are all covered.",
              },
              {
                author: "dev1",
                content: "ER diagram is in the report draft.",
              },
            ],
          },
          {
            title: "Build auth & workspace onboarding",
            description:
              "Supabase Auth signup/login, invite-only developer onboarding, workspace switcher.",
            assignee: "dev2",
            status: "completed",
            priority: "high",
            dueOffsetDays: 4,
            comments: [
              {
                author: "dev2",
                content:
                  "Invite-only signup is working — no role is trusted from the form.",
              },
            ],
          },
          {
            title: "Implement the task board",
            description:
              "Drag-and-drop board with columns per status, filters and the task detail drawer.",
            assignee: "dev1",
            status: "in_progress",
            priority: "urgent",
            dueOffsetDays: 2,
            subtasks: [
              {
                title: "Drag-and-drop columns",
                description: "Move tasks between Todo / In Progress / In Review / Completed.",
                status: "completed",
                priority: "high",
                dueOffsetDays: 2,
              },
              {
                title: "Task detail drawer",
                description: "Title, description, assignee, deadline state and comments in one place.",
                status: "completed",
                priority: "high",
                dueOffsetDays: 2,
              },
              {
                title: "Board filters",
                description: "Filter by assignee, status and priority.",
                status: "todo",
                priority: "medium",
                dueOffsetDays: 2,
              },
            ],
            comments: [
              {
                author: "dev1",
                content: "Filters are the last piece — the board is usable already.",
              },
            ],
          },
          {
            title: "Write the Part 1 report",
            description:
              "Report covering the schema, the RLS enforcement and the deadline-state rules.",
            assignee: "dev2",
            status: "completed",
            priority: "medium",
            dueOffsetDays: 7,
            comments: [
              {
                author: "manager",
                content: "Report draft reviewed — add the deadline-state table.",
              },
            ],
          },
        ],
      },
      {
        name: "Lab Assignments & Reports",
        description:
          "Weekly lab submissions and progress reports for the Software Engineering Lab course.",
        status: "active",
        priority: "medium",
        dueOffsetDays: 21,
        tasks: [
          {
            title: "Submit Lab 3: ER diagram",
            description:
              "Lab 3 submission: the full ER diagram plus the RLS policy list.",
            assignee: "dev1",
            status: "in_progress",
            priority: "high",
            dueOffsetDays: -2,
            comments: [
              {
                author: "manager",
                content: "Lab 3 is overdue — submit the ER diagram today.",
              },
            ],
          },
          {
            title: "Fix the overdue notification bug",
            description:
              "The overdue reminder fired on the old status after a task was reopened.",
            assignee: "dev2",
            status: "completed",
            priority: "medium",
            dueOffsetDays: -3,
            comments: [
              {
                author: "dev2",
                content:
                  "Fixed a day late — the trigger was firing on the old status.",
              },
            ],
          },
          {
            title: "Draft the viva presentation",
            description:
              "Ten slides: problem, schema, RLS demo, deadline states, live demo plan.",
            assignee: "dev1",
            status: "in_progress",
            priority: "high",
            dueOffsetDays: 0,
          },
          {
            title: "Collect peer feedback on the UI",
            description:
              "Ask two classmates to click through the dashboard and note anything confusing.",
            assignee: "dev2",
            status: "todo",
            priority: "low",
            dueOffsetDays: null,
          },
          {
            title: "Prepare the weekly progress report",
            description:
              "What was done, what is blocked, what is next — one page for the lab supervisor.",
            assignee: "dev1",
            status: "in_progress",
            priority: "medium",
            dueOffsetDays: 6,
          },
          {
            title: "Review the Supabase RLS policies",
            description:
              "Walk through every policy in 0001_init.sql and confirm the developer restrictions hold.",
            assignee: "dev2",
            status: "in_review",
            priority: "medium",
            dueOffsetDays: 1,
          },
        ],
      },
      {
        name: "Demo & Viva Preparation",
        description:
          "Everything needed for the final demo day: rehearsal, recording, Q&A notes and the Part 4 docs.",
        status: "planning",
        priority: "medium",
        dueOffsetDays: 14,
        tasks: [
          {
            title: "Rehearse the live demo",
            description:
              "Full run-through on staging: login, create a task, complete a subtask, show the bell.",
            assignee: "dev1",
            status: "todo",
            priority: "high",
            dueOffsetDays: 10,
          },
          {
            title: "Record the demo video",
            description:
              "Five-minute screen recording with voiceover, in case the live demo fails on the day.",
            assignee: "dev2",
            status: "todo",
            priority: "medium",
            dueOffsetDays: 9,
          },
          {
            title: "Prepare viva Q&A notes",
            description:
              "Likely questions: why RLS instead of UI-only checks, why the 23:59:59 cutoff, how subtask completion blocks the parent.",
            assignee: "dev1",
            status: "todo",
            priority: "low",
            dueOffsetDays: null,
          },
          {
            title: "Fix the bell live-update bug",
            description:
              "Known issue from the Part 3 staging re-test: the notification row is created but the bell never moves.",
            assignee: "dev2",
            status: "in_progress",
            priority: "urgent",
            dueOffsetDays: -1,
            comments: [
              {
                author: "manager",
                content:
                  "Known issue from the Part 3 staging re-test — bell never moves even though the row exists.",
              },
            ],
          },
          {
            title: "Write the final report (Part 4 docs)",
            description:
              "Production setup, final QA journeys, the long Bangla guide and the handoff notes.",
            assignee: "manager",
            status: "in_progress",
            priority: "high",
            dueOffsetDays: 14,
          },
        ],
      },
    ],
  };
}

/** Intended deadline state of a planned task, for the seed summary output. */
export function intendedDeadlineState(task: DemoTask): string {
  if (task.dueOffsetDays === null) return "none (No deadline)";
  if (task.status === "completed") {
    return task.dueOffsetDays < 0
      ? "amber (Completed late)"
      : "green (Completed on time)";
  }
  if (task.dueOffsetDays < 0) return "red (Overdue)";
  if (task.dueOffsetDays === 0) return "neutral (Due today)";
  if (task.dueOffsetDays === 1) return "neutral (Due tomorrow)";
  return `neutral (Due in ${task.dueOffsetDays} days)`;
}
