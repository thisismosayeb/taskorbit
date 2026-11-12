import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { canDragTask, dragDisabledReason } from "@/lib/board-permissions";
import { parseTaskFilters, resolveMine, type RawSearchParams } from "@/lib/filters";
import { Board } from "@/components/board/board";
import type { BoardTaskView } from "@/components/board/board-card";
import { FilterBar } from "@/components/tasks/filter-bar";
import type { Profile, Project, Task } from "@/types";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function BoardPage({
  searchParams,
}: {
  searchParams?: Promise<RawSearchParams>;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const params = (await searchParams) ?? {};
  const filters = parseTaskFilters(params);
  const mine = resolveMine(filters, ctx.role);

  const supabase = await createClient();
  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", ctx.workspace.id)
    .order("name");
  const projects = (projectRows ?? []) as Pick<Project, "id" | "name">[];
  let projectIds = projects.map((p) => p.id);
  if (filters.project !== "all") projectIds = projectIds.filter((id) => id === filters.project);

  // Top-level tasks only.
  let tasks: Task[] = [];
  if (projectIds.length > 0) {
    let query = supabase
      .from("tasks")
      .select("*")
      .in("project_id", projectIds)
      .is("parent_task_id", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (filters.priority !== "all") query = query.eq("priority", filters.priority);
    if (filters.assignee !== "all") query = query.eq("assigned_to", filters.assignee);
    if (mine) query = query.eq("assigned_to", ctx.user.id);
    const { data: taskRows } = await query;
    tasks = (taskRows ?? []) as Task[];
  }

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const topIds = tasks.map((t) => t.id);
  const { data: subRows } =
    topIds.length > 0
      ? await supabase.from("tasks").select("id, parent_task_id, status").in("parent_task_id", topIds)
      : { data: [] as Task[] };
  const subtasks = (subRows ?? []) as Task[];

  const { data: memberRows } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", ctx.workspace.id);
  const memberIds = ((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const { data: profileRows } =
    memberIds.length > 0 ? await supabase.from("profiles").select("*").in("id", memberIds) : { data: [] as Profile[] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const memberOptions = memberIds.map((id) => ({
    user_id: id,
    full_name: profiles.get(id)?.full_name ?? null,
  }));

  const boardTasks: BoardTaskView[] = tasks.map((task) => {
    const subs = subtasks.filter((s) => s.parent_task_id === task.id);
    const canDrag = canDragTask(ctx.role, task.assigned_to, ctx.user!.id);
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      completed_at: task.completed_at,
      projectId: task.project_id,
      projectName: projectName.get(task.project_id) ?? t("board.projectFallback"),
      assignedTo: task.assigned_to,
      assigneeName: profiles.get(task.assigned_to ?? "")?.full_name ?? null,
      assigneeEmail: null,
      completedSubtasks: subs.filter((s) => s.status === "completed").length,
      totalSubtasks: subs.length,
      canDrag,
      dragReason: canDrag ? null : dragDisabledReason(ctx.role, task.assigned_to, ctx.user!.id),
    };
  });

  // Remount the board when the filters change, so its drag state always
  // starts from the freshly loaded tasks.
  const boardKey = `${filters.project}|${filters.assignee}|${filters.priority}|${mine}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("board.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("board.intro")}
          {ctx.role === "manager" ? t("board.introManagerSuffix") : t("board.introDeveloperSuffix")}
        </p>
      </div>

      <FilterBar
        basePath="/dashboard/board"
        current={filters}
        mineResolved={mine}
        projects={projects}
        members={memberOptions}
        showPriority
      />

      <Board
        key={boardKey}
        initialTasks={boardTasks}
        projectIds={projectIds}
        timezone={ctx.workspace.timezone}
        role={ctx.role}
        userId={ctx.user.id}
      />
    </div>
  );
}
