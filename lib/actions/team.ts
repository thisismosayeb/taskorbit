"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { inviteSchema } from "@/lib/validators";
import { canInvite, isManager } from "@/lib/permissions";
import { requireWorkspaceRole } from "@/lib/actions/workspace";

export interface ActionResult {
  error?: string;
}

/** The fields the Team page needs to show a just-created invite. */
export interface InvitationSummary {
  id: string;
  invited_email: string;
  created_at: string;
  expires_at: string;
}

export interface InvitationActionResult extends ActionResult {
  inviteLink?: string;
  invitation?: InvitationSummary;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function inviteLinkFor(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/invite/${token}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Best-effort activity write for invite events. The invite itself is the
 * source of truth — a failed activity insert must not fail the invite
 * action (the triggers in 0001 write every other event; invites have no
 * trigger, so this is the write path). RLS policy `activity_insert`
 * allows it: actor_id = the logged-in manager, member of the workspace.
 * Errors are logged server-side so a gap is visible, not silent.
 */
async function logInviteActivity(
  workspaceId: string,
  actorId: string,
  action: "invite.created" | "invite.revoked",
  invitationId: string,
  invitedEmail: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("activity_logs").insert({
      workspace_id: workspaceId,
      project_id: null,
      task_id: null,
      actor_id: actorId,
      action,
      metadata: { invited_email: invitedEmail, invitation_id: invitationId },
    });
    if (error) console.error(`[team] activity write failed (${action}):`, error.message);
  } catch (err) {
    console.error(`[team] activity write failed (${action}):`, err);
  }
}

async function createInvitationRow(workspaceId: string, email: string, createdBy: string) {
  const supabase = await createClient();
  // Random token; only its SHA-256 hash is stored. The raw token is
  // never written to the database.
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("workspace_invitations")
    .insert({
      workspace_id: workspaceId,
      invited_email: email,
      intended_role: "developer",
      token_hash: hashToken(token),
      expires_at: expiresAt,
      created_by: createdBy,
    })
    .select("id, invited_email, created_at, expires_at")
    .single();
  if (error || !data) throw new Error(`Could not create the invitation: ${error?.message ?? "Unknown error"}`);
  const invitation = data as unknown as InvitationSummary;
  return { invitation, inviteLink: inviteLinkFor(token) };
}

export async function inviteDeveloper(
  workspaceId: string,
  email: string,
): Promise<InvitationActionResult> {
  try {
    const parsed = inviteSchema.safeParse({ email });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

    const { userId, role } = await requireWorkspaceRole(workspaceId);
    if (!canInvite(role)) return { error: "Only the workspace manager can invite developers." };

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("workspace_invitations")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("invited_email", parsed.data.email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (existing) {
      return { error: "An invite is already pending for this email. Revoke it first, or use re-create to issue a fresh link." };
    }

    const result = await createInvitationRow(workspaceId, parsed.data.email, userId);
    await logInviteActivity(workspaceId, userId, "invite.created", result.invitation.id, parsed.data.email);
    revalidatePath("/dashboard/team");
    return { inviteLink: result.inviteLink, invitation: result.invitation };
  } catch (err) {
    return { error: errorMessage(err, "Could not create the invitation.") };
  }
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { data: invite } = await supabase
      .from("workspace_invitations")
      .select("id, workspace_id, invited_email")
      .eq("id", invitationId)
      .maybeSingle();
    if (!invite) return { error: "Invitation not found." };

    const { userId, role } = await requireWorkspaceRole(invite.workspace_id as string);
    if (!canInvite(role)) return { error: "Only the workspace manager can revoke invitations." };

    const { error } = await supabase
      .from("workspace_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId);
    if (error) return { error: `Could not revoke the invitation: ${error.message}` };

    await logInviteActivity(
      invite.workspace_id as string,
      userId,
      "invite.revoked",
      invitationId,
      invite.invited_email as string,
    );

    revalidatePath("/dashboard/team");
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not revoke the invitation.") };
  }
}

export async function recreateInvitation(
  invitationId: string,
): Promise<InvitationActionResult> {
  try {
    const supabase = await createClient();
    const { data: invite } = await supabase
      .from("workspace_invitations")
      .select("id, workspace_id, invited_email")
      .eq("id", invitationId)
      .maybeSingle();
    if (!invite) return { error: "Invitation not found." };

    const { userId, role } = await requireWorkspaceRole(invite.workspace_id as string);
    if (!canInvite(role)) return { error: "Only the workspace manager can re-create invitations." };

    await supabase
      .from("workspace_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invitationId);
    await logInviteActivity(
      invite.workspace_id as string,
      userId,
      "invite.revoked",
      invitationId,
      invite.invited_email as string,
    );

    const result = await createInvitationRow(invite.workspace_id as string, invite.invited_email as string, userId);
    await logInviteActivity(
      invite.workspace_id as string,
      userId,
      "invite.created",
      result.invitation.id,
      invite.invited_email as string,
    );
    revalidatePath("/dashboard/team");
    return { inviteLink: result.inviteLink, invitation: result.invitation };
  } catch (err) {
    return { error: errorMessage(err, "Could not re-create the invitation.") };
  }
}

/**
 * Manager removes a developer from the workspace. Atomic: the
 * remove_workspace_member RPC unassigns their open tasks, deletes the
 * membership and logs 'member.removed' in one transaction, and creates
 * no notification. The manager cannot remove themselves; the workspace
 * manager can never be removed.
 */
export async function removeWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<ActionResult & { unassignedOpenTasks?: number }> {
  try {
    if (!userId || typeof userId !== "string") {
      return { error: "Choose a member to remove." };
    }
    const { userId: callerId, role } = await requireWorkspaceRole(workspaceId);
    if (!isManager(role)) return { error: "Only the workspace manager can remove members." };
    if (userId === callerId) return { error: "You cannot remove yourself from the workspace." };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("remove_workspace_member", {
      p_workspace_id: workspaceId,
      p_user_id: userId,
    });
    if (error) return { error: `Could not remove the member: ${error.message}` };

    revalidatePath("/dashboard/team");
    return { unassignedOpenTasks: data ?? 0 };
  } catch (err) {
    return { error: errorMessage(err, "Could not remove the member.") };
  }
}
