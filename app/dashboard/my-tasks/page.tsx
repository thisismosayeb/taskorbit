import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { canChangeTaskStatus } from "@/lib/permissions";
import { filterTasks, paginate, parseTaskFilters, serializeTaskFilters, sortTasks, type RawSearchParams } from "@/lib/filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { DeadlineLegend } from "@/components/dashboard/deadline-chip";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskFilters } from "@/components/tasks/task-filters";
import { Pagination } from "@/components/tasks/pagination";
import type { MemberOption } from "@/components/tasks/task-form";
import type { Profile, Project, Task } from "@/types";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function MyTasksPage({
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

  const supabase = await createClient();
  const { data: projectRows } = await supabase.from("projects").select("id, name").eq("workspace_id", ctx.workspace.id);
  const projects = (projectRows ?? []) as Pick<Project, "id" | "name">[];
  const projectIds = projects.map((p) => p.id);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  // Only query tasks inside this workspace's projects. When the workspace
  // has no projects yet, there can be no tasks here — never run the query
  // without the project filter, or tasks from other workspaces could leak in.
  let tasks: Task[] = [];
  if (projectIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("*")
      .eq("assigned_to", ctx.user.id)
      .in("project_id", projectIds)
      .order("due_date", { ascending: true, nullsFirst: false });
    tasks = (taskRows ?? []) as Task[];
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
    filters.dueFrom !== null ||
    filters.dueTo !== null ||
    filters.overdueOnly;

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
        <h1 className="font-heading text-2xl font-bold">{t("myTasks.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("myTasks.subtitle", { workspace: ctx.workspace.name })}
        </p>
      </div>

      <TaskFilters basePath="/dashboard/my-tasks" filters={filters} members={memberOptions} showAssignee={false} />

      <Card>
        <CardHeader>
          <CardTitle>
            {t("myTasks.count", { count: paged.total, countS: paged.total === 1 ? "" : "s" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 py-0">
          {paged.items.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                title={t("myTasks.noTasksTitle")}
                description={
                  filtersActive ? t("myTasks.noMatchBody") : t("myTasks.noTasksBody")
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
                      <p className="px-4 pt-2 text-xs text-muted sm:px-6">{t("myTasks.subtaskOf", { project: projectName.get(task.project_id) })}</p>
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
                      canEdit={false}
                      canChangeStatus={canChangeTaskStatus(ctx.role, task.assigned_to, ctx.user!.id)}
                    />
                  </div>
                );
              })}
              <div className="px-4 pb-4 sm:px-6">
                <Pagination
                  basePath="/dashboard/my-tasks"
                  query={pageQuery.toString()}
                  page={paged.page}
                  totalPages={paged.totalPages}
                  total={paged.total}
                  pageSize={paged.pageSize}
                  itemLabel={filtersActive ? t("myTasks.itemsMatching") : t("myTasks.itemsTasks")}
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
