// TaskOrbit AI / daily scheduler — pure due-soon / overdue selection
// (Part 3, spec section 9). Unit-tested, including the Dhaka midnight
// boundary: "today" is always the workspace-local date, never the UTC
// date, so a task due 2026-11-12 in Asia/Dhaka is due-soon at
// 2026-11-11 19:00 UTC and overdue at 2026-11-12 18:00:01 UTC.
//
// The same rules live in the database (run_daily_reminders in migration
// 0007) — this module is the testable mirror used by the unit tests and
// by any server-side caller that already holds the rows.

export interface ReminderTaskInput {
  id: string;
  parent_task_id: string | null;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
}

/** YYYY-MM-DD wall-clock date of `now` in `timezone` (defaults to Asia/Dhaka). */
export function localDateInTimezone(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Add `days` to a YYYY-MM-DD date. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Due soon: top-level tasks due today or tomorrow (workspace-local
 * dates), not completed, with an assignee. Subtasks follow their parent
 * and are not notified separately.
 */
export function selectDueSoonTasks(
  tasks: ReminderTaskInput[],
  localDate: string,
): ReminderTaskInput[] {
  const tomorrow = addDays(localDate, 1);
  return tasks.filter(
    (t) =>
      t.parent_task_id === null &&
      t.status !== "completed" &&
      t.assigned_to !== null &&
      t.due_date !== null &&
      t.due_date >= localDate &&
      t.due_date <= tomorrow,
  );
}

/**
 * Overdue: top-level tasks whose due date has passed, not completed,
 * with an assignee, that have NOT already had an overdue notification
 * (once per task ever — `alreadyNotifiedTaskIds` comes from the
 * notifications table). Tasks due today are not overdue yet: the cutoff
 * is 23:59:59 of the due date in the workspace timezone.
 */
export function selectOverdueTasks(
  tasks: ReminderTaskInput[],
  localDate: string,
  alreadyNotifiedTaskIds: ReadonlySet<string>,
): ReminderTaskInput[] {
  return tasks.filter(
    (t) =>
      t.parent_task_id === null &&
      t.status !== "completed" &&
      t.assigned_to !== null &&
      t.due_date !== null &&
      t.due_date < localDate &&
      !alreadyNotifiedTaskIds.has(t.id),
  );
}

/** Idempotency key for one workspace + job + local date (daily_job_runs). */
export function dailyJobKey(workspaceId: string, job: string, localDate: string): string {
  return `${workspaceId}:${job}:${localDate}`;
}
