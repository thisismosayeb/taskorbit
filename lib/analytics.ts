// Analytics aggregation helpers (Part 2, Section 7).
//
// Pure functions over already-loaded rows: they never touch the database.
// The server action in lib/actions/analytics.ts loads the rows (scoped to
// the workspace, manager-only) and these helpers turn them into the numbers
// the charts render. Every count comes from the database — nothing here
// invents a trend, a percentage or a score.
//
// Deadline states always come from getDeadlineState() (lib/date/deadline.ts,
// the single source of truth); project progress always comes from
// projectProgress() (lib/progress.ts, the official formula). This file
// never re-implements either.

import { getDeadlineState } from "@/lib/date/deadline";
import { projectProgress, type ProgressResult } from "@/lib/progress";
import type { Priority, Project, Task, TaskStatus } from "@/types";
import { getClientLocale, t, type SupportedLocale } from "@/lib/i18n/dictionary";
import { formatDayMonthLocale } from "@/lib/i18n/format";

/** Minimal task shape the aggregations need (a full Task always fits). */
export interface AnalyticsTaskInput {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  status: TaskStatus;
  priority: Priority;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
}

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "completed"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: t("analytics.statusTodo"),
  in_progress: t("analytics.statusInProgress"),
  in_review: t("analytics.statusInReview"),
  completed: t("analytics.statusCompleted"),
};

/** Locale-aware status labels (same shape as TASK_STATUS_LABELS). */
export function getTaskStatusLabels(locale?: SupportedLocale): Record<TaskStatus, string> {
  return {
    todo: t("analytics.statusTodo", undefined, locale),
    in_progress: t("analytics.statusInProgress", undefined, locale),
    in_review: t("analytics.statusInReview", undefined, locale),
    completed: t("analytics.statusCompleted", undefined, locale),
  };
}

/** Locale-aware priority labels (same shape as PRIORITY_LABELS). */
export function getPriorityLabels(locale?: SupportedLocale): Record<Priority, string> {
  return {
    low: t("projects.priorityLow", undefined, locale),
    medium: t("projects.priorityMedium", undefined, locale),
    high: t("projects.priorityHigh", undefined, locale),
    urgent: t("projects.priorityUrgent", undefined, locale),
  };
}

export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: t("projects.priorityLow"),
  medium: t("projects.priorityMedium"),
  high: t("projects.priorityHigh"),
  urgent: t("projects.priorityUrgent"),
};

/** Top-level tasks only — subtasks are never double-counted. */
export function topLevelTasks<T extends { parent_task_id: string | null }>(tasks: T[]): T[] {
  return tasks.filter((t) => t.parent_task_id == null);
}

// ---------------------------------------------------------------------------
// (1) Task status distribution
// ---------------------------------------------------------------------------

export interface StatusSlice {
  status: TaskStatus;
  label: string;
  count: number;
}

/** Counts of top-level tasks per status. Always returns all four statuses. */
export function statusDistribution(tasks: AnalyticsTaskInput[], locale?: SupportedLocale): StatusSlice[] {
  const top = topLevelTasks(tasks);
  const labels = getTaskStatusLabels(locale);
  return TASK_STATUSES.map((status) => ({
    status,
    label: labels[status],
    count: top.filter((t) => t.status === status).length,
  }));
}

export function statusSummary(slices: StatusSlice[], locale?: SupportedLocale): string {
  const total = slices.reduce((n, s) => n + s.count, 0);
  if (total === 0) return t("analytics.noTasks", undefined, locale);
  const completed = slices.find((s) => s.status === "completed")?.count ?? 0;
  const open = total - completed;
  return t("analytics.statusSummary", {
    total,
    totalS: total === 1 ? "" : "s",
    completed,
    open,
  }, locale);
}

// ---------------------------------------------------------------------------
// (2) Deadline health
// ---------------------------------------------------------------------------

export type DeadlineHealthKey = "on_time" | "completed_late" | "overdue" | "on_track" | "no_deadline";

export interface DeadlineHealthSlice {
  key: DeadlineHealthKey;
  label: string;
  count: number;
}

