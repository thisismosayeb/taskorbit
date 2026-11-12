// Application row types, derived from types/database.ts (which mirrors
// supabase/migrations/0001_init.sql + 0002_rpc.sql). If a table, column or
// enum changes in the migrations, regenerate types/database.ts and this file
// follows automatically — never hand-edit a Row shape here to match a query.

import type { Database } from "./database";

export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];
export type ProjectStatus = Database["public"]["Enums"]["project_status"];
export type Priority = Database["public"]["Enums"]["priority"];
export type TaskStatus = Database["public"]["Enums"]["task_status"];

export type DeadlineState = "green" | "red" | "amber" | "neutral" | "none";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type WorkspaceInvitation =
  Database["public"]["Tables"]["workspace_invitations"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Comment = Database["public"]["Tables"]["comments"]["Row"];
export type ActivityLog = Database["public"]["Tables"]["activity_logs"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
// Part 3 (migration 0007): AI cache / usage ledger / cron idempotency.
export type AiSummary = Database["public"]["Tables"]["ai_summaries"]["Row"];
export type AiUsage = Database["public"]["Tables"]["ai_usage"]["Row"];
export type DailyJobRun = Database["public"]["Tables"]["daily_job_runs"]["Row"];

export type WorkspaceMember = Database["public"]["Tables"]["workspace_members"]["Row"] & {
  // Joined profile, when the query selects it (workspace_members has no FK
  // to profiles in the database; this is a client-side join only).
  profile?: Profile | null;
};

export type CommentWithAuthor = Comment & {
  author?: Profile | null;
};

export type ActivityLogWithActor = ActivityLog & {
  actor?: Profile | null;
};

export type NotificationType =
  | "task_assigned"
  | "task_reassigned"
  | "task_completed"
  | "task_reopened"
  | "comment_added"
  | "invite_accepted"
  | "project_status_changed"
  | "member_joined";

/** A task plus its loaded subtasks and derived progress counts. */
export interface TaskWithSubtasks extends Task {
  subtasks: Task[];
  completedSubtasks: number;
  totalSubtasks: number;
}

/** A project plus its loaded top-level tasks and derived progress. */
export interface ProjectWithProgress extends Project {
  tasks: Task[];
  progressPercent: number;
  completedTasks: number;
  totalTasks: number;
}
