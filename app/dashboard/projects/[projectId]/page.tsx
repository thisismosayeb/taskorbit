import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { canManageProjects, canChangeTaskStatus, canEditTaskDetails } from "@/lib/permissions";
import { projectProgress } from "@/lib/progress";
import { filterTasks, paginate, parseTaskFilters, serializeTaskFilters, sortTasks, type RawSearchParams } from "@/lib/filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiquidProgress } from "@/components/motion/liquid-progress";
import { DeadlineLegend } from "@/components/dashboard/deadline-chip";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskFilters } from "@/components/tasks/task-filters";
import { Pagination } from "@/components/tasks/pagination";
import { AddTaskButton, type MemberOption } from "@/components/tasks/task-form";
import { ProjectActions } from "@/components/projects/project-actions";
import type { Profile, Project, ProjectStatus, Priority, Task } from "@/types";
import { createTranslator, getServerLocale, type SupportedLocale } from "@/lib/i18n/server";
import { formatDateShortLocale } from "@/lib/i18n/format";

// Module scope has no request locale (the bound `t` lives inside the
// page function), so status labels are built by this getter instead.
function getStatusLabels(tr: (key: string) => string): Record<ProjectStatus, string> {
  return {
    planning: tr("projects.statusPlanning"),
    active: tr("projects.statusActive"),
    on_hold: tr("projects.statusOnHold"),
    completed: tr("projects.statusCompleted"),
    archived: tr("projects.statusArchived"),
  };
}

const statusVariants: Record<ProjectStatus, "primary" | "mint" | "amber" | "green" | "neutral"> = {
  planning: "primary",
  active: "mint",
  on_hold: "amber",
  completed: "green",
  archived: "neutral",
};

const priorityVariants: Record<Priority, "neutral" | "cyan" | "amber" | "red"> = {
  low: "neutral",
  medium: "cyan",
  high: "amber",
  urgent: "red",
};

function formatDate(value: string | null, locale: SupportedLocale): string {
  if (!value) return createTranslator(locale)("common.notSet");
  return formatDateShortLocale(new Date(`${value}T00:00:00`), locale);
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams?: Promise<RawSearchParams>;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const statusLabels = getStatusLabels(t);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const { projectId } = await params;
  const filters = parseTaskFilters((await searchParams) ?? {});

  const supabase = await createClient();
  const { data: projectRow } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  const project = (projectRow ?? null) as Project | null;
  if (!project || project.workspace_id !== ctx.workspace.id) notFound();

  const manager = canManageProjects(ctx.role);
  const { data: taskRows } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", project.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  const allTasks = (taskRows ?? []) as Task[];
  const topTasks = allTasks.filter((t) => t.parent_task_id == null);
  const progress = projectProgress(allTasks);
  const filteredTasks = sortTasks(filterTasks(topTasks, filters, ctx.workspace.timezone), filters.sort);
  const paged = paginate(filteredTasks, filters.page);
  const pageQuery = serializeTaskFilters(filters);
  pageQuery.delete("page");
  const filtersActive =
    filters.status !== "all" ||
    filters.priority !== "all" ||
    filters.assignee !== "all" ||
    filters.dueFrom !== null ||
    filters.dueTo !== null ||
    filters.overdueOnly;

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", ctx.workspace.id);
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-bold break-words">{project.name}</h1>
          {project.description ? <p className="mt-1 max-w-2xl text-sm text-muted">{project.description}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant={statusVariants[project.status]}>{statusLabels[project.status]}</Badge>
            <Badge variant={priorityVariants[project.priority]}>{t("projects.priorityLabel", { priority: project.priority })}</Badge>
            <span className="text-xs text-muted">
              {formatDate(project.start_date, locale)} → {formatDate(project.due_date, locale)}
            </span>
          </div>
        </div>
        {manager ? <ProjectActions project={project} /> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("projects.progressTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted">
              {progress.total === 0
                ? t("projects.noTasksYet")
                : t("projects.ofTasksCompleted", { completed: progress.completed, total: progress.total })}
            </span>
            <span className="font-medium">{progress.label}</span>
          </div>
          <LiquidProgress percent={progress.percent} variant="bar" accent="manager" showLabel={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{t("projects.tasksCount", { count: topTasks.length })}</CardTitle>
          {manager ? <AddTaskButton projectId={project.id} members={memberOptions} /> : null}
        </CardHeader>
        <CardContent className="px-0 py-0">
          <div className="px-4 pb-4 sm:px-6">
            <TaskFilters basePath={`/dashboard/projects/${project.id}`} filters={filters} members={memberOptions} />
          </div>
          {paged.items.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState
                title={topTasks.length === 0 ? t("projects.noTasksYet") : t("projects.noTasksMatch")}
                description={
                  topTasks.length === 0
                    ? manager
                      ? t("projects.noTasksManagerBody")
                      : t("projects.noTasksDevBody")
                    : t("projects.noTasksFilterBody")
                }
              />
            </div>
          ) : (
            <>
              {paged.items.map((task) => {
                const subtasks = allTasks.filter((s) => s.parent_task_id === task.id);
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    projectId={project.id}
                    timezone={ctx.workspace!.timezone}
                    members={memberOptions}
                    assigneeName={profiles.get(task.assigned_to ?? "")?.full_name ?? null}
                    assigneeEmail={null}
                    completedSubtasks={subtasks.filter((s) => s.status === "completed").length}
                    totalSubtasks={subtasks.length}
                    canEdit={canEditTaskDetails(ctx.role, task.assigned_to, ctx.user!.id)}
                    canChangeStatus={canChangeTaskStatus(ctx.role, task.assigned_to, ctx.user!.id)}
                  />
                );
              })}
              <div className="px-4 pb-4 sm:px-6">
                <Pagination
                  basePath={`/dashboard/projects/${project.id}`}
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
