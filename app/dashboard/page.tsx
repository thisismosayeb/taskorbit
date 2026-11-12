// Dashboard (Part 2, Section 8) — upgraded.
//
// Manager: clickable KPI cards, Deadline Radar (Overdue / Due today /
// Due in next 3 days), Team workload mini list, Recent activity (latest
// 8, mounted from components/activity/recent-activity.tsx — owned by
// another track), Quick actions, and the project list.
// Developer: personal KPIs, Today's focus, Upcoming deadlines, My
// projects with progress, Recent comments on my tasks, personal chart.
//
// All deadline states come from getDeadlineState(); all progress from
// lib/progress.ts. No numbers are invented here.

import Link from "next/link";
import { AlertTriangle, Clock, FolderKanban, ListChecks, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { getDeadlineState } from "@/lib/date/deadline";
import { isManager } from "@/lib/permissions";
import { projectProgress } from "@/lib/progress";
import { statusDistribution, workloadByMember } from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LiquidProgress } from "@/components/motion/liquid-progress";
import { ProjectCard } from "@/components/projects/project-card";
import { DeadlineLegend } from "@/components/dashboard/deadline-chip";
import { DeadlineRadar, daysUntilDue } from "@/components/dashboard/deadline-radar";
import { TeamWorkload } from "@/components/dashboard/team-workload";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { EmptyState } from "@/components/dashboard/empty-state";
import { TaskRow } from "@/components/tasks/task-row";
import { PersonalStatusChart } from "@/components/analytics/personal-status-chart";
import RecentActivity from "@/components/activity/recent-activity";
import { AiDailyBriefCard } from "@/components/ai/daily-brief-card";
import type { MemberOption } from "@/components/tasks/task-form";
import type { Comment, Profile, Project, Task } from "@/types";
import { createTranslator, getServerLocale, type SupportedLocale } from "@/lib/i18n/server";

function StatCard({
  label,
  value,
  icon,
  href,
  locale,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  // The dashboard page passes the request locale so the aria label
  // translates server-side; StatCard itself stays a plain sync helper.
  locale?: SupportedLocale;
}) {
  const tr = createTranslator(locale ?? "en");
  const inner = (
    <CardContent className="flex items-center gap-3 pt-6">
      <span className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</span>
      <span>
        <span className="block font-heading text-2xl font-bold leading-none">{value}</span>
        <span className="mt-1 block text-xs text-muted">{label}</span>
      </span>
    </CardContent>
  );
  if (!href) return <Card className="dash-enter hover-lift">{inner}</Card>;
  return (
    <Link href={href} aria-label={tr("dashboard.statAria", { label, value })} className="block">
      <Card className="dash-enter hover-lift transition-shadow hover:shadow-md">
        <span className="block">{inner}</span>
      </Card>
    </Link>
  );
}

