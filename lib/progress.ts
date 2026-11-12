import type { Task, TaskStatus } from "@/types";
import { t } from "@/lib/i18n/dictionary";

export interface ProgressResult {
  /** Exact percent, rounded to 2 decimals (e.g. 66.67). */
  percent: number;
  completed: number;
  total: number;
  /** Display text: rounded percent ("67%") or a "No … yet" note. */
  label: string;
}

/** Round a percent for display: 66.67 -> "67%". */
export function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

function buildResult(
  completed: number,
  total: number,
  emptyLabel: string,
): ProgressResult {
  if (total === 0) {
    return { percent: 0, completed: 0, total: 0, label: emptyLabel };
  }
  const percent = Math.round((completed / total) * 10000) / 100;
  return { percent, completed, total, label: formatPercent(percent) };
}

type ProgressItem = { status: TaskStatus; parent_task_id?: string | null };

/** Keep only top-level tasks (subtasks excluded to avoid double counting). */
export function topLevel<T extends ProgressItem>(tasks: T[]): T[] {
  return tasks.filter((t) => t.parent_task_id == null);
}

/**
 * Project progress = completed top-level tasks / all top-level tasks.
 * Any subtasks in the input are ignored (see `topLevel`).
 */
export function projectProgress(tasks: ProgressItem[]): ProgressResult {
  const top = topLevel(tasks);
  const completed = top.filter((t) => t.status === "completed").length;
  return buildResult(completed, top.length, t("progress.noTasks"));
}

/** Task progress = completed subtasks / all subtasks of that task. */
export function taskProgress(subtasks: ProgressItem[]): ProgressResult {
  const completed = subtasks.filter((t) => t.status === "completed").length;
  return buildResult(completed, subtasks.length, t("progress.noSubtasks"));
}

// Convenience wrappers for loaded rows.
export function projectProgressFromTasks(tasks: Task[]): ProgressResult {
  return projectProgress(tasks);
}

export function subtaskProgress(subtasks: Task[]): ProgressResult {
  return taskProgress(subtasks);
}
