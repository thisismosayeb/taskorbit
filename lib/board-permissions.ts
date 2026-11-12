// Who can drag what on the Kanban board (Part 2, §1).
//
// Rules from docs/DECISIONS.md:
// - The manager can change any task's status — so they can drag any card.
// - A developer can change the status of a task assigned to them only.
//   Any other card shows a lock icon and cannot be dragged.
// - Reordering *within* a column changes tasks.position. The database
//   trigger `enforce_developer_task_update` rejects any position change
//   by a non-manager ("Developers can only change the status of their
//   assigned tasks."), so only the manager can reorder — a developer
//   dragging their own card to another column changes status only.

import { canChangeTaskStatus } from "@/lib/permissions";
import type { WorkspaceRole } from "@/types";
import { t } from "@/lib/i18n/dictionary";

/** Can this user drag this card at all (i.e. change its status by moving it)? */
export function canDragTask(
  role: WorkspaceRole | null | undefined,
  taskAssignedTo: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  // A missing role means "not a member of this workspace": never draggable,
  // even if the assignee happens to match (canChangeTaskStatus alone would
  // fall through to the assignee check for a null role).
  if (role !== "manager" && role !== "developer") return false;
  return canChangeTaskStatus(role, taskAssignedTo, userId);
}

/** Can this user reorder cards inside a column (persist positions)? Manager only. */
export function canReorderTasks(role: WorkspaceRole | null | undefined): boolean {
  return role === "manager";
}

export function dragDisabledReason(
  role: WorkspaceRole | null | undefined,
  taskAssignedTo: string | null | undefined,
  userId: string | null | undefined,
): string | null {
  if (canDragTask(role, taskAssignedTo, userId)) return null;
  if (!userId) return t("board.loginToMove");
  return t("board.onlyAssignee");
}
