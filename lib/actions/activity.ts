// Activity timeline data. Rows are written by the triggers in
// 0001_init.sql / 0002_rpc.sql — this module only reads them, and only for
// the active workspace (membership re-checked on every call).
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceRole } from "@/lib/actions/workspace";
import type { ActivityLog, Profile, Project, Task, WorkspaceMember, WorkspaceRole } from "@/types";

export interface ActivityListItem extends ActivityLog {
  actor: Profile | null;
  /** Project name, when the row belongs to a project (or its task). */
  projectName: string | null;
  /** Task title, when the row belongs to a task. */
  taskTitle: string | null;
}

export interface ActivityListResult {
  items: ActivityListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ActivityFilters {
  projectId?: string;
  memberId?: string;
  action?: string;
  page?: number;
}

export interface ActivityFilterOptions {
  projects: Pick<Project, "id" | "name">[];
  members: { userId: string; role: WorkspaceRole; name: string | null }[];
}

export const ACTIVITY_PAGE_SIZE = 20;

const uuidSchema = z.string().uuid();
const workspaceIdSchema = z.string().uuid();

const filtersSchema = z.object({
  projectId: uuidSchema.optional(),
  memberId: uuidSchema.optional(),
  action: z.string().trim().min(1).max(50).optional(),
  page: z.number().int().min(1).optional(),
});

/** Enriches raw activity rows with actor profiles and object names. */
async function enrich(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: ActivityLog[],
): Promise<ActivityListItem[]> {
  const actorIds = [...new Set(rows.map((r) => r.actor_id))];
  const projectIds = [...new Set(rows.map((r) => r.project_id).filter((id): id is string => id !== null))];
  const taskIds = [...new Set(rows.map((r) => r.task_id).filter((id): id is string => id !== null))];

  const { data: actorRows } =
    actorIds.length > 0 ? await supabase.from("profiles").select("*").in("id", actorIds) : { data: [] as Profile[] };
  const actors = new Map(((actorRows ?? []) as Profile[]).map((p) => [p.id, p]));

  const { data: projectRows } =
    projectIds.length > 0
      ? await supabase.from("projects").select("id, name").in("id", projectIds)
      : { data: [] as Pick<Project, "id" | "name">[] };
  const projects = new Map(
    ((projectRows ?? []) as Pick<Project, "id" | "name">[]).map((p) => [p.id, p.name]),
  );

  const { data: taskRows } =
    taskIds.length > 0
      ? await supabase.from("tasks").select("id, title, project_id").in("id", taskIds)
      : { data: [] as Pick<Task, "id" | "title" | "project_id">[] };
  const tasks = new Map(
    ((taskRows ?? []) as Pick<Task, "id" | "title" | "project_id">[]).map((t) => [t.id, t]),
  );

  return rows.map((row) => {
    const task = row.task_id ? tasks.get(row.task_id) : undefined;
    // A task row's project name fills in when the activity row itself has
    // no project_id (e.g. member.joined has neither).
    const projectName =
      (row.project_id ? projects.get(row.project_id) : undefined) ??
      (task ? projects.get(task.project_id) : undefined) ??
      null;
    return {
      ...row,
      actor: actors.get(row.actor_id) ?? null,
      projectName,
      taskTitle: task?.title ?? null,
    };
  });
}

export async function listActivity(
  workspaceId: string,
  filters: ActivityFilters = {},
): Promise<ActivityListResult> {
  const empty: ActivityListResult = { items: [], total: 0, page: 1, pageSize: ACTIVITY_PAGE_SIZE };
  try {
    const parsedWs = workspaceIdSchema.safeParse(workspaceId);
    if (!parsedWs.success) return empty;
    await requireWorkspaceRole(parsedWs.data);
    const parsed = filtersSchema.safeParse(filters);
    if (!parsed.success) return empty;
    const { projectId, memberId, action, page: rawPage } = parsed.data;
    const page = rawPage ?? 1;

    const supabase = await createClient();
    let query = supabase
      .from("activity_logs")
      .select("*", { count: "exact" })
      .eq("workspace_id", parsedWs.data);
    if (projectId) query = query.eq("project_id", projectId);
    if (memberId) query = query.eq("actor_id", memberId);
    if (action) query = query.eq("action", action);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * ACTIVITY_PAGE_SIZE, page * ACTIVITY_PAGE_SIZE - 1);
    if (error || !data) return empty;

    const items = await enrich(supabase, data as ActivityLog[]);
    return { items, total: count ?? 0, page, pageSize: ACTIVITY_PAGE_SIZE };
  } catch {
    return empty;
  }
}

/** Latest activity for the dashboard widget (newest first). */
export async function getRecentActivity(
  workspaceId: string,
  limit = 8,
): Promise<ActivityListItem[]> {
  try {
    const parsed = workspaceIdSchema.safeParse(workspaceId);
    if (!parsed.success) return [];
    await requireWorkspaceRole(parsed.data);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("workspace_id", parsed.data)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 20));
    if (error || !data) return [];
    return enrich(supabase, data as ActivityLog[]);
  } catch {
    return [];
  }
}

/** Project + member options for the activity page filters. */
export async function getActivityFilterOptions(workspaceId: string): Promise<ActivityFilterOptions> {
  const empty: ActivityFilterOptions = { projects: [], members: [] };
  try {
    const parsed = workspaceIdSchema.safeParse(workspaceId);
    if (!parsed.success) return empty;
    await requireWorkspaceRole(parsed.data);
    const supabase = await createClient();

    const { data: projectRows } = await supabase
      .from("projects")
      .select("id, name")
      .eq("workspace_id", parsed.data)
      .order("name", { ascending: true });
    const projects = ((projectRows ?? []) as Pick<Project, "id" | "name">[]).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    const { data: memberRows } = await supabase
      .from("workspace_members")
      .select("user_id, role")
      .eq("workspace_id", parsed.data);
    const members = (memberRows ?? []) as Pick<WorkspaceMember, "user_id" | "role">[];
    const memberIds = [...new Set(members.map((m) => m.user_id))];
    const { data: profileRows } =
      memberIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", memberIds) : { data: [] as Profile[] };
    const names = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p.full_name]));
    return {
      projects,
      members: members.map((m) => ({
        userId: m.user_id,
        role: m.role,
        name: names.get(m.user_id) ?? null,
      })),
    };
  } catch {
    return empty;
  }
}
