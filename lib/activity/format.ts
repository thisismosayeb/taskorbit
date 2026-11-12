// Plain-words rendering of activity_logs rows, e.g.
//   "Rahim completed task Design homepage"
// The actor name is rendered by the caller; this module turns the stored
// action + metadata into the verb phrase, the object label and its link.
// Metadata shapes come from the triggers in 0001_init.sql and the RPCs in
// 0002_rpc.sql (task.created {title}, task.status_changed
// {title, from_status, to_status}, task.assigned/reassigned {title, assignee},
// project.created/updated/deleted {name, status}, comment.added
// {comment_id}, member.joined {user_id, role}, workspace.created {name},
// invitation.accepted {invitation_id}, invite.created / invite.revoked
// {invited_email, invitation_id} (written by lib/actions/team.ts).

import type { ActivityLog } from "@/types";
import { t, type SupportedLocale } from "@/lib/i18n/dictionary";

// The two constants below are evaluated at import (English) and kept for
// back-compat. Renderers that know the request locale use the getters
// instead — they return the same shapes translated.

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: t("tasks.statusTodo"),
  in_progress: t("tasks.statusInProgress"),
  in_review: t("tasks.statusInReview"),
  completed: t("tasks.statusCompleted"),
};

export const ACTIVITY_ACTION_TYPES: { value: string; label: string }[] = [
  { value: "project.created", label: t("activity.typeProjectCreated") },
  { value: "project.updated", label: t("activity.typeProjectUpdated") },
  { value: "project.deleted", label: t("activity.typeProjectDeleted") },
  { value: "task.created", label: t("activity.typeTaskCreated") },
  { value: "task.assigned", label: t("activity.typeTaskAssigned") },
  { value: "task.reassigned", label: t("activity.typeTaskReassigned") },
  { value: "task.status_changed", label: t("activity.typeTaskStatusChanged") },
  { value: "task.completed", label: t("activity.typeTaskCompleted") },
  { value: "task.reopened", label: t("activity.typeTaskReopened") },
  { value: "task.deleted", label: t("activity.typeTaskDeleted") },
  { value: "comment.added", label: t("activity.typeCommentAdded") },
  { value: "member.joined", label: t("activity.typeMemberJoined") },
  { value: "workspace.created", label: t("activity.typeWorkspaceCreated") },
  { value: "invitation.accepted", label: t("activity.typeInvitationAccepted") },
  { value: "invite.created", label: t("activity.typeInviteCreated") },
  { value: "invite.revoked", label: t("activity.typeInviteRevoked") },
];

/** Locale-aware task-status labels (same shape as TASK_STATUS_LABELS). */
export function getTaskStatusLabels(locale?: SupportedLocale): Record<string, string> {
  return {
    todo: t("tasks.statusTodo", undefined, locale),
    in_progress: t("tasks.statusInProgress", undefined, locale),
    in_review: t("tasks.statusInReview", undefined, locale),
    completed: t("tasks.statusCompleted", undefined, locale),
  };
}

/** Locale-aware activity-filter options (same shape as ACTIVITY_ACTION_TYPES). */
export function getActivityActionTypes(locale?: SupportedLocale): { value: string; label: string }[] {
  return [
    { value: "project.created", label: t("activity.typeProjectCreated", undefined, locale) },
    { value: "project.updated", label: t("activity.typeProjectUpdated", undefined, locale) },
    { value: "project.deleted", label: t("activity.typeProjectDeleted", undefined, locale) },
    { value: "task.created", label: t("activity.typeTaskCreated", undefined, locale) },
    { value: "task.assigned", label: t("activity.typeTaskAssigned", undefined, locale) },
    { value: "task.reassigned", label: t("activity.typeTaskReassigned", undefined, locale) },
    { value: "task.status_changed", label: t("activity.typeTaskStatusChanged", undefined, locale) },
    { value: "task.completed", label: t("activity.typeTaskCompleted", undefined, locale) },
    { value: "task.reopened", label: t("activity.typeTaskReopened", undefined, locale) },
    { value: "task.deleted", label: t("activity.typeTaskDeleted", undefined, locale) },
    { value: "comment.added", label: t("activity.typeCommentAdded", undefined, locale) },
    { value: "member.joined", label: t("activity.typeMemberJoined", undefined, locale) },
    { value: "workspace.created", label: t("activity.typeWorkspaceCreated", undefined, locale) },
    { value: "invitation.accepted", label: t("activity.typeInvitationAccepted", undefined, locale) },
    { value: "invite.created", label: t("activity.typeInviteCreated", undefined, locale) },
    { value: "invite.revoked", label: t("activity.typeInviteRevoked", undefined, locale) },
  ];
}

