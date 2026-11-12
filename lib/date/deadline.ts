import type { DeadlineState, TaskStatus } from "@/types";
import { getClientLocale, t, type SupportedLocale } from "@/lib/i18n/dictionary";
import { formatDateShortLocale } from "@/lib/i18n/format";

export interface DeadlineTaskInput {
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
}

export interface DeadlineResult {
  state: DeadlineState;
  label: string;
  detail: string;
}

/**
 * Offset of `timeZone` from UTC, in milliseconds, at the given instant.
 * Positive when the zone is ahead of UTC (e.g. Asia/Dhaka is +6h).
 */
export function getTimezoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
    get("fractionalSecond"),
  );
  return wallAsUtc - instant.getTime();
}

/**
 * The cutoff instant for a due date: 23:59:59.999 on `dueDate`
 * ("YYYY-MM-DD") as wall-clock time in `timeZone`.
 */
export function getDueCutoff(dueDate: string, timeZone: string): Date {
  const [y, m, d] = dueDate.split("-").map(Number);
  const targetAsUtc = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  // Solve instant = target - offset(instant) by fixed-point iteration.
  let instant = targetAsUtc - getTimezoneOffsetMs(new Date(targetAsUtc), timeZone);
  instant = targetAsUtc - getTimezoneOffsetMs(new Date(instant), timeZone);
  instant = targetAsUtc - getTimezoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/** Calendar date ("YYYY-MM-DD") of an instant in the given timezone. */
function dateInTimezone(instant: Date, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(instant);
}

/** Whole calendar days from `from` to `to` ("YYYY-MM-DD"), ignoring time. */
function calendarDayDiff(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      msPerDay,
  );
}

/**
 * Whole calendar days from today (in `timeZone`) to `dueDate`
 * ("YYYY-MM-DD"): 0 = due today, 1 = tomorrow, negative when past.
 * This is the same day count getDeadlineState() uses for its neutral
 * branch — the Deadline Radar uses it instead of parsing the display
 * label, so it stays correct in every locale.
 */
export function calendarDaysUntil(dueDate: string, timeZone: string, now: Date = new Date()): number {
  return calendarDayDiff(dateInTimezone(now, timeZone), dueDate);
}

/** "2 days 3 hours" / "1 day" / "3 hours" / "45 minutes" for a duration. */
function formatDuration(ms: number, locale?: SupportedLocale): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(days === 1 ? t("deadline.durationDayOne", { count: days }, locale) : t("deadline.durationDayOther", { count: days }, locale));
  if (hours > 0) parts.push(hours === 1 ? t("deadline.durationHourOne", { count: hours }, locale) : t("deadline.durationHourOther", { count: hours }, locale));
  if (parts.length === 0 && minutes > 0)
    parts.push(minutes === 1 ? t("deadline.durationMinuteOne", { count: minutes }, locale) : t("deadline.durationMinuteOther", { count: minutes }, locale));
  if (parts.length === 0) return t("deadline.durationLessThanMinute", undefined, locale);
  return parts.join(" ");
}

function formatDateShort(iso: string, locale?: SupportedLocale): string {
  return formatDateShortLocale(new Date(iso), locale ?? getClientLocale());
}

/**
 * Human-readable label for a task's deadline state (used by the task
 * detail page and by getDeadlineState).
 */
export function formatRelativeDeadline(
  task: DeadlineTaskInput,
  workspaceTimezone: string,
  now: Date = new Date(),
  locale?: SupportedLocale,
): string {
  return getDeadlineState(task, workspaceTimezone, now, locale).label;
}

/**
 * The single source of truth for deadline display. Cutoff is end of the
 * due date (23:59:59.999) in the workspace timezone.
 */
