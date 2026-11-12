// Calendar (Part 2, §2).
//
// Month view, week view and a list view (grouped by date). Events are tasks
// and subtasks with a due_date; clicking one opens the task. Each event
// shows its title plus its deadline state text and colour, from
// getDeadlineState() (lib/date/deadline.ts) — the single source of truth.
// Dates are worked out in the workspace timezone (lib/calendar.ts,
// date-fns-tz); "Today" is highlighted.
//
// - Month view: one chip per event on its due date (max 3 shown + "+N more").
// - Week view: multi-day events (both start_date and due_date set) render
//   as a bar spanning their days (lanes from lib/calendar assignLanes);
//   single-day events render as a 1-day bar. The month view does not
//   support spans, so it only marks the due date.
// - List view: the anchor month's events, grouped by date. This is also the
//   default view on screens under 640px (when no view is in the URL).
// - Navigation (previous / next / today) and view switching keep the
//   current month/week in the URL (?view=month&date=2026-11-01) along with
//   the active filters, so a calendar view can be refreshed or shared.
// - No Google Calendar integration, and none is claimed.

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDeadlineState } from "@/lib/date/deadline";
import {
  assignLanes,
  bucketEventsByDate,
  eventSpanDays,
  formatDayLabel,
  formatMonthLabel,
  formatShortDate,
  monthGrid,
  parseDateParts,
  weekContaining,
} from "@/lib/calendar";
import { serializeTaskFilters, type TaskFilterState } from "@/lib/filters";
import type { CalendarEvent, CompletedPerWeek } from "@/lib/actions/calendar";
import { FilterBar, type FilterBarMember, type FilterBarProject } from "@/components/tasks/filter-bar";
import type { DeadlineState } from "@/types";
import { t, useLocale} from "@/lib/i18n";

export type CalendarViewMode = "month" | "week" | "list";

const stateClasses: Record<DeadlineState, string> = {
  green: "bg-green-100 text-green-800",
  red: "bg-red-100 text-red-700",
  amber: "bg-amber-100 text-amber-800",
  neutral: "bg-cyan-100 text-cyan-800",
  none: "bg-slate-100 text-slate-600",
};

const WEEKDAYS = [
  t("calendar.mon"),
  t("calendar.tue"),
  t("calendar.wed"),
  t("calendar.thu"),
  t("calendar.fri"),
  t("calendar.sat"),
  t("calendar.sun"),
];

function shiftMonth(iso: string, n: number): string {
  const { year, month } = parseDateParts(iso);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function shiftDays(iso: string, n: number): string {
  const { year, month, day } = parseDateParts(iso);
  return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10);
}

function spanOf(event: CalendarEvent): { start: string; end: string } {
  const span = eventSpanDays(event);
  const due = event.due_date ?? "";
  return span ?? { start: due, end: due };
}

function EventChip({ event, timezone }: { event: CalendarEvent; timezone: string }) {
  useLocale();
  const state = getDeadlineState(event, timezone);
  return (
    <Link
      href={`/dashboard/tasks/${event.id}`}
      title={t("calendar.eventTitle", { title: event.title, label: state.label, detail: state.detail })}
      className={`block rounded-md px-1.5 py-0.5 text-xs leading-tight hover:underline ${stateClasses[state.state]}`}
    >
      <span className="block truncate font-medium">
        {event.parent_task_id ? "↳ " : ""}
        {event.title}
      </span>
      <span className="block truncate text-[10px] opacity-80">
        {state.label}
        {event.project_name ? ` · ${event.project_name}` : ""}
      </span>
    </Link>
  );
}