/** Locale-aware deadline-health labels (same shape as DEADLINE_HEALTH_LABELS). */
export function getDeadlineHealthLabels(locale?: SupportedLocale): Record<DeadlineHealthKey, string> {
  return {
    on_time: t("analytics.healthOnTime", undefined, locale),
    completed_late: t("analytics.healthCompletedLate", undefined, locale),
    overdue: t("analytics.healthOverdue", undefined, locale),
    on_track: t("analytics.healthOnTrack", undefined, locale),
    no_deadline: t("analytics.healthNoDeadline", undefined, locale),
  };
}

export const DEADLINE_HEALTH_LABELS: Record<DeadlineHealthKey, string> = {
  on_time: t("analytics.healthOnTime"),
  completed_late: t("analytics.healthCompletedLate"),
  overdue: t("analytics.healthOverdue"),
  on_track: t("analytics.healthOnTrack"),
  no_deadline: t("analytics.healthNoDeadline"),
};

/**
 * Buckets top-level tasks by getDeadlineState(): green -> On time,
 * amber -> Completed late, red -> Overdue, neutral -> On track,
 * none -> No deadline. Always returns all five buckets.
 */
export function deadlineHealth(
  tasks: AnalyticsTaskInput[],
  timezone: string,
  now: Date = new Date(),
  locale?: SupportedLocale,
): DeadlineHealthSlice[] {
  const counts: Record<DeadlineHealthKey, number> = {
    on_time: 0,
    completed_late: 0,
    overdue: 0,
    on_track: 0,
    no_deadline: 0,
  };
  for (const task of topLevelTasks(tasks)) {
    const state = getDeadlineState(task, timezone, now, locale).state;
    if (state === "green") counts.on_time += 1;
    else if (state === "amber") counts.completed_late += 1;
    else if (state === "red") counts.overdue += 1;
    else if (state === "neutral") counts.on_track += 1;
    else counts.no_deadline += 1;
  }
  const labels = getDeadlineHealthLabels(locale);
  return (Object.keys(counts) as DeadlineHealthKey[]).map((key) => ({
    key,
    label: labels[key],
    count: counts[key],
  }));
}

export function deadlineHealthSummary(slices: DeadlineHealthSlice[], locale?: SupportedLocale): string {
  const get = (key: DeadlineHealthKey) => slices.find((s) => s.key === key)?.count ?? 0;
  const total = slices.reduce((n, s) => n + s.count, 0);
  if (total === 0) return t("analytics.noTasks", undefined, locale);
  const parts: string[] = [];
  if (get("overdue") > 0) parts.push(t("analytics.healthOverduePart", { count: get("overdue") }, locale));
  if (get("completed_late") > 0) parts.push(t("analytics.healthCompletedLatePart", { count: get("completed_late") }, locale));
  if (get("on_time") > 0) parts.push(t("analytics.healthOnTimePart", { count: get("on_time") }, locale));
  if (get("on_track") > 0) parts.push(t("analytics.healthOnTrackPart", { count: get("on_track") }, locale));
  if (get("no_deadline") > 0) parts.push(t("analytics.healthNoDeadlinePart", { count: get("no_deadline") }, locale));
  return parts.join(" · ") + ".";
}

// ---------------------------------------------------------------------------
// (3) Workload by developer
// ---------------------------------------------------------------------------

export interface MemberWorkload {
  userId: string;
  name: string;
  /** Open (not completed) top-level tasks, by status. */
  byStatus: Record<Exclude<TaskStatus, "completed">, number>;
  open: number;
  overdue: number;
  completed: number;
}

/**
 * Per-member workload for top-level tasks. `members` is every workspace
 * member to list (managers included — they can hold tasks too); members
 * with no tasks still appear with zeroes so the chart never hides someone.
 * Subtasks are excluded (they follow their parent's assignee).
 */
export function workloadByMember(
  tasks: AnalyticsTaskInput[],
  members: { user_id: string; name: string }[],
  timezone: string,
  now: Date = new Date(),
  locale?: SupportedLocale,
): MemberWorkload[] {
  const top = topLevelTasks(tasks);
  return members.map((member) => {
    const mine = top.filter((t) => t.assigned_to === member.user_id);
    const open = mine.filter((t) => t.status !== "completed");
    const byStatus: MemberWorkload["byStatus"] = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
    };
    for (const task of open) {
      if (task.status !== "completed") byStatus[task.status] += 1;
    }
    return {
      userId: member.user_id,
      name: member.name,
      byStatus,
      open: open.length,
      overdue: open.filter((t) => getDeadlineState(t, timezone, now, locale).state === "red").length,
      completed: mine.filter((t) => t.status === "completed").length,
    };
  });
}

