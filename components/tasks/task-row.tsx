"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { DeadlineChip } from "@/components/dashboard/deadline-chip";
import { TaskForm, type MemberOption } from "@/components/tasks/task-form";
import { StatusSelect } from "@/components/tasks/status-select";
import { deleteTask } from "@/lib/actions/tasks";
import { useToast } from "@/components/ui/toast";
import type { Priority, Task } from "@/types";
import { t, useLocale} from "@/lib/i18n";

const priorityVariants: Record<Priority, "neutral" | "cyan" | "amber" | "red"> = {
  low: "neutral",
  medium: "cyan",
  high: "amber",
  urgent: "red",
};

export function TaskRow({
  task,
  projectId,
  timezone,
  members,
  assigneeName,
  assigneeEmail,
  completedSubtasks,
  totalSubtasks,
  canEdit,
  canChangeStatus,
}: {
  task: Task;
  projectId: string;
  timezone: string;
  members: MemberOption[];
  assigneeName: string | null;
  assigneeEmail: string | null;
  completedSubtasks: number;
  totalSubtasks: number;
  canEdit: boolean;
  canChangeStatus: boolean;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-3 border-b border-ink/5 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <div className="min-w-0 flex-1">
        <Link href={`/dashboard/tasks/${task.id}`} className="font-medium text-ink hover:text-primary hover:underline">
          {task.title}
        </Link>
        {task.description ? <p className="mt-0.5 line-clamp-1 text-sm text-muted">{task.description}</p> : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <Badge variant={priorityVariants[task.priority]}>{t("tasks.priorityLabel", { priority: task.priority })}</Badge>
          <DeadlineChip task={task} timezone={timezone} />
          {totalSubtasks > 0 ? (
            <span className="text-xs text-muted" title={t("board.subtasksDoneTitle", { done: completedSubtasks, total: totalSubtasks })}>
              {t("board.subtasksFraction", { done: completedSubtasks, total: totalSubtasks })}
            </span>
          ) : (
            <span className="text-xs text-muted">{t("tasks.noSubtasks")}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {task.assigned_to ? (
          <span className="flex items-center gap-2 text-sm text-muted" title={assigneeEmail ?? undefined}>
            <Avatar name={assigneeName} email={assigneeEmail} size="sm" />
            <span className="max-w-[120px] truncate">{assigneeName || assigneeEmail || t("common.memberFallback")}</span>
          </span>
        ) : (
          <span className="text-sm text-muted">{t("tasks.unassigned")}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <StatusSelect task={task} canChange={canChangeStatus} />
        {canEdit ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("tasks.editTaskAria", { title: task.title })}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t("tasks.deleteTaskAria", { title: task.title })}
              onClick={() => setDeleteOpen(true)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        ) : null}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen} title={t("tasks.editTask")} description={t("tasks.editTaskBody", { title: task.title })}>
        <TaskForm projectId={projectId} members={members} task={task} onDone={() => setEditOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("tasks.deleteConfirmTitle")}
        description={t("tasks.deleteTaskBody", {
          title: task.title,
          middle:
            totalSubtasks > 0
              ? t("tasks.deleteTaskWithSubtasks", { count: totalSubtasks, countS: totalSubtasks === 1 ? "" : "s" })
              : t("tasks.deleteTaskCommentsOnly"),
        })}
        confirmLabel={t("tasks.deleteTask")}
        onConfirm={async () => {
          const result = await deleteTask(task.id);
          if (result.error) return result;
          toast(t("tasks.deleted"));
          router.refresh();
        }}
      />
    </div>
  );
}
