// Calendar date helpers (Part 2, §2).
//
// All dates are calendar dates in the *workspace* timezone. Tasks store
// `due_date` as a DATE ("YYYY-MM-DD"), which is already a workspace-timezone
// calendar date, so bucketing uses that string directly. Instants
// (`completed_at`, "now") are converted with date-fns-tz — that is the only
// place a timezone conversion happens, and it is what the Dhaka/UTC
// midnight-boundary tests exercise.
//
// Weeks are Monday-first. ISO weeks (for "completed per week") follow the
// Thursday rule: week 1 is the week containing the first Thursday.

import { formatInTimeZone } from "date-fns-tz";

/** Calendar date ("YYYY-MM-DD") of an instant in the given timezone. */
export function dateInTimezone(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

/** "Today" as a calendar date in the workspace timezone. */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  return dateInTimezone(now, timeZone);
}

export function parseDateParts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Shift a "YYYY-MM-DD" date by n days (pure UTC date math). */
export function addDays(iso: string, n: number): string {
  const { year, month, day } = parseDateParts(iso);
  return toIso(new Date(Date.UTC(year, month - 1, day + n)));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "2026-11" for a month. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * The month grid: weeks (Monday-first) of "YYYY-MM-DD" strings. Weeks
 * include the leading/trailing days from adjacent months so every week
 * has 7 days (a 5- or 6-week grid).
 */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const lastDay = daysInMonth(year, month);
  const start = new Date(first.getTime() - lead * 86_400_000);
  const weeks: string[][] = [];
  let cursor = start;
  for (;;) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(toIso(cursor));
      cursor = new Date(cursor.getTime() + 86_400_000);
    }
    weeks.push(week);
    // Stop once the week covered the last day of the month.
    if (week.includes(formatYmd(year, month, lastDay))) break;
  }
  return weeks;
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const { year, month, day } = parseDateParts(iso);
  const d = new Date(Date.UTC(year, month - 1, day));
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -offset);
}

/** The 7 days (Mon–Sun) of the week containing `iso`. */
export function weekContaining(iso: string): string[] {
  const monday = weekStart(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** "November 2026" for a date in the month. */
export function formatMonthLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** "Mon 10 Nov 2026". */
export function formatDayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${iso}T00:00:00Z`));
}

/** "10 Nov" (short, for chips). */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** ISO week key "2026-W46" for a calendar date (Thursday rule). */
export function isoWeekKey(dateStr: string): string {
  const { year, month, day } = parseDateParts(dateStr);
  const d = new Date(Date.UTC(year, month - 1, day));
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0
  const thursday = new Date(d.getTime() - offset * 86_400_000 + 3 * 86_400_000);
  const isoYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const jan4Offset = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - jan4Offset * 86_400_000);
  const week = Math.floor((thursday.getTime() - week1Monday.getTime()) / (7 * 86_400_000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Monday ("YYYY-MM-DD") of an ISO week, given its year and week number. */
export function mondayOfIsoWeek(isoYear: number, week: number): string {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const offset = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4.getTime() - offset * 86_400_000);
  return toIso(new Date(week1Monday.getTime() + (week - 1) * 7 * 86_400_000));
}

export interface CompletedPerWeek {
  weekKey: string;
  /** Monday of that ISO week, "YYYY-MM-DD". */
  weekStart: string;
  count: number;
}

/**
 * How many tasks were completed in each ISO week. `completed_at` is an
 * instant, so it is first converted to a calendar date in the workspace
 * timezone — a task completed at 00:30 Dhaka time is still the previous
 * day (and possibly the previous week) in UTC.
 */
export function completedPerWeek(
  tasks: { status: string; completed_at: string | null }[],
  timeZone: string,
): CompletedPerWeek[] {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    if (task.status !== "completed" || !task.completed_at) continue;
    const key = isoWeekKey(dateInTimezone(new Date(task.completed_at), timeZone));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, count]) => {
      const [year, week] = weekKey.split("-W").map(Number);
      return { weekKey, weekStart: mondayOfIsoWeek(year, week), count };
    });
}

/** Group events by their due date. Events without a due date are skipped. */
export function bucketEventsByDate<T extends { due_date: string | null }>(events: T[]): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const event of events) {
    if (!event.due_date) continue;
    const list = buckets.get(event.due_date) ?? [];
    list.push(event);
    buckets.set(event.due_date, list);
  }
  return buckets;
}

/** The date span of an event, only when BOTH dates exist (Decisions §: start shown only then). */
export function eventSpanDays(event: { start_date: string | null; due_date: string | null }): {
  start: string;
  end: string;
} | null {
  if (!event.start_date || !event.due_date) return null;
  if (event.start_date > event.due_date) return { start: event.due_date, end: event.start_date };
  return { start: event.start_date, end: event.due_date };
}

export interface SpannedEvent {
  id: string;
  start: string;
  end: string;
}

export interface LaneAssignment {
  id: string;
  /** Stacking lane (0 = top) within the week grid. */
  lane: number;
  /** 1-based grid column of the span start (clamped to the week). */
  startCol: number;
  /** Number of day-columns the bar spans (clamped to the week). */
  span: number;
}

/**
 * Assign week-view bars to non-overlapping lanes. Events are sorted by
 * start date; each goes into the first lane whose last event ends before
 * it starts. Columns are clamped to the given week (Mon–Sun). Callers must
 * only pass events that overlap the week at all.
 */
export function assignLanes(events: SpannedEvent[], weekDays: string[]): LaneAssignment[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const laneEnds: string[] = [];
  return sorted.map((event) => {
    const startIdx = weekDays.indexOf(event.start);
    const endIdx = weekDays.indexOf(event.end);
    const startCol = startIdx === -1 ? 1 : startIdx + 1;
    const endCol = endIdx === -1 ? 7 : endIdx + 1;
    const span = Math.max(1, endCol - startCol + 1);
    let lane = laneEnds.findIndex((lastEnd) => event.start > lastEnd);
    if (lane === -1) {
      laneEnds.push(event.end);
      lane = laneEnds.length - 1;
    } else {
      laneEnds[lane] = event.end;
    }
    return { id: event.id, lane, startCol, span };
  });
}
