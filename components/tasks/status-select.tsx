"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { updateTask } from "@/lib/actions/tasks";
import type { Task, TaskStatus } from "@/types";
import { t, useLocale} from "@/lib/i18n";

export const statusLabels: Record<TaskStatus, string> = {
  todo: t("tasks.statusTodo"),
  in_progress: t("tasks.statusInProgress"),
  in_review: t("tasks.statusInReview"),
  completed: t("tasks.statusCompleted"),
};

const statusVariants: Record<TaskStatus, "neutral" | "cyan" | "amber" | "green"> = {
  todo: "neutral",
  in_progress: "cyan",
  in_review: "amber",
  completed: "green",
};

export function StatusSelect({
  task,
  canChange,
  subtaskDone = 0,
  subtaskTotal = 0,
  isDeveloper = false,
}: {
  task: Task;
  canChange: boolean;
  /** Completed / total subtasks, passed by the task page (0/0 for subtasks). */
  subtaskDone?: number;
  subtaskTotal?: number;
  /** True when the person changing the status is a developer — only then
      does completing a task celebrate ("Orbit cleared!"). */
  isDeveloper?: boolean;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  // Persistent inline block message. A toast alone disappears after a few
  // seconds (Part 1 E2E (6)); this stays beside the control until the
  // situation changes — i.e. until every subtask is done, or a status
  // change succeeds.
  const [blockedMessage, setBlockedMessage] = React.useState<string | null>(null);

  // Keep the counts in the message live: completing a subtask refreshes the
  // page with fresh counts, and the message clears itself once all are done.
  React.useEffect(() => {
    if (!blockedMessage || subtaskTotal === 0) return;
    if (subtaskDone >= subtaskTotal) {
      setBlockedMessage(null);
    } else {
      setBlockedMessage(t("tasks.completeBlocked", { done: subtaskDone, total: subtaskTotal }));
    }
  }, [blockedMessage, subtaskDone, subtaskTotal]);

  if (!canChange) {
    return <Badge variant={statusVariants[task.status]}>{statusLabels[task.status]}</Badge>;
  }

  async function handleChange(value: string) {
    const next = value as TaskStatus;
    if (next === task.status) return;
    setPending(true);
    try {
      const result = await updateTask(task.id, { status: next });
      if (result.error) {
        toast(result.error, "error");
        if (/subtask/i.test(result.error)) {
          setBlockedMessage(
            subtaskTotal > 0
              ? t("tasks.completeBlocked", { done: subtaskDone, total: subtaskTotal })
              : result.error,
          );
        }
        return;
      }
      setBlockedMessage(null);
      // Short celebration when a developer completes a task — never for
      // overdue items (due date already past).
      const today = new Date().toISOString().slice(0, 10);
      const isOverdue = !!task.due_date && task.due_date < today;
      if (next === "completed" && isDeveloper && !isOverdue) {
        toast(`${t("motion.orbitCleared")} ${t("motion.celebrationBody")}`);
      } else {
        toast(
          next === "completed"
            ? t("tasks.markedCompleted")
            : t("tasks.statusChangedTo", { status: statusLabels[next] }),
        );
      }
      router.refresh();
    } catch {
      toast(t("errors.generic"), "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Select
        aria-label={t("tasks.changeStatusAria")}
        value={task.status}
        disabled={pending}
        onChange={(e) => void handleChange(e.target.value)}
        className="h-8 w-auto pr-8 text-xs font-medium"
      >
        {(Object.keys(statusLabels) as TaskStatus[]).map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]}
          </option>
        ))}
      </Select>
      {blockedMessage ? (
        <span role="alert" className="max-w-56 text-xs font-medium leading-snug text-amber-700">
          {blockedMessage}
        </span>
      ) : null}
    </span>
  );
}