export function workloadSummary(rows: MemberWorkload[], locale?: SupportedLocale): string {
  const withWork = rows.filter((r) => r.open > 0);
  if (withWork.length === 0) return t("analytics.workloadEmpty", undefined, locale);
  const busiest = [...withWork].sort((a, b) => b.open - a.open)[0];
  const totalOverdue = rows.reduce((n, r) => n + r.overdue, 0);
  return t("analytics.workloadSummary", {
    count: withWork.length,
    countS: withWork.length === 1 ? "" : "s",
    name: busiest.name,
    open: busiest.open,
    overduePart:
      busiest.overdue > 0 ? t("analytics.workloadBusiestOverdue", { count: busiest.overdue }, locale) : "",
    totalPart: totalOverdue > 0 ? t("analytics.workloadTotalOverdue", { count: totalOverdue }, locale) : "",
  }, locale);
}

// ---------------------------------------------------------------------------
// (4) Completed per week — workspace-timezone weeks
// ---------------------------------------------------------------------------

/** Calendar date ("YYYY-MM-DD") of an instant in the given timezone. */
export function dateInTimezone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

/** Day of week (0 = Sunday … 6 = Saturday) of a YYYY-MM-DD date. */
function dayOfWeek(ymd: string): number {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(ymd: string, days: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * The Monday ("YYYY-MM-DD") of the workspace-timezone week containing
 * `instant`. Weeks run Monday → Sunday, in the workspace timezone — so a
 * completion late on Sunday UTC can belong to Monday's week in Dhaka.
 */
export function weekStartKey(instant: Date, timeZone: string): string {
  const wallDate = dateInTimezone(instant, timeZone);
  const dow = dayOfWeek(wallDate); // 0 = Sunday
  const daysSinceMonday = (dow + 6) % 7;
  return addDays(wallDate, -daysSinceMonday);
}

/** Short label for a week-start date, e.g. "3 Nov" / "৩ নভে". */
export function weekLabel(mondayYmd: string, locale?: SupportedLocale): string {
  const { y, m, d } = parseYmd(mondayYmd);
  return formatDayMonthLocale(new Date(Date.UTC(y, m - 1, d)), locale ?? getClientLocale(), "UTC");
}

export interface WeekBucket {
  /** Monday of the week ("YYYY-MM-DD", workspace timezone). */
  weekStart: string;
  label: string;
  completed: number;
}

/**
 * Completed top-level tasks per week, from `completed_at`, bucketed by
 * workspace-timezone week (Monday start).
 *
 * Only weeks that exist are returned: from the week of the earliest
 * completion through the current week, at most `maxWeeks` (default 8)
 * most recent weeks. Weeks inside that span with no completions are
 * shown with 0 — they are real weeks, not an invented trend. No
 * completions at all → an empty array (the chart shows its empty state).
 * Uncompleted tasks and tasks with no completed_at are ignored.
 */
export function completedPerWeek(
  tasks: AnalyticsTaskInput[],
  timezone: string,
  now: Date = new Date(),
  maxWeeks: number = 8,
  locale?: SupportedLocale,
): WeekBucket[] {
  const counts = new Map<string, number>();
  for (const task of topLevelTasks(tasks)) {
    if (task.status !== "completed" || !task.completed_at) continue;
    const key = weekStartKey(new Date(task.completed_at), timezone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  const currentWeek = weekStartKey(now, timezone);
  const earliestWeek = [...counts.keys()].sort()[0];

  // Walk Monday by Monday from the earliest completion week to this week.
  const weeks: string[] = [];
  let cursor = earliestWeek;
  while (cursor <= currentWeek) {
    weeks.push(cursor);
    cursor = addDays(cursor, 7);
  }
  const recent = weeks.slice(-maxWeeks);
  return recent.map((weekStart) => ({
    weekStart,
    label: weekLabel(weekStart, locale),
    completed: counts.get(weekStart) ?? 0,
  }));
}

export function completedPerWeekSummary(buckets: WeekBucket[], locale?: SupportedLocale): string {
  if (buckets.length === 0) return t("analytics.noTasks", undefined, locale);
  const total = buckets.reduce((n, b) => n + b.completed, 0);
  const best = [...buckets].sort((a, b) => b.completed - a.completed)[0];
  return t("analytics.weekSummary", {
    total,
    totalS: total === 1 ? "" : "s",
    weeks: buckets.length,
    weeksS: buckets.length === 1 ? "" : "s",
    bestPart:
      best.completed > 0
        ? t("analytics.weekSummaryBest", { label: best.label, count: best.completed }, locale)
        : "",
  }, locale);
}

// ---------------------------------------------------------------------------
// (5) Tasks by priority
// ---------------------------------------------------------------------------

export interface PrioritySlice {
  priority: Priority;
  label: string;
  count: number;
}

/** Counts of top-level tasks per priority. Always returns all four. */
export function tasksByPriority(tasks: AnalyticsTaskInput[], locale?: SupportedLocale): PrioritySlice[] {
  const top = topLevelTasks(tasks);
  const labels = getPriorityLabels(locale);
  return PRIORITIES.map((priority) => ({
    priority,
    label: labels[priority],
    count: top.filter((t) => t.priority === priority).length,
  }));
}

export function prioritySummary(slices: PrioritySlice[], locale?: SupportedLocale): string {
  const total = slices.reduce((n, s) => n + s.count, 0);
  if (total === 0) return t("analytics.noTasks", undefined, locale);
  const urgent = slices.find((s) => s.priority === "urgent")?.count ?? 0;
  const high = slices.find((s) => s.priority === "high")?.count ?? 0;
  return t("analytics.prioritySummary", { total, totalS: total === 1 ? "" : "s", urgent, high }, locale);
}

// ---------------------------------------------------------------------------
// (6) Project progress table
// ---------------------------------------------------------------------------

export interface ProjectProgressRow {
  projectId: string;
  projectName: string;
  projectStatus: Project["status"];
  dueDate: string | null;
  /** Deadline state of the project due date ("none" when no due date). */
  dueState: "green" | "red" | "amber" | "neutral" | "none";
  dueLabel: string;
  progress: ProgressResult;
  overdue: number;
}

/**
 * One row per project: progress via the official projectProgress()
 * formula (completed top-level tasks / all top-level tasks), total /
 * completed / overdue task counts, and the project due date with its
 * deadline chip state (a project due date is treated like a task due
 * date for the chip — never completed, so it reads On track / Overdue).
 */
export function projectProgressRows(
  projects: Project[],
  tasks: AnalyticsTaskInput[],
  timezone: string,
  now: Date = new Date(),
  locale?: SupportedLocale,
): ProjectProgressRow[] {
  return projects.map((project) => {
    const projectTasks = topLevelTasks(tasks.filter((t) => t.project_id === project.id));
    const progress = projectProgress(projectTasks);
    const due = project.due_date
      ? getDeadlineState({ status: "todo", due_date: project.due_date, completed_at: null }, timezone, now, locale)
      : null;
    return {
      projectId: project.id,
      projectName: project.name,
      projectStatus: project.status,
      dueDate: project.due_date,
      dueState: due?.state ?? "none",
      dueLabel: due?.label ?? t("deadline.noDeadline", undefined, locale),
      progress,
      overdue: projectTasks.filter((t) => getDeadlineState(t, timezone, now, locale).state === "red").length,
    };
  });
}

export function projectProgressSummary(rows: ProjectProgressRow[], locale?: SupportedLocale): string {
  if (rows.length === 0) return t("analytics.noProjects", undefined, locale);
  const done = rows.filter((r) => r.progress.total > 0 && r.progress.completed === r.progress.total).length;
  const overdueTotal = rows.reduce((n, r) => n + r.overdue, 0);
  return t("analytics.progressSummary", {
    count: rows.length,
    countS: rows.length === 1 ? "" : "s",
    done,
    overduePart:
      overdueTotal > 0
        ? t("analytics.progressOverdue", { count: overdueTotal, countS: overdueTotal === 1 ? "" : "s" }, locale)
        : t("analytics.progressNoneOverdue", undefined, locale),
  }, locale);
}
