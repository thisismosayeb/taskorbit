// Workspace-wide task list (Part 3, Step 0.3) — the KPI cards on the
// manager dashboard link here (Completed tasks ->
// /dashboard/tasks?status=completed, Overdue tasks ->
// /dashboard/tasks?overdue=1).
//
// Same filters / sort / pagination as /dashboard/my-tasks (lib/filters.ts
// is the single source of truth — see app/dashboard/my-tasks/page.tsx,
// the model for this page). The only differences are the scope and the
// "My tasks only" toggle:
//   - Manager: all tasks in the workspace.
//   - Developer: all workspace tasks, with "My tasks only" default ON
//     (resolveMine — an explicit ?mine=0 turns it off).
// RLS still applies: tasks are only ever loaded through this workspace's
// projects, never without the project filter.

import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { canChangeTaskStatus, isManager } from "@/lib/permissions";
import {
  filterTasks,
  paginate,
  parseTaskFilters,
  resolveMine,
  serializeTaskFilters,
  sortTasks,
  type RawSearchParams,
} from "@/lib/filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DeadlineLegend } from "@/components/dashboard/deadline-chip";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskFilters } from "@/components/tasks/task-filters";
import { Pagination } from "@/components/tasks/pagination";
import type { MemberOption } from "@/components/tasks/task-form";
import type { Profile, Project, Task } from "@/types";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function AllTasksPage({
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
  const mineOnly = resolveMine(filters, ctx.role);

  const supabase = await createClient();
  const { data: projectRows } = await supabase.from("projects").select("id, name").eq("workspace_id", ctx.workspace.id);
  const projects = (projectRows ?? []) as Pick<Project, "id" | "name">[];
  const projectIds = projects.map((p) => p.id);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  // Workspace-wide: every task in this workspace's projects. When the
  // workspace has no projects yet, there can be no tasks here — never
  // run the query without the project filter, or tasks from other
  // workspaces could leak in.
  let tasks: Task[] = [];
  if (projectIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("*")
      .in("project_id", projectIds)
      .order("due_date", { ascending: true, nullsFirst: false });
    tasks = (taskRows ?? []) as Task[];
  }
  if (mineOnly) {
    tasks = tasks.filter((task) => task.assigned_to === ctx.user!.id);
  }
  // Filters are applied in memory so status, priority, due range and
  // "Overdue only" (which needs the deadline state) all behave the same.
  const filteredTasks = sortTasks(filterTasks(tasks, filters, ctx.workspace.timezone), filters.sort);
  const paged = paginate(filteredTasks, filters.page);
  const pageQuery = serializeTaskFilters(filters);
  pageQuery.delete("page");
  const filtersActive =
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.assignee !== "all" ||
    filters.project !== "all" ||
    filters.dueFrom !== null ||
    filters.dueTo !== null ||
    filters.overdueOnly ||
    filters.mine !== null;

  // Subtask counts for top-level tasks shown here.
  const topIds = tasks.filter((t) => t.parent_task_id == null).map((t) => t.id);
  const { data: subRows } =
    topIds.length > 0 ? await supabase.from("tasks").select("id, parent_task_id, status").in("parent_task_id", topIds) : { data: [] as Task[] };
  const subtasks = (subRows ?? []) as Task[];

  const { data: memberRows } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", ctx.workspace.id);
  const memberIds = ((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const { data: profileRows } =
    memberIds.length > 0 ? await supabase.from("profiles").select("*").in("id", memberIds) : { data: [] as Profile[] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const memberOptions: MemberOption[] = memberIds.map((id) => ({
    user_id: id,
    full_name: profiles.get(id)?.full_name ?? null,
    email: null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("allTasks.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("allTasks.subtitle", { workspace: ctx.workspace.name })}
        </p>
      </div>

      <TaskFilters basePath="/dashboard/tasks" filters={filters} members={memberOptions} showAssignee showMine mine={mineOnly} />

      <Card>
        <CardHeader>
          <CardTitle>
            {t("allTasks.count", { count: paged.total, countS: paged.total === 1 ? "" : "s" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {paged.items.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                title={t("allTasks.noTasksTitle")}
                description={
                  filtersActive ? t("allTasks.noMatchBody") : t("allTasks.noTasksBody")
                }
              />
            </div>
          ) : (
            <>
              {paged.items.map((task) => {
                const subs = subtasks.filter((s) => s.parent_task_id === task.id);
                return (
                  <div key={task.id}>
                    {task.parent_task_id ? (
                      <p className="px-4 pt-2 text-xs text-muted sm:px-6">{t("allTasks.subtaskOf", { project: projectName.get(task.project_id) })}</p>
                    ) : (
                      <p className="px-4 pt-2 text-xs text-muted sm:px-6">{projectName.get(task.project_id)}</p>
                    )}
                    <TaskRow
                      task={task}
                      projectId={task.project_id}
                      timezone={ctx.workspace!.timezone}
                      members={memberOptions}
                      assigneeName={profiles.get(task.assigned_to ?? "")?.full_name ?? null}
                      assigneeEmail={null}
                      completedSubtasks={subs.filter((s) => s.status === "completed").length}
                      totalSubtasks={subs.length}
                      canEdit={isManager(ctx.role)}
                      canChangeStatus={canChangeTaskStatus(ctx.role, task.assigned_to, ctx.user!.id)}
                    />
                  </div>
                );
              })}
              <div className="px-4 pb-4 sm:px-6">
                <Pagination
                  basePath="/dashboard/tasks"
                  query={pageQuery.toString()}
                  page={paged.page}
                  totalPages={paged.totalPages}
                  total={paged.total}
                  pageSize={paged.pageSize}
                  itemLabel={filtersActive ? t("allTasks.itemsMatching") : t("allTasks.itemsTasks")}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <DeadlineLegend locale={locale} />
    </div>
  );
}
