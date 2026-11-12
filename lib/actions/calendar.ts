// Calendar data (Part 2, §2).
//
// Events are tasks AND subtasks with a due_date in the active workspace.
// No Google Calendar integration — this is TaskOrbit's own calendar only.
// Dates are bucketed by the workspace timezone in lib/calendar.ts;
// `due_date` is a DATE, so it is already a workspace-timezone calendar
// date and is used as-is.

"use server";

import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { parseTaskFilters, resolveMine, type RawSearchParams } from "@/lib/filters";
import { completedPerWeek, type CompletedPerWeek } from "@/lib/calendar";
import type { Task, TaskStatus } from "@/types";

export type { CompletedPerWeek };

export interface CalendarEvent {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string;
  due_date: string | null;
  start_date: string | null;
  completed_at: string | null;
  project_id: string;
  project_name: string;
  parent_task_id: string | null;
  assigned_to: string | null;
}

export interface CalendarData {
  events: CalendarEvent[];
  /** Completions per ISO week, for the same project/assignee/mine scope (status filter excluded — it counts completed tasks by definition). */
  completedPerWeek: CompletedPerWeek[];
  timezone: string;
  error?: string;
}

const FALLBACK_TIMEZONE = "Asia/Dhaka";

export async function getCalendarData(rawFilters: RawSearchParams): Promise<CalendarData> {
  try {
    const ctx = await getDashboardContext();
    if (!ctx.user || !ctx.workspace || !ctx.role) {
      return { events: [], completedPerWeek: [], timezone: FALLBACK_TIMEZONE, error: "You must be logged in." };
    }
    const filters = parseTaskFilters(rawFilters);
    const mine = resolveMine(filters, ctx.role);

    const supabase = await createClient();
    const { data: projectRows } = await supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", ctx.workspace.id)
      .order("name");
    const projects = (projectRows ?? []) as { id: string; name: string }[];
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    let projectIds = projects.map((p) => p.id);
    if (filters.project !== "all") projectIds = projectIds.filter((id) => id === filters.project);

    let events: CalendarEvent[] = [];
    let perWeek: CompletedPerWeek[] = [];
    if (projectIds.length > 0) {
      let query = supabase
        .from("tasks")
        .select("*")
        .in("project_id", projectIds)
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .order("position", { ascending: true });
      if (filters.status !== "all") query = query.eq("status", filters.status as TaskStatus);
      if (filters.assignee !== "all") query = query.eq("assigned_to", filters.assignee);
      if (mine) query = query.eq("assigned_to", ctx.user.id);
      const { data: rows, error } = await query;
      if (error) return { events: [], completedPerWeek: [], timezone: ctx.workspace.timezone, error: `Could not load calendar events: ${error.message}` };

      events = ((rows ?? []) as Task[]).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        due_date: t.due_date,
        start_date: t.start_date,
        completed_at: t.completed_at,
        project_id: t.project_id,
        project_name: projectName.get(t.project_id) ?? "Project",
        parent_task_id: t.parent_task_id,
        assigned_to: t.assigned_to,
      }));

      // Completions per week, same scope (project / assignee / mine).
      let doneQuery = supabase.from("tasks").select("status, completed_at").in("project_id", projectIds).eq("status", "completed");
      if (filters.assignee !== "all") doneQuery = doneQuery.eq("assigned_to", filters.assignee);
      if (mine) doneQuery = doneQuery.eq("assigned_to", ctx.user.id);
      const { data: doneRows } = await doneQuery;
      perWeek = completedPerWeek(
        ((doneRows ?? []) as { status: string; completed_at: string | null }[]),
        ctx.workspace.timezone,
      );
    }

    return { events, completedPerWeek: perWeek, timezone: ctx.workspace.timezone };
  } catch (err) {
    return {
      events: [],
      completedPerWeek: [],
      timezone: FALLBACK_TIMEZONE,
      error: err instanceof Error ? err.message : "Could not load calendar events.",
    };
  }
}
