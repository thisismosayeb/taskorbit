import type { WorkspaceMember, WorkspaceRole } from "@/types";

export function isManager(role: WorkspaceRole | null | undefined): boolean {
  return role === "manager";
}

/** Manager only: create, edit and delete projects. (Spec §2) */
export function canManageProjects(role: WorkspaceRole | null | undefined): boolean {
  return isManager(role);
}

/** Manager only: create, edit and delete tasks and assign/reassign them. */
export function canManageTasks(role: WorkspaceRole | null | undefined): boolean {
  return isManager(role);
}

/** Manager only: invite and revoke developers. */
export function canInvite(role: WorkspaceRole | null | undefined): boolean {
  return isManager(role);
}

/**
 * Delete a comment: the manager can delete any comment in the workspace;
 * anyone else can delete only their own.
 */
export function canDeleteComment(
  role: WorkspaceRole | null | undefined,
  commentAuthorId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (isManager(role)) return true;
  return commentAuthorId === userId;
}

/**
 * Change a task's status only: the manager can change any task's status;
 * a developer can change the status of a task assigned to them, and
 * nothing else about it.
 */
export function canChangeTaskStatus(
  role: WorkspaceRole | null | undefined,
  taskAssignedTo: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  if (isManager(role)) return true;
  // A null/unknown role means "not a member" — it can never change a
  // status, even if the assignee happens to match the user id.
  if (role !== "developer") return false;
  return taskAssignedTo === userId;
}

/**
 * Edit a task's title, description, deadline, priority or assignee:
 * manager only. A developer can never do this, even for their own
 * assigned task.
 */
export function canEditTaskDetails(
  role: WorkspaceRole | null | undefined,
  _taskAssignedTo: string | null | undefined,
  _userId: string | null | undefined,
): boolean {
  return isManager(role);
}

/**
 * Create, edit or delete a subtask: the manager can manage any subtask;
 * a developer only subtasks of a task assigned to them (subtasks are
 * automatically assigned to the parent's assignee, so `isOwnSubtask`
 * is false only when the subtask belongs to someone else).
 */
export function canManageSubtask(
  role: WorkspaceRole | null | undefined,
  parentAssignedTo: string | null | undefined,
  userId: string | null | undefined,
  isOwnSubtask: boolean = true,
): boolean {
  if (!userId) return false;
  if (isManager(role)) return true;
  // A null/unknown role means "not a member" — it can never manage a
  // subtask, even if the parent assignee happens to match the user id.
  // (Same fix as canChangeTaskStatus in Part 2.)
  if (role !== "developer") return false;
  return isOwnSubtask && parentAssignedTo === userId;
}

/**
 * Create a subtask under a parent task.
 * - Never under a subtask (one level of nesting only).
 * - A developer only under a task assigned to them; a task with no
 *   assignee can only get subtasks from the manager.
 * `userId` is required to check the developer case; without it a
 * developer is never allowed.
 */
export function canCreateSubtask(
  role: WorkspaceRole | null | undefined,
  parentTask: { assigned_to: string | null | undefined; parent_task_id: string | null | undefined },
  userId?: string | null,
): boolean {
  if (parentTask.parent_task_id != null) return false;
  if (isManager(role)) return true;
  if (role !== "developer" || !userId) return false;
  return parentTask.assigned_to === userId;
}

export function isWorkspaceMember(
  members: Pick<WorkspaceMember, "user_id">[],
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return members.some((m) => m.user_id === userId);
}

export function getUserRole(
  members: Pick<WorkspaceMember, "user_id" | "role">[],
  userId: string | null | undefined,
): WorkspaceRole | null {
  if (!userId) return null;
  return members.find((m) => m.user_id === userId)?.role ?? null;
}
