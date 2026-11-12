"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { taskSchema, subtaskSchema, type TaskInput, type SubtaskInput } from "@/lib/validators";
import {
  canManageTasks,
  canChangeTaskStatus,
  canEditTaskDetails,
  canCreateSubtask,
  canManageSubtask,
  isManager,
} from "@/lib/permissions";
import { requireWorkspaceRole } from "@/lib/actions/workspace";
import type { Task } from "@/types";

export interface ActionResult {
  error?: string;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function revalidateTask(taskId: string, projectId?: string | null) {
  revalidatePath(`/dashboard/tasks/${taskId}`);
  if (projectId) revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/my-tasks");
  revalidatePath("/dashboard/projects");
}

async function loadTask(taskId: string) {
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
  return { supabase, task: task as Task, projectId: project.id as string, workspaceId: project.workspace_id as string, ...membership };
}

async function assertAssigneeIsMember(workspaceId: string, assignedTo: string | null | undefined) {
  if (!assignedTo) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", assignedTo)
    .maybeSingle();
  if (!data) throw new Error("Assignee must be a member of this workspace.");
}

export async function createTask(projectId: string, values: TaskInput): Promise<ActionResult & { taskId?: string }> {
  try {
    const parsed = taskSchema.safeParse(values);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the task details and try again." };

    const supabase = await createClient();
    const { data: project } = await supabase
      .from("projects")
      .select("id, workspace_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) return { error: "Project not found." };

    const { userId, role } = await requireWorkspaceRole(project.workspace_id as string);
    if (!canManageTasks(role)) return { error: "Only the workspace manager can create tasks." };

    await assertAssigneeIsMember(project.workspace_id as string, parsed.data.assigned_to);

    const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", projectId).is("parent_task_id", null);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        parent_task_id: null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        assigned_to: parsed.data.assigned_to ?? null,
        created_by: userId,
        status: parsed.data.status,
        priority: parsed.data.priority,
        start_date: parsed.data.start_date ?? null,
        due_date: parsed.data.due_date ?? null,
        position: (count ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `Could not create the task: ${error?.message ?? "Unknown error"}` };

    // Assignment notification comes from the DB trigger
    // (trg_tasks_notify_assigned, supabase/migrations/0004_notifications.sql);
    // inserting one here as well notified the assignee twice.

    revalidateTask(data.id as string, projectId);
    return { taskId: data.id as string };
  } catch (err) {
    return { error: errorMessage(err, "Could not create the task.") };
  }
}

export async function createSubtask(
  parentTaskId: string,
  values: SubtaskInput,
): Promise<ActionResult & { taskId?: string }> {
  try {
    const parsed = subtaskSchema.safeParse(values);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the subtask details and try again." };

    const parent = await loadTask(parentTaskId);
    if (!canCreateSubtask(parent.role, parent.task, parent.userId)) {
      return { error: "You cannot create a subtask here. Developers can only add subtasks to tasks assigned to them." };
    }

    const supabase = await createClient();
    const { count } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("parent_task_id", parentTaskId);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: parent.task.project_id,
        parent_task_id: parentTaskId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        // Subtask assignee is always copied from the parent (DB trigger also enforces this).
        assigned_to: parent.task.assigned_to,
        created_by: parent.userId,
        status: parsed.data.status,
        priority: parsed.data.priority,
        start_date: parsed.data.start_date ?? null,
        due_date: parsed.data.due_date ?? null,
        position: (count ?? 0) + 1,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `Could not create the subtask: ${error?.message ?? "Unknown error"}` };

    revalidateTask(parentTaskId, parent.projectId);
    revalidateTask(data.id as string, parent.projectId);
    return { taskId: data.id as string };
  } catch (err) {
    return { error: errorMessage(err, "Could not create the subtask.") };
  }
}

export type TaskPatch = Partial<TaskInput>;

/**
 * Manager: full edit (title, description, deadline, priority, assignee,
 * status). Developer: status only, and only on a task assigned to them.
 * The database trigger also blocks completing a parent while subtasks
 * are open; we check first so the message names the open count.
 */
export async function updateTask(taskId: string, patch: TaskPatch): Promise<ActionResult> {
  try {
    const { supabase, task, role, userId, projectId, workspaceId } = await loadTask(taskId);
    const manager = isManager(role);

    if (!manager) {
      const keys = Object.keys(patch).filter((k) => patch[k as keyof TaskPatch] !== undefined);
      const statusOnly = keys.length === 1 && keys[0] === "status";
      if (!statusOnly) return { error: "Developers can only change the status of tasks assigned to them." };
      if (!canChangeTaskStatus(role, task.assigned_to, userId)) {
        return { error: "You can only change the status of tasks assigned to you." };
      }
    } else if (!canEditTaskDetails(role, task.assigned_to, userId)) {
      return { error: "Only the workspace manager can edit task details." };
    }

    // Merge with current values and validate the whole row.
    const merged: TaskInput = {
      title: patch.title ?? task.title,
      description: patch.description !== undefined ? patch.description : task.description,
      priority: patch.priority ?? task.priority,
      status: patch.status ?? task.status,
      start_date: patch.start_date !== undefined ? patch.start_date : task.start_date,
      due_date: patch.due_date !== undefined ? patch.due_date : task.due_date,
      assigned_to: patch.assigned_to !== undefined ? patch.assigned_to : task.assigned_to,
    };
    const parsed = taskSchema.safeParse(merged);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the task details and try again." };

    if (manager && parsed.data.assigned_to !== task.assigned_to) {
      await assertAssigneeIsMember(workspaceId, parsed.data.assigned_to);
    }

    if (parsed.data.status === "completed" && task.status !== "completed" && !task.parent_task_id) {
      const { data: subtasks } = await supabase
        .from("tasks")
        .select("id, status")
        .eq("parent_task_id", taskId);
      const open = (subtasks ?? []).filter((s) => (s as { status: string }).status !== "completed");
      if (open.length > 0) {
        const done = (subtasks ?? []).length - open.length;
        return { error: `Complete all subtasks first (${done} of ${(subtasks ?? []).length} done).` };
      }
    }

    const { error } = await supabase
      .from("tasks")
      .update({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        status: parsed.data.status,
        start_date: parsed.data.start_date ?? null,
        due_date: parsed.data.due_date ?? null,
        assigned_to: parsed.data.assigned_to ?? null,
      })
      .eq("id", taskId);
    if (error) {
      if (/subtask/i.test(error.message)) {
        return { error: "Complete all subtasks first before marking this task completed." };
      }
      return { error: `Could not update the task: ${error.message}` };
    }

    // Assignment notification comes from the DB trigger
    // (trg_tasks_notify_assigned, supabase/migrations/0004_notifications.sql);
    // inserting one here as well notified the assignee twice.

    revalidateTask(taskId, projectId);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not update the task.") };
  }
}

export async function updateSubtask(subtaskId: string, patch: TaskPatch): Promise<ActionResult> {
  try {
    const { supabase, task, role, userId, projectId } = await loadTask(subtaskId);
    if (!task.parent_task_id) return { error: "This is not a subtask." };

    const { data: parent } = await supabase
      .from("tasks")
      .select("assigned_to")
      .eq("id", task.parent_task_id)
      .maybeSingle();
    const parentAssignee = (parent as { assigned_to: string | null } | null)?.assigned_to ?? null;

    if (!canManageSubtask(role, parentAssignee, userId, task.assigned_to === userId)) {
      return { error: "You can only edit subtasks of tasks assigned to you." };
    }

    // Subtasks never change assignee directly; it follows the parent.
    // (Unlike top-level tasks, developers may edit a subtask's title,
    // description, due date and priority — so update inline instead of
    // delegating to updateTask, which is status-only for developers.)
    const { assigned_to: _ignored, ...rest } = patch;
    void _ignored;
    const merged: TaskInput = {
      title: rest.title ?? task.title,
      description: rest.description !== undefined ? rest.description : task.description,
      priority: rest.priority ?? task.priority,
      status: rest.status ?? task.status,
      start_date: rest.start_date !== undefined ? rest.start_date : task.start_date,
      due_date: rest.due_date !== undefined ? rest.due_date : task.due_date,
      assigned_to: task.assigned_to,
    };
    const parsed = subtaskSchema.safeParse(merged);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the subtask details and try again." };

    const { error } = await supabase
      .from("tasks")
      .update({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        status: parsed.data.status,
        start_date: parsed.data.start_date ?? null,
        due_date: parsed.data.due_date ?? null,
      })
      .eq("id", subtaskId);
    if (error) return { error: `Could not update the subtask: ${error.message}` };

    revalidateTask(subtaskId, projectId);
    revalidateTask(task.parent_task_id, projectId);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not update the subtask.") };
  }
}

export async function toggleSubtaskStatus(subtaskId: string): Promise<ActionResult> {
  try {
    const { task, role, userId } = await loadTask(subtaskId);
    if (!task.parent_task_id) return { error: "This is not a subtask." };

    const supabase = await createClient();
    const { data: parent } = await supabase
      .from("tasks")
      .select("assigned_to")
      .eq("id", task.parent_task_id)
      .maybeSingle();
    const parentAssignee = (parent as { assigned_to: string | null } | null)?.assigned_to ?? null;

    if (!canManageSubtask(role, parentAssignee, userId, task.assigned_to === userId)) {
      return { error: "You can only change subtasks of tasks assigned to you." };
    }

    const nextStatus = task.status === "completed" ? "in_progress" : "completed";
    return await updateTask(subtaskId, { status: nextStatus });
  } catch (err) {
    return { error: errorMessage(err, "Could not update the subtask.") };
  }
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  try {
    const { supabase, task, role, userId, projectId } = await loadTask(taskId);

    if (task.parent_task_id) {
      const { data: parent } = await supabase
        .from("tasks")
        .select("assigned_to")
        .eq("id", task.parent_task_id)
        .maybeSingle();
      const parentAssignee = (parent as { assigned_to: string | null } | null)?.assigned_to ?? null;
      if (!canManageSubtask(role, parentAssignee, userId, task.assigned_to === userId)) {
        return { error: "You can only delete subtasks of tasks assigned to you." };
      }
    } else if (!canManageTasks(role)) {
      return { error: "Only the workspace manager can delete tasks." };
    }

    const { error } = await supabase.from("tasks").delete().eq("id", taskId);
    if (error) return { error: `Could not delete the task: ${error.message}` };

    revalidateTask(taskId, projectId);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not delete the task.") };
  }
}

export async function deleteSubtask(subtaskId: string): Promise<ActionResult> {
  const { task } = await loadTask(subtaskId).catch(() => ({ task: null as Task | null }));
  if (!task) return { error: "Subtask not found." };
  if (!task.parent_task_id) return { error: "This is not a subtask." };
  return deleteTask(subtaskId);
}
