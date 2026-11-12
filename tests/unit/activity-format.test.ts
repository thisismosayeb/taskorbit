import { describe, expect, it } from "vitest";
import { describeActivity } from "@/lib/activity/format";
import type { ActivityLog } from "@/types";

function log(action: string, metadata: Record<string, unknown>, taskId: string | null = "task-1", projectId: string | null = "proj-1"): ActivityLog {
  return {
    id: "log-1",
    workspace_id: "ws-1",
    project_id: projectId,
    task_id: taskId,
    actor_id: "user-1",
    action,
    metadata: metadata as ActivityLog["metadata"],
    created_at: "2026-11-12T12:00:00Z",
  };
}

describe("describeActivity", () => {
  it("describes a task completion in plain words", () => {
    expect(describeActivity(log("task.completed", { title: "Design homepage" }))).toEqual({
      actionText: "completed task",
      objectLabel: "Design homepage",
      objectHref: "/dashboard/tasks/task-1",
    });
  });

  it("describes a status change with from/to labels", () => {
    expect(
      describeActivity(log("task.status_changed", { title: "Design homepage", from_status: "todo", to_status: "in_progress" })),
    ).toEqual({
      actionText: "moved task from To do to In progress",
      objectLabel: "Design homepage",
      objectHref: "/dashboard/tasks/task-1",
    });
  });

  it("describes a comment using the looked-up task title", () => {
    // comment.added metadata only stores the comment id.
    expect(
      describeActivity(log("comment.added", { comment_id: "c-1" }), { taskTitle: "Design homepage" }),
    ).toEqual({
      actionText: "commented on task",
      objectLabel: "Design homepage",
      objectHref: "/dashboard/tasks/task-1",
    });
  });

  it("describes a project status update", () => {
    expect(describeActivity(log("project.updated", { name: "Website Redesign", status: "active" }))).toEqual({
      actionText: "updated project (now active)",
      objectLabel: "Website Redesign",
      objectHref: "/dashboard/projects/proj-1",
    });
  });

  it("gives a deleted object no link", () => {
    const result = describeActivity(log("task.deleted", { title: "Old task" }));
    expect(result.actionText).toBe("deleted task");
    expect(result.objectHref).toBeNull();
  });

  it("describes an invitation being created and revoked", () => {
    expect(
      describeActivity(log("invite.created", { invited_email: "dev@example.com", invitation_id: "inv-1" }, null, null)),
    ).toEqual({
      actionText: "invited developer",
      objectLabel: "dev@example.com",
      objectHref: null,
    });
    expect(
      describeActivity(log("invite.revoked", { invited_email: "dev@example.com", invitation_id: "inv-1" }, null, null)),
    ).toEqual({
      actionText: "revoked the invitation for",
      objectLabel: "dev@example.com",
      objectHref: null,
    });
  });

  it("describes a member joining", () => {
    expect(describeActivity(log("member.joined", { user_id: "u-2", role: "developer" }, null, null))).toEqual({
      actionText: "joined the workspace",
      objectLabel: null,
      objectHref: null,
    });
  });
});
