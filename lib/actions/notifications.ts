"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspaceRole } from "@/lib/actions/workspace";
import type { Notification } from "@/types";

export interface ActionResult {
  error?: string;
}

const uuidSchema = z.string().uuid();
const workspaceIdSchema = z.string().uuid();

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Unread count for the bell badge. Rows are scoped by both the active
 * workspace and the recipient — RLS (notifications_select_own) also limits
 * reads to the signed-in user's own rows, so a caller can never see
 * another member's count even with a forged workspace id.
 */
export async function getUnreadCount(workspaceId: string): Promise<number> {
  try {
    const parsed = workspaceIdSchema.safeParse(workspaceId);
    if (!parsed.success) return 0;
    const { userId } = await requireWorkspaceRole(parsed.data);
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", parsed.data)
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Latest notifications for the bell dropdown (newest first). */
export async function getLatestNotifications(
  workspaceId: string,
  limit = 10,
): Promise<Notification[]> {
  try {
    const parsed = workspaceIdSchema.safeParse(workspaceId);
    if (!parsed.success) return [];
    const { userId } = await requireWorkspaceRole(parsed.data);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("workspace_id", parsed.data)
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 50));
    if (error || !data) return [];
    return data as Notification[];
  } catch {
    return [];
  }
}

export type NotificationTab = "all" | "unread";

export interface NotificationListResult {
  notifications: Notification[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

export async function listNotifications(
  workspaceId: string,
  options: { tab?: NotificationTab; page?: number } = {},
): Promise<NotificationListResult> {
  const empty: NotificationListResult = { notifications: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  try {
    const parsed = workspaceIdSchema.safeParse(workspaceId);
    if (!parsed.success) return empty;
    const { userId } = await requireWorkspaceRole(parsed.data);
    const tab: NotificationTab = options.tab === "unread" ? "unread" : "all";
    const page = Math.max(1, Math.floor(options.page ?? 1));

    const supabase = await createClient();
    let query = supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("workspace_id", parsed.data)
      .eq("recipient_id", userId);
    if (tab === "unread") query = query.is("read_at", null);
    const { data, count, error } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error || !data) return empty;
    return { notifications: data as Notification[], total: count ?? 0, page, pageSize: PAGE_SIZE };
  } catch {
    return empty;
  }
}

/** Marks one notification read. RLS only allows the recipient's own rows. */
export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  try {
    const parsed = uuidSchema.safeParse(notificationId);
    if (!parsed.success) return { error: "Notification not found." };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "You must be logged in." };

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", parsed.data)
      .eq("recipient_id", user.id);
    if (error) return { error: `Could not mark the notification as read: ${error.message}` };

    revalidatePath("/dashboard/notifications");
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not mark the notification as read.") };
  }
}

/** Marks every unread notification in the active workspace as read. */
export async function markAllNotificationsRead(workspaceId: string): Promise<ActionResult> {
  try {
    const parsed = workspaceIdSchema.safeParse(workspaceId);
    if (!parsed.success) return { error: "Workspace not found." };
    const { userId } = await requireWorkspaceRole(parsed.data);

    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("workspace_id", parsed.data)
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (error) return { error: `Could not mark notifications as read: ${error.message}` };

    revalidatePath("/dashboard/notifications");
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not mark notifications as read.") };
  }
}
