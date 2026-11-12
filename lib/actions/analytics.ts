// Analytics server action (Part 2, Section 7).
//
// MANAGER ONLY, enforced here on the server — not just in the UI. A
// developer calling getAnalytics() directly gets { error } and no data.
// The page at app/dashboard/analytics/page.tsx checks the role again
// before rendering, so a developer never even sees the charts.
//
// All aggregation happens on the server: this action loads only the
// columns the charts need, runs the pure helpers in lib/analytics.ts,
// and returns plain JSON. Rows are never sent to the browser in bulk.

"use server";

import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { getServerLocale } from "@/lib/i18n/server";
import { isManager } from "@/lib/permissions";
import {
  completedPerWeek,
  dateInTimezone,
  deadlineHealth,
  projectProgressRows,
  statusDistribution,
  tasksByPriority,
  workloadByMember,
  type DeadlineHealthSlice,
  type MemberWorkload,
  type PrioritySlice,
  type ProjectProgressRow,
  type StatusSlice,
  type WeekBucket,
} from "@/lib/analytics";
import type { Priority, Project, TaskStatus } from "@/types";

interface AnalyticsTaskRow {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  status: TaskStatus;
  priority: Priority;
  assigned_to: string | null;
  due_date: string | null;
  completed_at: string | null;
}

export interface AnalyticsFilters {
  /** "all" / null = every project in the workspace. */
  projectId?: string | null;
  /** YYYY-MM-DD, workspace date. Applies to chart 4 (completed per week) only. */
  from?: string | null;
  /** YYYY-MM-DD, workspace date. Applies to chart 4 only. */
  to?: string | null;
}

export interface AnalyticsData {
  workspaceName: string;
  timezone: string;
  /** Projects the filter can choose from. */
  projectOptions: { id: string; name: string }[];
  projectId: string | null;
  from: string | null;
  to: string | null;
  totals: { projects: number; tasks: number; completed: number; overdue: number };
  status: StatusSlice[];
  deadlineHealth: DeadlineHealthSlice[];
  workload: MemberWorkload[];
  completedPerWeek: WeekBucket[];
  priority: PrioritySlice[];
  projectRows: ProjectProgressRow[];
}

export type AnalyticsResult = { data?: AnalyticsData; error?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export async function getAnalytics(filters: AnalyticsFilters = {}): Promise<AnalyticsResult> {
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) {
    return { error: "You must be logged in to view analytics." };
  }
  // Server-side role enforcement: developers get an error, never data.
  if (!isManager(ctx.role)) {
    return { error: "Only the workspace manager can view analytics." };
  }
  const { workspace } = ctx;
  const timezone = workspace.timezone || "Asia/Dhaka";

  const from = filters.from?.trim() || null;
  const to = filters.to?.trim() || null;
  if (from && !isValidDate(from)) return { error: "Enter a valid start date (YYYY-MM-DD)." };
  if (to && !isValidDate(to)) return { error: "Enter a valid end date (YYYY-MM-DD)." };
  if (from && to && from > to) return { error: "The start date must be before the end date." };

  const supabase = await createClient();

  const { data: projectRows, error: projectError } = await supabase
    .from("projects")
    .select("id, name, status, due_date")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });
  if (projectError) return { error: `Could not load projects: ${projectError.message}` };
  const allProjects = (projectRows ?? []) as Pick<Project, "id" | "name" | "status" | "due_date">[];
  const projectOptions = allProjects.map((p) => ({ id: p.id, name: p.name }));

  const projectId = filters.projectId?.trim() || null;
  if (projectId && !allProjects.some((p) => p.id === projectId)) {
    return { error: "That project is not in this workspace." };
  }
  const scopedProjects = projectId ? allProjects.filter((p) => p.id === projectId) : allProjects;
  const projectIds = scopedProjects.map((p) => p.id);

  // Only the columns the six charts need — never whole rows, never
  // subtasks' bodies. Subtasks ARE included (parent_task_id lets the
  // helpers exclude them from top-level counts).
  let tasks: AnalyticsTaskRow[] = [];
  if (projectIds.length > 0) {
    const { data: taskRows, error: taskError } = await supabase
      .from("tasks")
      .select("id, project_id, parent_task_id, status, priority, assigned_to, due_date, completed_at")
      .in("project_id", projectIds);
    if (taskError) return { error: `Could not load tasks: ${taskError.message}` };
    tasks = (taskRows ?? []) as AnalyticsTaskRow[];
  }

  // Workload names: every developer in the workspace, so someone with
  // no tasks still shows up with zeroes. (Managers are not listed —
  // this chart is workload by developer; the manager's own tasks are
  // visible on their dashboard task lists.)
  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspace.id)
    .eq("role", "developer");
  const members = (memberRows ?? []) as { user_id: string; role: string }[];
  const memberIds = members.map((m) => m.user_id);
  const { data: profileRows } =
    memberIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", memberIds)
      : { data: [] as { id: string; full_name: string | null }[] };
  const profileName = new Map(
    ((profileRows ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  );
  const memberList = members.map((m) => ({
    user_id: m.user_id,
    name: profileName.get(m.user_id) ?? (m.role === "manager" ? "Manager" : "Developer"),
  }));

  const now = new Date();

  // The date range filters chart 4 only: completed tasks whose completion
  // date (in the workspace timezone) falls inside [from, to].
  const weeklyTasks =
    from || to
      ? tasks.filter((t) => {
          if (!t.completed_at) return false;
          const day = dateInTimezone(new Date(t.completed_at), timezone);
          if (from && day < from) return false;
          if (to && day > to) return false;
          return true;
        })
      : tasks;

  // Locale for every chart label / summary string (Part 3, §7): the
  // request cookie, so the analytics page renders translated in one
  // server pass. The summary strings are computed here, not in the
  // page, so the locale has to be threaded in exactly once.
  const locale = await getServerLocale();
  const health = deadlineHealth(tasks, timezone, now, locale);
  const status = statusDistribution(tasks, locale);
  const topLevel = tasks.filter((t) => t.parent_task_id == null);

  return {
    data: {
      workspaceName: workspace.name,
      timezone,
      projectOptions,
      projectId,
      from,
      to,
      totals: {
        projects: scopedProjects.length,
        tasks: topLevel.length,
        completed: topLevel.filter((t) => t.status === "completed").length,
        overdue: health.find((s) => s.key === "overdue")?.count ?? 0,
      },
      status,
      deadlineHealth: health,
      workload: workloadByMember(tasks, memberList, timezone, now, locale),
      completedPerWeek: completedPerWeek(weeklyTasks, timezone, now, 8, locale),
      priority: tasksByPriority(tasks, locale),
      projectRows: projectProgressRows(
        scopedProjects.map((p) => ({
          ...p,
          workspace_id: workspace.id,
          description: null,
          priority: "medium",
          start_date: null,
          created_by: "",
          created_at: "",
          updated_at: "",
        })) as Project[],
        tasks,
        timezone,
        now,
        locale,
      ),
    },
  };
}