export function getDeadlineState(
  task: DeadlineTaskInput,
  workspaceTimezone: string,
  now: Date = new Date(),
  locale?: SupportedLocale,
): DeadlineResult {
  if (!task.due_date) {
    return {
      state: "none",
      label: t("deadline.noDeadline", undefined, locale),
      detail: t("deadline.noDeadlineDetail", undefined, locale),
    };
  }

  const cutoff = getDueCutoff(task.due_date, workspaceTimezone);
  const completedAt = task.completed_at ? new Date(task.completed_at) : null;

  if (task.status === "completed" && completedAt) {
    if (completedAt.getTime() <= cutoff.getTime()) {
      return {
        state: "green",
        label: t("deadline.completedOnTime", undefined, locale),
        detail: t("deadline.completedOn", {
          date: formatDateShort(task.completed_at as string, locale),
          dueDate: formatDateShort(task.due_date, locale),
        }, locale),
      };
    }
    const lateBy = formatDuration(
      completedAt.getTime() - cutoff.getTime(),
      locale,
    );
    return {
      state: "amber",
      label: t("deadline.completedLateWithDuration", { duration: lateBy }, locale),
      detail: t("deadline.completedAfter", { duration: lateBy, dueDate: formatDateShort(task.due_date, locale) }, locale),
    };
  }

  if (now.getTime() > cutoff.getTime()) {
    const overdueBy = formatDuration(now.getTime() - cutoff.getTime(), locale);
    return {
      state: "red",
      label: t("deadline.overdueBy", { duration: overdueBy }, locale),
      detail: t("deadline.overdueDetail", { date: formatDateShort(task.due_date, locale), duration: overdueBy }, locale),
    };
  }

  const daysUntil = calendarDayDiff(
    dateInTimezone(now, workspaceTimezone),
    task.due_date,
  );
  if (daysUntil <= 0) {
    return {
      state: "neutral",
      label: t("deadline.dueToday", undefined, locale),
      detail: t("deadline.dueTodayDetail", { date: formatDateShort(task.due_date, locale) }, locale),
    };
  }
  if (daysUntil === 1) {
    return {
      state: "neutral",
      label: t("deadline.dueTomorrow", undefined, locale),
      detail: t("deadline.dueTomorrowDetail", { date: formatDateShort(task.due_date, locale) }, locale),
    };
  }
  return {
    state: "neutral",
    label: t("deadline.dueInDays", { days: daysUntil }, locale),
    detail: t("deadline.dueInDaysDetail", { date: formatDateShort(task.due_date, locale), days: daysUntil }, locale),
  };
}

/**
 * Locale-aware deadline legend. The `DEADLINE_LEGEND` constant below is
 * kept (English, evaluated at import) for back-compat; renderers pass
 * the request locale so the legend translates.
 */
export function getDeadlineLegend(locale?: SupportedLocale): {
  state: DeadlineState;
  label: string;
  description: string;
}[] {
  return [
    { state: "green", label: t("deadline.completedOnTime", undefined, locale), description: t("deadline.legendGreen", undefined, locale) },
    { state: "red", label: t("deadline.overdue", undefined, locale), description: t("deadline.legendRed", undefined, locale) },
    { state: "amber", label: t("deadline.completedLate", undefined, locale), description: t("deadline.legendAmber", undefined, locale) },
    { state: "neutral", label: t("deadline.onTrack", undefined, locale), description: t("deadline.legendNeutral", undefined, locale) },
    { state: "none", label: t("deadline.noDeadline", undefined, locale), description: t("deadline.legendNone", undefined, locale) },
  ];
}

export const DEADLINE_LEGEND: {
  state: DeadlineState;
  label: string;
  description: string;
}[] = [
  {
    state: "green",
    label: t("deadline.completedOnTime"),
    description: t("deadline.legendGreen"),
  },
  {
    state: "red",
    label: t("deadline.overdue"),
    description: t("deadline.legendRed"),
  },
  {
    state: "amber",
    label: t("deadline.completedLate"),
    description: t("deadline.legendAmber"),
  },
  {
    state: "neutral",
    label: t("deadline.onTrack"),
    description: t("deadline.legendNeutral"),
  },
  {
    state: "none",
    label: t("deadline.noDeadline"),
    description: t("deadline.legendNone"),
  },
];
