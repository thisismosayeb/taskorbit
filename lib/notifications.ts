// Notification link targets — client-safe (no server imports).
// A notification always links to its object when it has one; otherwise to
// the notifications page.
import type { Notification } from "@/types";

export function getNotificationHref(notification: Notification): string {
  if (notification.entity_type === "task" && notification.entity_id) {
    return `/dashboard/tasks/${notification.entity_id}`;
  }
  if (notification.entity_type === "project" && notification.entity_id) {
    return `/dashboard/projects/${notification.entity_id}`;
  }
  return "/dashboard/notifications";
}
