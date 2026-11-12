// Kanban board actions (Part 2, §1).
//
// Moving a card changes the task's status in the database. The database
// (triggers + RLS, see docs/DECISIONS.md) is the backstop:
// - a parent cannot be completed while subtasks are open
//   (trg_tasks_block_completion raises "Complete all subtasks first…");
// - a developer may change the STATUS of their own assigned tasks only —
//   any position change by a developer is rejected by
//   trg_tasks_enforce_developer_task_update, so moveTask only touches
//   `position` for managers. The UI rolls the card back and shows the
//   server's message when a move is rejected.

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceRole } from "@/lib/actions/workspace";
import { canChangeTaskStatus, isManager } from "@/lib/permissions";
import type { Task, TaskStatus } from "@/types";

export interface ActionResult {
  error?: string;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Same loader pattern as lib/actions/tasks.ts (not exported there). */
async function loadBoardTask(taskId: string) {
  const supabase = await createClient();
  const { data: task, error } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (error || !task) throw new Error("Task not found.");
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", (task as Task).project_id)
    .maybeSingle();
  if (!project) throw new Error("Task not found.");
  const membership = await requireWorkspaceRole(project.workspace_id as string);
  return {
    supabase,
    task: task as Task,
    projectId: project.id as string,
    workspaceId: project.workspace_id as string,
    ...membership,
  };
}

function revalidateBoard(projectId: string) {
  revalidatePath("/dashboard/board");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/my-tasks");
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/projects");
}

/**
 * Move a top-level task to another status column.
 *
 * Manager: status + position (appended at the end of the target column).
 * Developer: status only, and only for a task assigned to them — position
 * is left untouched because the DB trigger rejects position changes by
 * developers. A parent with open subtasks cannot be moved to Completed;
 * the message names the open count, matching updateTask.
 */
export async function moveTask(taskId: string, nextStatus: TaskStatus): Promise<ActionResult> {
  try {
    const { supabase, task, role, userId, projectId } = await loadBoardTask(taskId);
    if (task.parent_task_id) return { error: "Subtasks are not shown on the board." };
    if (!canChangeTaskStatus(role, task.assigned_to, userId)) {
      return { error: "You can only move tasks assigned to you." };
    }
    if (nextStatus === task.status) return {};

    if (nextStatus === "completed" && task.status !== "completed") {
      const { data: subtasks } = await supabase.from("tasks").select("id, status").eq("parent_task_id", taskId);
      const all = (subtasks ?? []) as { status: string }[];
      const open = all.filter((s) => s.status !== "completed");
      if (open.length > 0) {
        return { error: `Complete all subtasks first (${all.length - open.length} of ${all.length} done).` };
      }
    }

    const updates: { status: TaskStatus; position?: number } = { status: nextStatus };
    if (isManager(role)) {
      const { data: last } = await supabase
        .from("tasks")
        .select("position")
        .eq("project_id", projectId)
        .eq("status", nextStatus)
        .is("parent_task_id", null)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      updates.position = (((last as { position: number } | null)?.position ?? 0) + 1);
    }

    const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
    if (error) {
      if (/subtask/i.test(error.message)) {
        return { error: "Complete all subtasks first before marking this task completed." };
      }
      return { error: `Could not move the task: ${error.message}` };
    }

    revalidateBoard(projectId);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not move the task.") };
  }
}

/**
 * Persist the order of the tasks in one column (manager only).
 * `orderedIds` is the full column order after the drop.
 *
 * Positions are scoped per project (see createTask in lib/actions/tasks.ts),
 * so the list is renumbered per project, in the order the ids appear.
 * With the board filtered to one project the persisted order is exactly
 * the order the user set; with "All projects" each project's relative
 * order is preserved.
 */
export async function reorderTasks(status: TaskStatus, orderedIds: string[]): Promise<ActionResult> {
  try {
    if (orderedIds.length === 0) return {};
    const supabase = await createClient();
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, project_id, status, parent_task_id")
      .in("id", orderedIds);
    const tasks = (rows ?? []) as { id: string; project_id: string; status: string; parent_task_id: string | null }[];
    if (tasks.length !== orderedIds.length) return { error: "Some tasks could not be found." };
    if (tasks.some((t) => t.parent_task_id !== null)) return { error: "Only top-level tasks can be reordered on the board." };
    if (tasks.some((t) => t.status !== status)) return { error: "All tasks must be in the same column." };

    const projectIds = [...new Set(tasks.map((t) => t.project_id))];
    const { data: projectRow } = await supabase
      .from("projects")
      .select("id, workspace_id")
      .in("id", projectIds)
      .limit(1)
      .maybeSingle();
    if (!projectRow) return { error: "Project not found." };
    const { role } = await requireWorkspaceRole(projectRow.workspace_id as string);
    if (!isManager(role)) return { error: "Only the workspace manager can reorder tasks." };

    // Renumber per project, preserving the given order within each project.
    const perProject = new Map<string, number>();
    for (const id of orderedIds) {
      const task = tasks.find((t) => t.id === id);
      if (!task) continue;
      const next = (perProject.get(task.project_id) ?? 0) + 1;
      perProject.set(task.project_id, next);
      const { error } = await supabase.from("tasks").update({ position: next }).eq("id", id);
      if (error) return { error: `Could not reorder tasks: ${error.message}` };
    }

    for (const projectId of projectIds) revalidateBoard(projectId);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not reorder tasks.") };
  }
}
