"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageProjects } from "@/lib/permissions";
import type { Profile, Workspace, WorkspaceMember, WorkspaceRole } from "@/types";

// Not exported: only async functions may be exported from a "use server" file.
const ACTIVE_WORKSPACE_COOKIE = "taskorbit-workspace-id";

export interface DashboardContext {
  user: { id: string; email: string | null } | null;
  profile: Profile | null;
  workspace: Workspace | null;
  memberships: (WorkspaceMember & { workspace: Workspace })[];
  role: WorkspaceRole | null;
}

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  timezone: string;
  role: WorkspaceRole;
  joinedAt: string;
}

// Verified user via supabase.auth.getUser() — never trust a client-sent id.
// (Moved here from lib/workspace.ts, Part 2: there is now one canonical
// workspace helper module. The old file's getActiveWorkspace /
// requireWorkspace / setActiveWorkspaceCookie were unused anywhere and are
// covered by getDashboardContext / requireWorkspaceRole /
// setActiveWorkspace below, so they were dropped, not moved.)
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getUserWorkspaces(userId: string): Promise<WorkspaceMembership[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, joined_at, workspaces ( id, name, slug, timezone )")
    .eq("user_id", userId);

  if (error || !data) return [];

  return data.flatMap((row) => {
    const ws = row.workspaces as unknown as {
      id: string;
      name: string;
      slug: string;
      timezone: string;
    } | null;
    if (!ws) return [];
    return [
      {
        workspaceId: ws.id,
        workspaceName: ws.name,
        workspaceSlug: ws.slug,
        timezone: ws.timezone,
        role: row.role as WorkspaceRole,
        joinedAt: row.joined_at as string,
      },
    ];
  });
}

/**
 * Loads the signed-in user, their workspace memberships and the active
 * workspace (from cookie, falling back to the first membership).
 * Never trusts client-sent ids or roles: the user comes from
 * supabase.auth.getUser() and the role from workspace_members.
 */
export async function getDashboardContext(): Promise<DashboardContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const empty: DashboardContext = { user: null, profile: null, workspace: null, memberships: [], role: null };
  if (!user) return empty;

  const { data: memberRows } = await supabase
    .from("workspace_members")
    .select("id, workspace_id, user_id, role, joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  const members = (memberRows ?? []) as WorkspaceMember[];
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profileRow = (profile as Profile | null) ?? null;

  if (members.length === 0) {
    return { ...empty, user: { id: user.id, email: user.email ?? null }, profile: profileRow };
  }

  const workspaceIds = members.map((m) => m.workspace_id);
  const { data: workspaceRows } = await supabase.from("workspaces").select("*").in("id", workspaceIds);
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const byId = new Map(workspaces.map((w) => [w.id, w]));

  const memberships = members
    .filter((m) => byId.has(m.workspace_id))
    .map((m) => ({ ...m, workspace: byId.get(m.workspace_id) as Workspace }));

  const cookieStore = await cookies();
  const activeId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active = memberships.find((m) => m.workspace_id === activeId) ?? memberships[0] ?? null;

  return {
    user: { id: user.id, email: user.email ?? null },
    profile: profileRow,
    workspace: active?.workspace ?? null,
    memberships,
    role: active?.role ?? null,
  };
}

export interface AuthedMembership {
  userId: string;
  email: string | null;
  role: WorkspaceRole;
}

/**
 * Verifies the signed-in user is a member of the workspace and returns
 * their server-checked role. Throws with a user-facing message otherwise.
 * Returns plain data only (callers create their own Supabase client).
 */
export async function requireWorkspaceRole(workspaceId: string): Promise<AuthedMembership> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in. Please log in and try again.");

  const { data: member } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) throw new Error("You are not a member of this workspace.");

  return { userId: user.id, email: user.email ?? null, role: (member as { role: WorkspaceRole }).role };
}

export async function setActiveWorkspace(workspaceId: string): Promise<{ error?: string }> {
  try {
    await requireWorkspaceRole(workspaceId);
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
      path: "/",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not switch workspace." };
  }
}

const renameSchema = z.object({
  name: z.string().trim().min(2, "Workspace name must be at least 2 characters").max(80),
});

export async function renameWorkspace(workspaceId: string, name: string): Promise<{ error?: string }> {
  try {
    const parsed = renameSchema.safeParse({ name });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid workspace name." };

    const { role } = await requireWorkspaceRole(workspaceId);
    if (!canManageProjects(role)) return { error: "Only the workspace manager can rename the workspace." };

    const supabase = await createClient();
    const { error } = await supabase.from("workspaces").update({ name: parsed.data.name }).eq("id", workspaceId);
    if (error) return { error: `Could not rename the workspace: ${error.message}` };
    revalidatePath("/dashboard");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not rename the workspace." };
  }
}

export async function logOutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE);
  redirect("/login");
}