function MonthView({
  events,
  timezone,
  today,
  date,
}: {
  events: CalendarEvent[];
  timezone: string;
  today: string;
  date: string;
}) {
  useLocale();
  const { year, month } = parseDateParts(date);
  const weeks = monthGrid(year, month);
  const buckets = bucketEventsByDate(events);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-1 pb-1 text-center text-xs font-semibold uppercase tracking-wide text-muted">
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="mb-1 grid grid-cols-7 gap-1">
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === date.slice(0, 7);
              const dayEvents = buckets.get(day) ?? [];
              const isToday = day === today;
              return (
                <div
                  key={day}
                  className={`min-h-[96px] rounded-lg border p-1 ${
                    isToday ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-ink/10 bg-surface"
                  } ${inMonth ? "" : "opacity-45"}`}
                >
                  <p className={`px-1 text-xs font-semibold ${isToday ? "text-primary" : "text-ink"}`}>
                    {Number(day.slice(8, 10))}
                    {isToday ? <span className="ml-1 font-normal">{t("calendar.today")}</span> : null}
                  </p>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <EventChip key={event.id} event={event} timezone={timezone} />
                    ))}
                    {dayEvents.length > 3 ? (
                      <p className="px-1 text-[11px] text-muted">{t("calendar.more", { count: dayEvents.length - 3 })}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekView({
  events,
  timezone,
  today,
  date,
}: {
  events: CalendarEvent[];
  timezone: string;
  today: string;
  date: string;
}) {
  useLocale();
  const weekDays = weekContaining(date);
  const inWeek = events
    .filter((e) => e.due_date)
    .map((e) => ({ event: e, ...spanOf(e) }))
    .filter((s) => s.end >= weekDays[0] && s.start <= weekDays[6]);
  const lanes = assignLanes(
    inWeek.map((s) => ({ id: s.event.id, start: s.start, end: s.end })),
    weekDays,
  );
  const byId = new Map(inWeek.map((s) => [s.event.id, s.event]));
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day, i) => {
            const isToday = day === today;
            return (
              <div
                key={day}
                className={`rounded-lg border px-2 py-2 text-center ${
                  isToday ? "border-primary bg-primary/5 text-primary" : "border-ink/10 bg-surface"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide">{WEEKDAYS[i]}</p>
                <p className="text-lg font-bold leading-tight">{Number(day.slice(8, 10))}</p>
                <p className="text-[11px] text-muted">
                  {formatShortDate(day)}
                  {isToday ? t("calendar.todaySuffix") : ""}
                </p>
              </div>
            );
          })}
        </div>
        {inWeek.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t("calendar.noEventsWeek")}</p>
        ) : (
          <div className="mt-2 grid grid-cols-7 gap-1" style={{ gridAutoRows: "min-content" }}>
            {lanes.map((lane) => {
              const event = byId.get(lane.id);
              if (!event) return null;
              const state = getDeadlineState(event, timezone);
              return (
                <Link
                  key={event.id}
                  href={`/dashboard/tasks/${event.id}`}
                  title={t("calendar.weekEventTitle", { title: event.title, start: spanOf(event).start, end: spanOf(event).end, label: state.label, detail: state.detail })}
                  style={{ gridColumn: `${lane.startCol} / span ${lane.span}`, gridRow: lane.lane + 1 }}
                  className={`rounded-md px-2 py-1.5 text-xs hover:underline ${stateClasses[state.state]}`}
                >
                  <span className="block truncate font-medium">
                    {event.parent_task_id ? "↳ " : ""}
                    {event.title}
                  </span>
                  <span className="block truncate text-[10px] opacity-80">
                    {spanOf(event).start === spanOf(event).end
                      ? formatShortDate(spanOf(event).start)
                      : t("calendar.weekSpan", { start: formatShortDate(spanOf(event).start), end: formatShortDate(spanOf(event).end) })}
                    {` · ${state.label}`}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ListView({
  events,
  timezone,
  today,
  date,
}: {
  events: CalendarEvent[];
  timezone: string;
  today: string;
  date: string;
}) {
  useLocale();
  const month = date.slice(0, 7);
  const buckets = bucketEventsByDate(events.filter((e) => e.due_date?.startsWith(month)));
  const days = [...buckets.keys()].sort();
  if (days.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t("calendar.noEventsMonth", { month: formatMonthLabel(date) })}</p>;
  }
  return (
    <div className="space-y-5">
      {days.map((day) => (
        <section key={day} aria-label={formatDayLabel(day)}>
          <h3 className={`text-sm font-semibold ${day === today ? "text-primary" : "text-ink"}`}>
            {formatDayLabel(day)}
            {day === today ? t("calendar.todaySuffix") : ""}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {(buckets.get(day) ?? []).map((event) => (
              <li key={event.id}>
                <EventChip event={event} timezone={timezone} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function CalendarView({
  events,
  completedPerWeek,
  timezone,
  today,
  view,
  viewFromUrl,
  date,
  filters,
  mineResolved,
  projects,
  members,
}: {
  events: CalendarEvent[];
  completedPerWeek: CompletedPerWeek[];
  timezone: string;
  today: string;
  view: CalendarViewMode;
  /** True when the view came from ?view= in the URL (vs the server default). */
  viewFromUrl: boolean;
  date: string;
  filters: TaskFilterState;
  mineResolved: boolean;
  projects: FilterBarProject[];
  members: FilterBarMember[];
}) {
  useLocale();
  const router = useRouter();
  // On small screens the list view is the default when no view is in the URL.
  const [clientView, setClientView] = React.useState<CalendarViewMode>(view);
  React.useEffect(() => {
    if (!viewFromUrl && window.innerWidth < 640) setClientView("list");
    // Only on mount: the URL stays the source of truth afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function navigate(nextView: CalendarViewMode, nextDate: string) {
    const params = serializeTaskFilters(filters);
    params.set("view", nextView);
    params.set("date", nextDate);
    router.push(`/dashboard/calendar?${params.toString()}`);
  }

  const monthLabel = formatMonthLabel(date);
  const weekDays = weekContaining(date);
  const title =
    clientView === "month"
      ? monthLabel
      : clientView === "week"
        ? `${formatShortDate(weekDays[0])} – ${formatShortDate(weekDays[6])}, ${weekDays[6].slice(0, 4)}`
        : monthLabel;
  function stepDate(n: number): string {
    return clientView === "week" ? shiftDays(date, n * 7) : shiftMonth(date, n);
  }

  const thisWeek = completedPerWeek.find((w) => w.weekStart <= today && today < shiftDays(w.weekStart, 7));

  return (
    <div className="space-y-4">
      <FilterBar
        basePath="/dashboard/calendar"
        current={filters}
        mineResolved={mineResolved}
        projects={projects}
        members={members}
        showStatus
        preserve={{ view: clientView, date }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label={t("calendar.previousPeriod")} onClick={() => navigate(clientView, stepDate(-1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="min-w-[180px] text-center font-heading text-lg font-semibold">{title}</h2>
          <Button variant="outline" size="sm" aria-label={t("calendar.nextPeriod")} onClick={() => navigate(clientView, stepDate(1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(clientView, today)}>
            {t("calendar.today")}
          </Button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-ink/15 bg-surface p-1" role="group" aria-label={t("calendar.viewLabel")}>
          {(["month", "week", "list"] as CalendarViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={clientView === mode}
              onClick={() => navigate(mode, date)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                clientView === mode ? "bg-primary text-white" : "text-ink hover:bg-background"
              }`}
            >
              {mode === "month" ? t("calendar.viewMonth") : mode === "week" ? t("calendar.viewWeek") : t("calendar.viewList")}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {t("calendar.eventsSummary", { count: events.length, countS: events.length === 1 ? "" : "s" })}
        {` · ${thisWeek ? t("calendar.completedThisWeek", { date: formatShortDate(thisWeek.weekStart), count: thisWeek.count }) : t("calendar.completedThisWeekZero")}`}
      </p>

      {clientView === "month" ? (
        <MonthView events={events} timezone={timezone} today={today} date={date} />
      ) : clientView === "week" ? (
        <WeekView events={events} timezone={timezone} today={today} date={date} />
      ) : (
        <ListView events={events} timezone={timezone} today={today} date={date} />
      )}
    </div>
  );
}
