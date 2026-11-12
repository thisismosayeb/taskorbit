// TaskOrbit AI — server actions (Part 3, spec section 8).
//
// Role enforcement happens here on the server, not just in the UI:
// daily_brief and project_summary are manager-only — a developer calling
// generateAiFeature() directly gets { error } and no data (see
// canGenerateFeature in lib/ai/features.ts). Every other feature is
// scoped to data the caller is allowed to see.
//
// Data sent to the model is minimised (titles, statuses, dates, assignee
// first names, short recent comments). Never emails, passwords, tokens,
// keys or auth data. AI only reads and suggests — nothing here writes
// tasks, statuses or assignments.

"use server";

import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { isManager } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/config";
import { canGenerateFeature, type AiFeature } from "@/lib/ai/features";
import { generateFeature, type GenerateResult } from "@/lib/ai/generate";
import { readCachedSummary } from "@/lib/ai/cache";
import { localDateInTimezone } from "@/lib/ai/cron-select";
import type { AiInputData } from "@/lib/ai/prompts";
import { validateAiOutput, type AiOutput } from "@/lib/ai/schemas";

export type AiGenerateResult<F extends AiFeature = AiFeature> = GenerateResult<F>;

interface InputTaskRow {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
}

function firstName(fullName: string | null | undefined, fallback: string): string {
  const cleaned = (fullName ?? "").trim();
  if (!cleaned) return fallback;
  return cleaned.split(/\s+/)[0] ?? fallback;
}

function userLocale(preferredLocale: string | null | undefined): "en" | "bn" {
  return preferredLocale === "bn" ? "bn" : "en";
}

/**
 * Load the minimised AI input for the active workspace. `projectId`
 * scopes a project summary; `ownUserId` scopes my_focus / standup to
 * the caller's own tasks (developers see the whole workspace, but the
 * model only needs their own work for these two features).
 */
