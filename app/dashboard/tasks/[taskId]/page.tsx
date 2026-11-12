import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { canChangeTaskStatus, canCreateSubtask, canManageSubtask } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { DeadlineChip } from "@/components/dashboard/deadline-chip";
import { StatusSelect } from "@/components/tasks/status-select";
import { SubtaskList } from "@/components/tasks/subtask-list";
import { CommentThread, type CommentWithAuthor } from "@/components/comments/comment-thread";
import { TaskRealtime } from "@/components/tasks/task-realtime";
import type { ActivityLog, Profile, Project, Task, Comment, Priority } from "@/types";
import { createTranslator, getServerLocale, type SupportedLocale } from "@/lib/i18n/server";
import { formatDateShortLocale, formatDateTimeLocale } from "@/lib/i18n/format";

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

function formatDateTime(iso: string | null, timezone: string, locale: SupportedLocale): string {
  if (!iso) return "—";
  return formatDateTimeLocale(new Date(iso), locale, timezone);
}

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const { taskId } = await params;

  const supabase = await createClient();
  const { data: taskRow } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  const task = (taskRow ?? null) as Task | null;
  if (!task) notFound();

  const { data: projectRow } = await supabase.from("projects").select("*").eq("id", task.project_id).maybeSingle();
  const project = (projectRow ?? null) as Project | null;
  if (!project || project.workspace_id !== ctx.workspace.id) notFound();

  const isSubtask = task.parent_task_id != null;
  let parent: Task | null = null;
  if (isSubtask) {
    const { data: parentRow } = await supabase.from("tasks").select("*").eq("id", task.parent_task_id as string).maybeSingle();
    parent = (parentRow ?? null) as Task | null;
  }

  const { data: subtaskRows } = !isSubtask
    ? await supabase.from("tasks").select("*").eq("parent_task_id", task.id).order("position", { ascending: true })
    : { data: [] as Task[] };
  const subtasks = (subtaskRows ?? []) as Task[];

  const { data: commentRows } = await supabase
    .from("comments")
    .select("*")
    .eq("task_id", task.id)
    .order("created_at", { ascending: true });
  const comments = (commentRows ?? []) as Comment[];
  const authorIds = [...new Set(comments.map((c) => c.author_id))];
  const { data: authorRows } =
    authorIds.length > 0 ? await supabase.from("profiles").select("*").in("id", authorIds) : { data: [] as Profile[] };
  const authors = new Map(((authorRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const commentsWithAuthors: CommentWithAuthor[] = comments.map((c) => ({
    ...c,
    author: authors.get(c.author_id) ?? null,
  }));

  const { data: activityRows } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("task_id", task.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const activities = (activityRows ?? []) as ActivityLog[];
  const actorIds = [...new Set(activities.map((a) => a.actor_id))];
  const { data: actorRows } =
    actorIds.length > 0 ? await supabase.from("profiles").select("*").in("id", actorIds) : { data: [] as Profile[] };
  const actors = new Map(((actorRows ?? []) as Profile[]).map((p) => [p.id, p]));

  let assignee: Profile | null = null;
  if (task.assigned_to) {
    const { data: assigneeRow } = await supabase.from("profiles").select("*").eq("id", task.assigned_to).maybeSingle();
    assignee = (assigneeRow ?? null) as Profile | null;
  }

  const timezone = ctx.workspace.timezone;
  const canChange = canChangeTaskStatus(ctx.role, task.assigned_to, ctx.user.id);
  const canCreate = !isSubtask && canCreateSubtask(ctx.role, task, ctx.user.id);
  const canManage = !isSubtask && canManageSubtask(ctx.role, task.assigned_to, ctx.user.id, true);
  // Real subtask counts for the persistent parent-completion message in the
  // status control (0/0 on a subtask page — subtasks have no children).
  const subtaskDone = subtasks.filter((s) => s.status === "completed").length;
  const subtaskTotal = subtasks.length;

  return (
    <div className="space-y-6">
      <TaskRealtime taskId={task.id} />
      <div>
        <Link href={`/dashboard/projects/${project.id}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> {project.name}
        </Link>
        {parent ? (
          <Link href={`/dashboard/tasks/${parent.id}`} className="mt-1 flex items-center gap-1 text-sm text-muted hover:text-primary">
            <ArrowUp className="h-4 w-4" /> {t("tasks.parentTaskLink", { title: parent.title })}
          </Link>
        ) : null}
        <h1 className="mt-2 font-heading text-2xl font-bold break-words">{task.title}</h1>
        {task.description ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-muted">{task.description}</p> : null}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-6">
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("tasks.statusLabel")}</span>
            <StatusSelect
              task={task}
              canChange={canChange}
              subtaskDone={subtaskDone}
              subtaskTotal={subtaskTotal}
              isDeveloper={ctx.role === "developer"}
            />
          </span>
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("tasks.priority")}</span>
            <Badge variant={priorityVariants[task.priority]}>{task.priority}</Badge>
          </span>
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("tasks.assigneeLabel")}</span>
            {task.assigned_to ? (
              <span className="flex items-center gap-2">
                <Avatar name={assignee?.full_name} size="sm" />
                {assignee?.full_name || t("common.memberFallback")}
              </span>
            ) : (
              t("tasks.unassigned")
            )}
          </span>
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t("tasks.deadlineLabel")}</span>
            <DeadlineChip task={task} timezone={timezone} locale={locale} />
          </span>
          <span className="text-sm text-muted">
            {t("tasks.datesLabel", { start: formatDate(task.start_date, locale), end: formatDate(task.due_date, locale) })}
          </span>
          {task.status === "completed" ? (
            <span className="text-sm text-muted">{t("tasks.completedAtLabel", { date: formatDateTime(task.completed_at, timezone, locale) })}</span>
          ) : null}
        </CardContent>
      </Card>

      {!isSubtask ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("tasks.subtasksTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SubtaskList
              parentTask={task}
              subtasks={subtasks}
              timezone={timezone}
              canCreate={canCreate}
              canManage={canManage}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("tasks.commentsTitle", { count: comments.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentThread
            taskId={task.id}
            comments={commentsWithAuthors}
            currentUserId={ctx.user.id}
            role={ctx.role}
            timezone={timezone}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("tasks.activityTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-muted">{t("tasks.noActivity")}</p>
          ) : (
            <ul className="space-y-3">
              {activities.map((log) => (
                <li key={log.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-medium text-ink">{actors.get(log.actor_id)?.full_name || t("common.someone")}</span>
                  <span className="text-muted">{log.action}</span>
                  <span className="text-xs text-muted">{formatDateTime(log.created_at, timezone, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