export interface ActivityDescription {
  /** Verb phrase, e.g. "completed task" / "commented on task". */
  actionText: string;
  /** Object label, e.g. the task title (null when there is no object). */
  objectLabel: string | null;
  /** Link for the object, or null when it has none / no longer exists. */
  objectHref: string | null;
}

function meta(log: ActivityLog): Record<string, unknown> {
  const m = log.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Describes one activity row. `taskTitle` / `projectName` are looked up by
 * the list loader (metadata does not always carry them — comment.added only
 * stores the comment id, member.joined only the user id).
 */
export function describeActivity(
  log: ActivityLog,
  context: { taskTitle?: string | null; projectName?: string | null } = {},
  locale?: SupportedLocale,
): ActivityDescription {
  const statusLabels = getTaskStatusLabels(locale);
  const m = meta(log);
  const taskTitle = str(m.title) ?? context.taskTitle ?? null;
  const projectName = str(m.name) ?? context.projectName ?? null;
  const taskHref = log.task_id ? `/dashboard/tasks/${log.task_id}` : null;
  const projectHref = log.project_id ? `/dashboard/projects/${log.project_id}` : null;

  switch (log.action) {
    case "project.created":
      return { actionText: t("activity.verbCreatedProject", undefined, locale), objectLabel: projectName, objectHref: projectHref };
    case "project.updated": {
      const status = str(m.status);
      return {
        actionText: status ? t("activity.verbUpdatedProjectStatus", { status: statusLabels[status] ?? status }, locale) : t("activity.verbUpdatedProject", undefined, locale),
        objectLabel: projectName,
        objectHref: projectHref,
      };
    }
    case "project.deleted":
      return { actionText: t("activity.verbDeletedProject", undefined, locale), objectLabel: projectName, objectHref: null };
    case "task.created":
      // Subtasks are also logged as task.created (the trigger fires on the
      // tasks row); the title is the subtask's own title either way.
      return { actionText: t("activity.verbCreatedTask", undefined, locale), objectLabel: taskTitle, objectHref: taskHref };
    case "task.assigned":
      return { actionText: t("activity.verbAssignedTask", undefined, locale), objectLabel: taskTitle, objectHref: taskHref };
    case "task.reassigned":
      return { actionText: t("activity.verbReassignedTask", undefined, locale), objectLabel: taskTitle, objectHref: taskHref };
    case "task.status_changed": {
      const from = statusLabels[String(m.from_status ?? "")] ?? String(m.from_status ?? "");
      const to = statusLabels[String(m.to_status ?? "")] ?? String(m.to_status ?? "");
      return {
        actionText: from && to ? t("activity.verbMovedTask", { from, to }, locale) : t("activity.verbChangedStatus", undefined, locale),
        objectLabel: taskTitle,
        objectHref: taskHref,
      };
    }
    case "task.completed":
      return { actionText: t("activity.verbCompletedTask", undefined, locale), objectLabel: taskTitle, objectHref: taskHref };
    case "task.reopened":
      return { actionText: t("activity.verbReopenedTask", undefined, locale), objectLabel: taskTitle, objectHref: taskHref };
    case "task.deleted":
      return { actionText: t("activity.verbDeletedTask", undefined, locale), objectLabel: taskTitle, objectHref: null };
    case "comment.added":
      return { actionText: t("activity.verbCommented", undefined, locale), objectLabel: taskTitle, objectHref: taskHref };
    case "member.joined": {
      const role = str(m.role);
      return {
        actionText: role === "manager" ? t("activity.verbJoinedManager", undefined, locale) : t("activity.verbJoined", undefined, locale),
        objectLabel: null,
        objectHref: null,
      };
    }
    case "workspace.created":
      return { actionText: t("activity.verbCreatedWorkspace", undefined, locale), objectLabel: projectName, objectHref: null };
    case "invitation.accepted":
      return { actionText: t("activity.verbAcceptedInvite", undefined, locale), objectLabel: null, objectHref: null };
    case "invite.created": {
      const invitedEmail = str(m.invited_email);
      return { actionText: t("activity.verbInvitedDeveloper", undefined, locale), objectLabel: invitedEmail, objectHref: null };
    }
    case "invite.revoked": {
      const invitedEmail = str(m.invited_email);
      return { actionText: t("activity.verbRevokedInvite", undefined, locale), objectLabel: invitedEmail, objectHref: null };
    }
    default:
      return { actionText: log.action, objectLabel: taskTitle ?? projectName, objectHref: taskHref ?? projectHref };
  }
}
