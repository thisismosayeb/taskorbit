// Recharts charts for the analytics page (Part 2, Section 7).
//
// Client components: they receive only aggregated numbers from the
// server action, never raw task rows. Each chart has a fixed height and
// a text legend/tooltip so the data is readable without colour.

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DeadlineHealthSlice,
  MemberWorkload,
  PrioritySlice,
  StatusSlice,
  WeekBucket,
} from "@/lib/analytics";
import { getTaskStatusLabels } from "@/lib/analytics";
import { t, useLocale } from "@/lib/i18n";
// Chart colours come from the theme's CSS variables (Part 3, §6):
// useChartColors() reads :root / .dark and re-reads on theme change,
// so fills, grid lines, axis ticks and tooltips follow Light / Dark /
// System. The semantic hues stay the same in both themes; only the
// neutral / text / surface colours change with the theme.
import { useChartColors, type ChartColors } from "@/lib/theme/chart-colors";

function statusColors(c: ChartColors): Record<string, string> {
  return {
    todo: c.muted,
    in_progress: c.cyan,
    in_review: c.coral,
    completed: c.mint,
  };
}

function healthColors(c: ChartColors): Record<string, string> {
  return {
    on_time: c.success,
    completed_late: c.warning,
    overdue: c.danger,
    on_track: c.primary,
    no_deadline: c.muted,
  };
}

function priorityColors(c: ChartColors): Record<string, string> {
  return {
    low: c.muted,
    medium: c.cyan,
    high: c.warning,
    urgent: c.danger,
  };
}

function tooltipStyle(c: ChartColors): React.CSSProperties {
  return { backgroundColor: c.surface, border: `1px solid ${c.border}`, color: c.ink, borderRadius: 8 };
}

function ChartShell({ children, height = 260 }: { children: React.ReactNode; height?: number }) {
  // Subscribe so the aria-label re-renders when the language changes.
  useLocale();
  return (
    <div style={{ width: "100%", height }} role="img" aria-label={t("analytics.chartAria")}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** (1) Task status distribution — donut of top-level tasks. */
export function StatusDonut({ data }: { data: StatusSlice[] }) {
  useLocale();
  const colors = useChartColors();
  const fills = statusColors(colors);
  return (
    <ChartShell>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((slice) => (
            <Cell key={slice.status} fill={fills[slice.status]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle(colors)} formatter={(value) => [t("analytics.taskCount", { count: Number(value), countS: Number(value) === 1 ? "" : "s" }), t("analytics.tasksLabel")]} />
        <Legend wrapperStyle={{ color: colors.ink }} />
      </PieChart>
    </ChartShell>
  );
}

/** (2) Deadline health — one bar per health bucket. */
export function DeadlineHealthChart({ data }: { data: DeadlineHealthSlice[] }) {
  useLocale();
  const colors = useChartColors();
  const fills = healthColors(colors);
  return (
    <ChartShell>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.border} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.muted }} interval={0} angle={-18} textAnchor="end" height={56} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: colors.muted }} />
        <Tooltip contentStyle={tooltipStyle(colors)} formatter={(value) => [t("analytics.taskCount", { count: Number(value), countS: Number(value) === 1 ? "" : "s" }), t("analytics.tasksLabel")]} />
        <Bar dataKey="count" name={t("analytics.tasksLabel")} radius={[6, 6, 0, 0]}>
          {data.map((slice) => (
            <Cell key={slice.key} fill={fills[slice.key]} />
          ))}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export interface WorkloadChartRow {
  name: string;
  todo: number;
  in_progress: number;
  in_review: number;
}

/** (3) Workload by developer — stacked open tasks per member, by status. */
export function WorkloadChart({ data }: { data: MemberWorkload[] }) {
  const locale = useLocale();
  const colors = useChartColors();
  const fills = statusColors(colors);
  const statusLabels = getTaskStatusLabels(locale);
  const rows: WorkloadChartRow[] = data.map((m) => ({
    name: m.name,
    todo: m.byStatus.todo,
    in_progress: m.byStatus.in_progress,
    in_review: m.byStatus.in_review,
  }));
  return (
    <ChartShell height={280}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={colors.border} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: colors.muted }} />
        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12, fill: colors.muted }} />
        <Tooltip
          contentStyle={tooltipStyle(colors)}
          formatter={(value, name) => [
            t("analytics.taskCount", { count: Number(value), countS: Number(value) === 1 ? "" : "s" }),
            statusLabels[name as keyof typeof statusLabels] ?? name,
          ]}
        />
        <Legend wrapperStyle={{ color: colors.ink }} />
        <Bar dataKey="todo" name={t("analytics.statusTodo")} stackId="open" fill={fills.todo} />
        <Bar dataKey="in_progress" name={t("analytics.statusInProgress")} stackId="open" fill={fills.in_progress} />
        <Bar dataKey="in_review" name={t("analytics.statusInReview")} stackId="open" fill={fills.in_review} />
      </BarChart>
    </ChartShell>
  );
}

/** (4) Completed per week — last up to 8 workspace-timezone weeks. */
export function CompletedPerWeekChart({ data }: { data: WeekBucket[] }) {
  useLocale();
  const colors = useChartColors();
  return (
    <ChartShell>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.border} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.muted }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: colors.muted }} />
        <Tooltip
          contentStyle={tooltipStyle(colors)}
          formatter={(value) => [t("analytics.taskCount", { count: Number(value), countS: Number(value) === 1 ? "" : "s" }), t("analytics.completedLabel")]}
          labelFormatter={(label, payload) => {
            const week = payload?.[0]?.payload as WeekBucket | undefined;
            return week ? t("analytics.weekStarting", { label: week.label }) : t("analytics.weekStarting", { label: String(label) });
          }}
        />
        <Line type="monotone" dataKey="completed" name={t("analytics.completedLabel")} stroke={colors.primary} strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ChartShell>
  );
}

/** (5) Tasks by priority — one bar per priority. */
export function PriorityChart({ data }: { data: PrioritySlice[] }) {
  useLocale();
  const colors = useChartColors();
  const fills = priorityColors(colors);
  return (
    <ChartShell>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.border} />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: colors.muted }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: colors.muted }} />
        <Tooltip contentStyle={tooltipStyle(colors)} formatter={(value) => [t("analytics.taskCount", { count: Number(value), countS: Number(value) === 1 ? "" : "s" }), t("analytics.tasksLabel")]} />
        <Bar dataKey="count" name={t("analytics.tasksLabel")} radius={[6, 6, 0, 0]}>
          {data.map((slice) => (
            <Cell key={slice.priority} fill={fills[slice.priority]} />
          ))}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}
