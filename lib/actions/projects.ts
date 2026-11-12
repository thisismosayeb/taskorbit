"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { projectSchema, type ProjectInput } from "@/lib/validators";
import { canManageProjects } from "@/lib/permissions";
import { requireWorkspaceRole } from "@/lib/actions/workspace";

export interface ActionResult {
  error?: string;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Loads a project and verifies the caller is a member of its workspace. */
async function loadProjectWorkspace(projectId: string) {
  const supabase = await createClient();
  const { data: project, error } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (error || !project) throw new Error("Project not found.");
  const membership = await requireWorkspaceRole(project.workspace_id as string);
  return { supabase, project: project as { id: string; workspace_id: string }, ...membership };
}

export async function createProject(
  workspaceId: string,
  values: ProjectInput,
): Promise<ActionResult & { projectId?: string }> {
  try {
    const parsed = projectSchema.safeParse(values);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the project details and try again." };

    const { userId, role } = await requireWorkspaceRole(workspaceId);
    if (!canManageProjects(role)) return { error: "Only the workspace manager can create projects." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        status: parsed.data.status,
        priority: parsed.data.priority,
        start_date: parsed.data.start_date ?? null,
        due_date: parsed.data.due_date ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `Could not create the project: ${error?.message ?? "Unknown error"}` };

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/projects");
    return { projectId: data.id as string };
  } catch (err) {
    return { error: errorMessage(err, "Could not create the project.") };
  }
}

export async function updateProject(projectId: string, values: ProjectInput): Promise<ActionResult> {
  try {
    const parsed = projectSchema.safeParse(values);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the project details and try again." };

    const { supabase, role } = await loadProjectWorkspace(projectId);
    if (!canManageProjects(role)) return { error: "Only the workspace manager can edit projects." };

    const { error } = await supabase
      .from("projects")
      .update({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        status: parsed.data.status,
        priority: parsed.data.priority,
        start_date: parsed.data.start_date ?? null,
        due_date: parsed.data.due_date ?? null,
      })
      .eq("id", projectId);
    if (error) return { error: `Could not update the project: ${error.message}` };

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${projectId}`);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not update the project.") };
  }
}

export async function deleteProject(projectId: string): Promise<ActionResult> {
  try {
    const { supabase, role } = await loadProjectWorkspace(projectId);
    if (!canManageProjects(role)) return { error: "Only the workspace manager can delete projects." };

    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) return { error: `Could not delete the project: ${error.message}` };

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/projects");
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not delete the project.") };
  }
}
