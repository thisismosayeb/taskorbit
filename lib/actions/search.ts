// Global search (Part 2, §3).
//
// Searches the ACTIVE workspace only: projects (name), tasks and subtasks
// (title), and workspace members (full name). Uses `ilike` through the
// signed-in user's Supabase client, so RLS still applies — a user can
// only ever find rows their workspace membership lets them see.
// At most 20 results total, grouped by type (8 projects + 8 tasks +
// 4 members).

"use server";

import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import type { Profile, Project, Task } from "@/types";

export interface SearchProjectResult {
  id: string;
  name: string;
}

export interface SearchTaskResult {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  isSubtask: boolean;
  status: string;
}

export interface SearchMemberResult {
  id: string;
  name: string | null;
}

export interface SearchResults {
  projects: SearchProjectResult[];
  tasks: SearchTaskResult[];
  members: SearchMemberResult[];
}

export interface SearchResponse {
  results: SearchResults;
  error?: string;
}

const MAX_PROJECTS = 8;
const MAX_TASKS = 8;
const MAX_MEMBERS = 4;
const MIN_QUERY_LENGTH = 2;

const EMPTY: SearchResults = { projects: [], tasks: [], members: [] };

/** Escape LIKE wildcards so a query matches literally. */
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function searchWorkspace(query: string): Promise<SearchResponse> {
  const q = (query ?? "").trim();
  if (q.length < MIN_QUERY_LENGTH) return { results: EMPTY };

  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace) return { results: EMPTY, error: "You must be logged in." };

  const supabase = await createClient();
  const pattern = `%${escapeIlike(q)}%`;

  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", ctx.workspace.id)
    .order("name");
  const projects = (projectRows ?? []) as Pick<Project, "id" | "name">[];
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const matchedProjects = projects
    .filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, MAX_PROJECTS)
    .map((p) => ({ id: p.id, name: p.name }));

  let tasks: SearchTaskResult[] = [];
  const projectIds = projects.map((p) => p.id);
  if (projectIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, title, project_id, parent_task_id, status")
      .in("project_id", projectIds)
      .ilike("title", pattern)
      .order("updated_at", { ascending: false })
      .limit(MAX_TASKS);
    tasks = ((taskRows ?? []) as Pick<Task, "id" | "title" | "project_id" | "parent_task_id" | "status">[]).map((t) => ({
      id: t.id,
      title: t.title,
      projectId: t.project_id,
      projectName: projectName.get(t.project_id) ?? "Project",
      isSubtask: t.parent_task_id != null,
      status: t.status,
    }));
  }

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", ctx.workspace.id);
  const memberIds = ((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id);
  let members: SearchMemberResult[] = [];
  if (memberIds.length > 0) {
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", memberIds)
      .ilike("full_name", pattern)
      .order("full_name")
      .limit(MAX_MEMBERS);
    members = ((profileRows ?? []) as Pick<Profile, "id" | "full_name">[]).map((p) => ({
      id: p.id,
      name: p.full_name,
    }));
  }

  return { results: { projects: matchedProjects, tasks, members } };
}
