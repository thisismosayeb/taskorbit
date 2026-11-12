"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { commentSchema } from "@/lib/validators";
import { canDeleteComment } from "@/lib/permissions";
import { requireWorkspaceRole } from "@/lib/actions/workspace";

export interface ActionResult {
  error?: string;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Loads a task's project workspace and verifies caller membership there. */
async function loadTaskWorkspace(taskId: string) {
  const supabase = await createClient();
  const { data: task, error } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("id", taskId)
    .maybeSingle();
  if (error || !task) throw new Error("Task not found.");
  const { data: project } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", task.project_id as string)
    .maybeSingle();
  if (!project) throw new Error("Task not found.");
  const membership = await requireWorkspaceRole(project.workspace_id as string);
  return { supabase, workspaceId: project.workspace_id as string, ...membership };
}

export async function addComment(taskId: string, content: string): Promise<ActionResult> {
  try {
    const parsed = commentSchema.safeParse({ content });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Comment must be 1–2000 characters." };

    const { supabase, userId } = await loadTaskWorkspace(taskId);
    const { error } = await supabase
      .from("comments")
      .insert({ task_id: taskId, author_id: userId, content: parsed.data.content });
    if (error) return { error: `Could not post the comment: ${error.message}` };

    revalidatePath(`/dashboard/tasks/${taskId}`);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not post the comment.") };
  }
}

export async function editComment(commentId: string, content: string): Promise<ActionResult> {
  try {
    const parsed = commentSchema.safeParse({ content });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Comment must be 1–2000 characters." };

    const supabase = await createClient();
    const { data: comment } = await supabase.from("comments").select("id, task_id, author_id").eq("id", commentId).maybeSingle();
    if (!comment) return { error: "Comment not found." };

    const { userId } = await loadTaskWorkspace(comment.task_id as string);
    if (comment.author_id !== userId) return { error: "You can only edit your own comments." };

    const { error } = await supabase
      .from("comments")
      .update({ content: parsed.data.content })
      .eq("id", commentId);
    if (error) return { error: `Could not update the comment: ${error.message}` };

    revalidatePath(`/dashboard/tasks/${comment.task_id as string}`);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not update the comment.") };
  }
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: comment } = await supabase.from("comments").select("id, task_id, author_id").eq("id", commentId).maybeSingle();
    if (!comment) return { error: "Comment not found." };

    const { userId, role } = await loadTaskWorkspace(comment.task_id as string);
    if (!canDeleteComment(role, comment.author_id as string, userId)) {
      return { error: "You can only delete your own comments." };
    }

    const { error } = await supabase.from("comments").delete().eq("id", commentId);
    if (error) return { error: `Could not delete the comment: ${error.message}` };

    revalidatePath(`/dashboard/tasks/${comment.task_id as string}`);
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not delete the comment.") };
  }
}