async function loadAiInput(
  workspaceId: string,
  timezone: string,
  locale: "en" | "bn",
  opts: { projectId?: string | null; ownUserId?: string | null } = {},
): Promise<AiInputData> {
  const supabase = await createClient();
  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name, status")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  const projects = ((projectRows ?? []) as { id: string; name: string; status: string }[]).filter(
    (p) => !opts.projectId || p.id === opts.projectId,
  );

  const projectIds = projects.map((p) => p.id);
  let taskRows: InputTaskRow[] = [];
  if (projectIds.length > 0) {
    const { data } = await supabase
      .from("tasks")
      .select("id, project_id, parent_task_id, title, status, priority, due_date, completed_at, assigned_to")
      .in("project_id", projectIds)
      .order("due_date", { ascending: true });
    taskRows = (data ?? []) as InputTaskRow[];
  }
  if (opts.ownUserId) {
    taskRows = taskRows.filter((t) => t.assigned_to === opts.ownUserId);
  }

  // Assignee first names only — never emails.
  const assigneeIds = [...new Set(taskRows.map((t) => t.assigned_to).filter((id): id is string => Boolean(id)))];
  const { data: profileRows } =
    assigneeIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", assigneeIds)
      : { data: [] as { id: string; full_name: string | null }[] };
  const names = new Map(
    ((profileRows ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  );

  // Recent comments on the scoped tasks (short, wrapped as data at prompt time).
  const taskIds = taskRows.map((t) => t.id);
  let comments: AiInputData["comments"] = [];
  if (taskIds.length > 0) {
    const { data: commentRows } = await supabase
      .from("comments")
      .select("content, created_at, author_id, task_id")
      .in("task_id", taskIds)
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (commentRows ?? []) as { content: string; created_at: string; author_id: string; task_id: string }[];
    const authorIds = [...new Set(rows.map((c) => c.author_id))];
    const { data: authorRows } =
      authorIds.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", authorIds)
        : { data: [] as { id: string; full_name: string | null }[] };
    const authorNames = new Map(
      ((authorRows ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
    );
    const taskById = new Map(taskRows.map((t) => [t.id, t.title]));
    comments = rows.map((c) => ({
      text: c.content.slice(0, 200),
      authorFirstName: firstName(authorNames.get(c.author_id), "Someone"),
      taskTitle: taskById.get(c.task_id) ?? "a task",
      createdAt: c.created_at,
    }));
  }

  // Recent activity as short plain lines (action + title from metadata).
  const { data: activityRows } = await supabase
    .from("activity_logs")
    .select("action, created_at, metadata, actor_id")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);
  const recentActivity = (
    (activityRows ?? []) as { action: string; created_at: string; metadata: unknown; actor_id: string | null }[]
  )
    .filter((a) => !opts.ownUserId || a.actor_id === opts.ownUserId)
    .map((a) => {
      const meta = (a.metadata ?? {}) as { title?: string; name?: string };
      const subject = meta.title ?? meta.name ?? "";
      return subject ? `${a.action}: ${subject}` : a.action;
    });

  return {
    workspaceName: "",
    timezone,
    localDate: localDateInTimezone(new Date(), timezone),
    locale,
    projects: projects.map((p) => ({ id: p.id, name: p.name, status: p.status })),
    tasks: taskRows.map((t) => ({
      id: t.id,
      projectId: t.project_id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.due_date,
      completedAt: t.completed_at,
      assigneeFirstName: t.assigned_to ? firstName(names.get(t.assigned_to), "Someone") : null,
      isSubtask: t.parent_task_id !== null,
    })),
    comments,
    recentActivity,
  };
}

/** Generate (or reuse the cached) output for one AI feature. */
export async function generateAiFeature<F extends AiFeature>(
  feature: F,
  opts: { projectId?: string | null } = {},
): Promise<AiGenerateResult<F>> {
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) {
    return { ok: false, error: "You must be logged in to use TaskOrbit AI." };
  }
  if (!canGenerateFeature(ctx.role, feature)) {
    return { ok: false, error: "Only the workspace manager can use this AI feature." };
  }
  if (!isAiConfigured()) {
    return { ok: false, error: "TaskOrbit AI is not configured yet.", notConfigured: true };
  }

  const projectId = opts.projectId?.trim() || null;
  if (feature === "project_summary" && !projectId) {
    return { ok: false, error: "Choose a project to summarise." };
  }

  const timezone = ctx.workspace.timezone || "Asia/Dhaka";
  const locale = userLocale(ctx.profile?.preferred_locale);
  const ownUserId = feature === "my_focus" || feature === "standup" ? ctx.user.id : null;
  const data = await loadAiInput(ctx.workspace.id, timezone, locale, { projectId, ownUserId });
  data.workspaceName = ctx.workspace.name;

  // A project summary for an unknown project id is rejected, not guessed.
  if (feature === "project_summary" && projectId && !data.projects.some((p) => p.id === projectId)) {
    return { ok: false, error: "That project is not in this workspace." };
  }

  const supabase = await createClient();
  return generateFeature<F>({
    supabase,
    feature,
    workspaceId: ctx.workspace.id,
    projectId,
    userId: ctx.user.id,
    locale,
    localDate: data.localDate,
    data,
  });
}

/** Read the cached output for one feature (no generation, no model call). */
export async function getCachedAiFeature<F extends AiFeature>(
  feature: F,
  opts: { projectId?: string | null } = {},
): Promise<
  | { ok: true; content: AiOutput[F]; generatedAt: string; model: string }
  | { ok: false; error: string; notConfigured?: boolean }
> {
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) {
    return { ok: false, error: "You must be logged in to use TaskOrbit AI." };
  }
  if (!canGenerateFeature(ctx.role, feature)) {
    return { ok: false, error: "Only the workspace manager can use this AI feature." };
  }
  if (!isAiConfigured()) {
    return { ok: false, error: "TaskOrbit AI is not configured yet.", notConfigured: true };
  }
  const timezone = ctx.workspace.timezone || "Asia/Dhaka";
  const locale = userLocale(ctx.profile?.preferred_locale);
  const projectId = opts.projectId?.trim() || null;
  const supabase = await createClient();
  const cached = await readCachedSummary(supabase, {
    workspaceId: ctx.workspace.id,
    projectId: feature === "project_summary" ? projectId : null,
    userId: feature === "my_focus" || feature === "standup" ? ctx.user.id : null,
    feature,
    locale,
    summaryDate: localDateInTimezone(new Date(), timezone),
  });
  if (!cached) return { ok: false, error: "No saved result yet. Generate one first." };
  const content = validateAiOutput(feature, cached.content);
  if (!content) return { ok: false, error: "The saved result could not be read. Generate a fresh one." };
  return { ok: true, content: content as AiOutput[F], generatedAt: cached.generatedAt, model: cached.model };
}

/** Projects for the project-summary picker (id + name only). */
export async function getAiProjectOptions(): Promise<{ id: string; name: string }[]> {
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return [];
  if (!isManager(ctx.role)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as { id: string; name: string }[]).map((p) => ({ id: p.id, name: p.name }));
}

/** The manager dashboard's "AI Daily Brief" card reads this (cached only). */
export async function getCachedDailyBrief(): Promise<
  | { ok: true; content: AiOutput["daily_brief"]; generatedAt: string }
  | { ok: false; error: string; notConfigured?: boolean }
> {
  return getCachedAiFeature("daily_brief");
}