function formatDateShort(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const { workspace, role } = ctx;
  const manager = isManager(role);

  const supabase = await createClient();
  const { data: projectRows } = await supabase
    .from("projects")
    .select("*")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });
  const projects = (projectRows ?? []) as Project[];
  const projectIds = projects.map((p) => p.id);

  const { data: taskRows } =
    projectIds.length > 0
      ? await supabase.from("tasks").select("*").in("project_id", projectIds).order("due_date", { ascending: true })
      : { data: [] as Task[] };
  const tasks = (taskRows ?? []) as Task[];

  const assigneeIds = [...new Set(tasks.map((t) => t.assigned_to).filter((id): id is string => Boolean(id)))];
  const { data: profileRows } =
    assigneeIds.length > 0 ? await supabase.from("profiles").select("*").in("id", assigneeIds) : { data: [] as Profile[] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspace.id);
  const members = (memberRows ?? []) as { user_id: string; role: string }[];
  const memberOptions: MemberOption[] = members.map((m) => ({
    user_id: m.user_id,
    full_name: profiles.get(m.user_id)?.full_name ?? null,
    email: null,
  }));

  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const topLevel = tasks.filter((t) => t.parent_task_id == null);
  const completedTop = topLevel.filter((t) => t.status === "completed");
  const overdue = tasks.filter((t) => getDeadlineState(t, workspace.timezone, undefined, locale).state === "red");

  // ------------------------------------------------------------------
  // Developer dashboard
  // ------------------------------------------------------------------
  if (!manager) {
    const mine = tasks.filter((t) => t.assigned_to === ctx.user!.id);
    const mineTop = mine.filter((t) => t.parent_task_id == null);
    const mineOverdue = mine.filter((t) => getDeadlineState(t, workspace.timezone, undefined, locale).state === "red");

    // Today's focus: overdue + due today + urgent, overdue first, then
    // by due date, urgent before the rest within the same group.
    const isDueToday = (t: Task) => daysUntilDue(t, workspace.timezone) === 0;
    const focus = [...mine]
      .filter(
        (t) =>
          t.status !== "completed" &&
          (getDeadlineState(t, workspace.timezone, undefined, locale).state === "red" || isDueToday(t) || t.priority === "urgent"),
      )
      .sort((a, b) => {
        const rank = (t: Task) =>
          getDeadlineState(t, workspace.timezone, undefined, locale).state === "red" ? 0 : isDueToday(t) ? 1 : 2;
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });

    // Upcoming deadlines: due in the next 7 days (not today, not overdue).
    const upcoming = [...mine]
      .filter((t) => {
        if (t.status === "completed") return false;
        const d = daysUntilDue(t, workspace.timezone);
        return d !== null && d >= 1 && d <= 7;
      })
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

    // My projects: projects I have at least one task in, with progress.
    const myProjectIds = [...new Set(mine.map((t) => t.project_id))];
    const myProjects = projects.filter((p) => myProjectIds.includes(p.id));

    // Recent comments on my tasks (latest 5).
    const myTaskIds = mine.map((t) => t.id);
    const { data: commentRows } =
      myTaskIds.length > 0
        ? await supabase
            .from("comments")
            .select("*")
            .in("task_id", myTaskIds)
            .order("created_at", { ascending: false })
            .limit(5)
        : { data: [] as Comment[] };
    const comments = (commentRows ?? []) as Comment[];
    const authorIds = [...new Set(comments.map((c) => c.author_id))];
    const { data: authorRows } =
      authorIds.length > 0 ? await supabase.from("profiles").select("*").in("id", authorIds) : { data: [] as Profile[] };
    const authors = new Map(((authorRows ?? []) as Profile[]).map((p) => [p.id, p]));
    const commentTask = new Map(tasks.map((t) => [t.id, t]));

    const myStatus = statusDistribution(mineTop);

    const subtaskCount = (taskId: string) => tasks.filter((s) => s.parent_task_id === taskId);
    const taskList = (list: Task[]) =>
      list.map((task) => {
        const subtasks = subtaskCount(task.id);
        return (
          <TaskRow
            key={task.id}
            task={task}
            projectId={task.project_id}
            timezone={workspace.timezone}
            members={memberOptions}
            assigneeName={profiles.get(task.assigned_to ?? "")?.full_name ?? null}
            assigneeEmail={null}
            completedSubtasks={subtasks.filter((s) => s.status === "completed").length}
            totalSubtasks={subtasks.length}
            canEdit={false}
            canChangeStatus
          />
        );
      });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("dashboard.myDashboard")}</h1>
          <p className="mt-1 text-sm text-muted">{t("dashboard.mySubtitle", { workspace: workspace.name })}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard locale={locale} label={t("dashboard.assignedToMe")} value={mineTop.length} icon={<ListChecks className="h-5 w-5" />} href="/dashboard/my-tasks" />
          <StatCard locale={locale}
            label={t("dashboard.inProgressTasks")}
            value={mineTop.filter((t) => t.status === "in_progress").length}
            icon={<Clock className="h-5 w-5" />}
            href="/dashboard/my-tasks?status=in_progress"
          />
          <StatCard locale={locale}
            label={t("dashboard.myCompletedTasks")}
            value={mineTop.filter((t) => t.status === "completed").length}
            icon={<ListChecks className="h-5 w-5" />}
            href="/dashboard/my-tasks?status=completed"
          />
          <StatCard locale={locale} label={t("dashboard.myOverdueTasks")} value={mineOverdue.length} icon={<AlertTriangle className="h-5 w-5" />} href="#todays-focus" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("dashboard.myTasksByStatus")}</CardTitle>
              <p className="text-sm text-muted">
                {mineTop.length === 0
                  ? t("dashboard.noTasksAssigned")
                  : t("dashboard.ofCompleted", { completed: mineTop.filter((t) => t.status === "completed").length, total: mineTop.length })}
              </p>
            </CardHeader>
            <CardContent>
              {mineTop.length === 0 ? (
                <EmptyState title={t("dashboard.noTasksAssignedTitle")} description={t("dashboard.noTasksAssignedBody")} />
              ) : (
                <PersonalStatusChart data={myStatus} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("dashboard.myProjects")}</CardTitle>
              <p className="text-sm text-muted">{t("dashboard.myProjectsHint")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {myProjects.length === 0 ? (
                <p className="text-sm text-muted">{t("dashboard.noProjectsAssigned")}</p>
              ) : (
                myProjects.map((project) => {
                  const progress = projectProgress(tasks.filter((t) => t.project_id === project.id));
                  return (
                    <div key={project.id}>
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/dashboard/projects/${project.id}`} className="min-w-0 truncate font-medium hover:text-primary hover:underline">
                          {project.name}
                        </Link>
                        <span className="shrink-0 text-xs text-muted">
                          {progress.label}
                          {progress.total > 0 ? ` (${progress.completed}/${progress.total})` : ""}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <LiquidProgress percent={progress.percent} variant="bar" accent="manager" label={t("dashboard.projectProgressAria", { name: project.name, label: progress.label })} showLabel={false} />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <section id="todays-focus" className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">{t("dashboard.todaysFocus")}</h2>
          <Card>
            <CardContent className="px-0 py-0">
              {focus.length === 0 ? (
                <div className="px-6 py-6">
                  <EmptyState
                    title={t("dashboard.nothingUrgent")}
                    description={t("dashboard.nothingUrgentBody")}
                  />
                </div>
              ) : (
                taskList(focus)
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">{t("dashboard.upcoming")}</h2>
          <Card>
            <CardContent className="px-0 py-0">
              {upcoming.length === 0 ? (
                <div className="px-6 py-6">
                  <EmptyState title={t("dashboard.noUpcoming")} description={t("dashboard.noUpcomingBody")} />
                </div>
              ) : (
                taskList(upcoming)
              )}
            </CardContent>
          </Card>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold">{t("dashboard.recentComments")}</h2>
            <Link href="/dashboard/my-tasks" className="text-sm font-medium text-primary hover:underline">
              {t("dashboard.viewAllMyTasks")}
            </Link>
          </div>
          <Card>
            <CardContent className="divide-y divide-ink/5 px-0 py-0">
              {comments.length === 0 ? (
                <div className="px-6 py-6">
                  <EmptyState title={t("dashboard.noComments")} description={t("dashboard.noCommentsBody")} />
                </div>
              ) : (
                comments.map((comment) => {
                  const task = commentTask.get(comment.task_id);
                  const author = authors.get(comment.author_id);
                  return (
                    <div key={comment.id} className="flex gap-3 px-4 py-3 sm:px-6">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{author?.full_name ?? t("dashboard.aTeamMember")}</span>
                          <span className="text-muted"> {t("dashboard.onWord")} </span>
                          {task ? (
                            <Link href={`/dashboard/tasks/${task.id}`} className="font-medium hover:text-primary hover:underline">
                              {task.title}
                            </Link>
                          ) : (
                            <span>{t("dashboard.aTask")}</span>
                          )}
                          <span className="text-muted"> · {formatDateShort(comment.created_at)}</span>
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-muted">{comment.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>

        <DeadlineLegend locale={locale} />
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Manager dashboard
  // ------------------------------------------------------------------
  const developers = members
    .filter((m) => m.role === "developer")
    .map((m) => ({
      user_id: m.user_id,
      name: profiles.get(m.user_id)?.full_name ?? "Developer",
    }));
  const workload = workloadByMember(tasks, developers, workspace.timezone);
  const latestProjectId = projects[0]?.id ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("dashboard.managerSubtitle", { workspace: workspace.name })}</p>
        </div>
        <QuickActions latestProjectId={latestProjectId} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard locale={locale} label={t("dashboard.totalProjects")} value={projects.length} icon={<FolderKanban className="h-5 w-5" />} href="/dashboard/projects" />
        <StatCard locale={locale}
          label={t("dashboard.activeProjects")}
          value={projects.filter((p) => p.status === "active").length}
          icon={<FolderKanban className="h-5 w-5" />}
          href="/dashboard/projects?status=active"
        />
        <StatCard locale={locale}
          label={t("dashboard.completedTasks")}
          value={completedTop.length}
          icon={<ListChecks className="h-5 w-5" />}
          href="/dashboard/tasks?status=completed"
        />
        <StatCard locale={locale} label={t("dashboard.overdueTasks")} value={overdue.length} icon={<AlertTriangle className="h-5 w-5" />} href="/dashboard/tasks?overdue=1" />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title={t("dashboard.createFirstProject")}
          description={t("dashboard.noProjectsBody")}
          action={
            <Link href="/dashboard/projects/new">
              <Button>{t("common.createProject")}</Button>
            </Link>
          }
        />
      ) : (
        <>
          <DeadlineRadar tasks={tasks} projectName={projectName} timezone={workspace.timezone} locale={locale} />

          <TeamWorkload rows={workload} />

          <AiDailyBriefCard />

          <section className="space-y-3">
            <h2 className="font-heading text-lg font-semibold">{t("dashboard.recentActivity")}</h2>
            <RecentActivity />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold">{t("dashboard.projectsTitle")}</h2>
              <Link href="/dashboard/analytics" className="text-sm font-medium text-primary hover:underline">
                {t("dashboard.viewAnalytics")}
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} tasks={tasks.filter((t) => t.project_id === project.id)} />
              ))}
            </div>
          </section>

          <p className="text-xs text-muted">
            {t("dashboard.progressNote")}
          </p>
          <DeadlineLegend locale={locale} />
        </>
      )}
    </div>
  );
}
