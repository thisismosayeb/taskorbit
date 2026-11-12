// Deadline Radar (Part 2, Section 8) — the manager dashboard's
// at-a-glance deadline list: Overdue, Due today, Due in next 3 days.
// States come from getDeadlineState() (single source of truth); the day
// counts come from calendarDaysUntil() — the same calendar-day count
// getDeadlineState() uses — never from parsing a display label, so the
// groups stay correct in every locale.

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DeadlineChip } from "@/components/dashboard/deadline-chip";
import { calendarDaysUntil, getDeadlineState } from "@/lib/date/deadline";
import type { Task } from "@/types";
import { createTranslator, t, type SupportedLocale } from "@/lib/i18n/dictionary";

/**
 * Whole days until the due date (0 = due today), or null when the task
 * has no deadline, is completed, or is already overdue.
 *
 * NOTE (Part 3): this used to parse getDeadlineState()'s display label
 * ("Due in N days") with an English regex — that broke the moment the
 * label was translated. It now uses calendarDaysUntil(), the same
 * calendar-day count getDeadlineState() uses for its neutral branch,
 * so the numbers are identical and locale-independent.
 */
export function daysUntilDue(task: Task, timezone: string, locale?: SupportedLocale): number | null {
  if (!task.due_date) return null;
  if (getDeadlineState(task, timezone, undefined, locale).state !== "neutral") return null;
  return calendarDaysUntil(task.due_date, timezone);
}

export interface RadarGroup {
  id: string;
  title: string;
  tone: "red" | "amber" | "default";
  tasks: Task[];
}

export function radarGroups(tasks: Task[], timezone: string, locale?: SupportedLocale): RadarGroup[] {
  const tr = locale ? createTranslator(locale) : t;
  const overdue = tasks.filter((t) => getDeadlineState(t, timezone, undefined, locale).state === "red");
  const dueToday = tasks.filter((t) => daysUntilDue(t, timezone, locale) === 0);
  const next3 = tasks.filter((t) => {
    const d = daysUntilDue(t, timezone, locale);
    return d !== null && d >= 1 && d <= 3;
  });
  return [
    { id: "overdue", title: tr("deadline.overdueGroup", { count: overdue.length }), tone: "red", tasks: overdue },
    { id: "due-today", title: tr("deadline.dueTodayGroup", { count: dueToday.length }), tone: "amber", tasks: dueToday },
    { id: "due-3-days", title: tr("deadline.dueNext3Group", { count: next3.length }), tone: "default", tasks: next3 },
  ];
}

function TaskLine({
  task,
  projectName,
  timezone,
  locale,
}: {
  task: Task;
  projectName: string | undefined;
  timezone: string;
  locale?: SupportedLocale;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
      <Link href={`/dashboard/tasks/${task.id}`} className="min-w-0 flex-1 font-medium hover:text-primary hover:underline">
        {task.title}
      </Link>
      {task.parent_task_id ? <span className="text-xs text-muted">{t("deadline.subtaskBadge", undefined, locale)}</span> : null}
      <span className="text-xs text-muted">{projectName}</span>
      <DeadlineChip task={task} timezone={timezone} locale={locale} />
    </div>
  );
}

export function DeadlineRadar({
  tasks,
  projectName,
  timezone,
  locale,
}: {
  tasks: Task[];
  projectName: Map<string, string>;
  timezone: string;
  // Server callers pass the request locale so the radar translates in
  // the first server pass; client callers omit it.
  locale?: SupportedLocale;
}) {
  const tr = locale ? createTranslator(locale) : t;
  const groups = radarGroups(tasks, timezone, locale);
  const total = groups.reduce((n, g) => n + g.tasks.length, 0);
  if (total === 0) {
    return (
      <section className="space-y-3" id="deadline-radar" aria-label={tr("deadline.radarTitle")}>
        <h2 className="font-heading text-lg font-semibold">{tr("deadline.radarTitle")}</h2>
        <Card>
          <CardContent className="px-6 py-6 text-sm text-muted">
            {tr("deadline.radarEmpty")}
          </CardContent>
        </Card>
      </section>
    );
  }
  return (
    <section className="space-y-4" id="deadline-radar" aria-label={tr("deadline.radarTitle")}>
      <h2 className="font-heading text-lg font-semibold">{tr("deadline.radarTitle")}</h2>
      {groups.map((group) =>
        group.tasks.length > 0 ? (
          <div key={group.id} className="space-y-2">
            <h3
              className={
                group.tone === "red"
                  ? "font-heading text-base font-semibold text-red-700"
                  : group.tone === "amber"
                    ? "font-heading text-base font-semibold text-amber-700"
                    : "font-heading text-base font-semibold"
              }
            >
              {group.title}
            </h3>
            <Card>
              <CardContent className="divide-y divide-ink/5 px-0 py-0">
                {group.tasks.map((task) => (
                  <TaskLine key={task.id} task={task} projectName={projectName.get(task.project_id)} timezone={timezone} locale={locale} />
                ))}
              </CardContent>
            </Card>
          </div>
        ) : null,
      )}
    </section>
  );
}
