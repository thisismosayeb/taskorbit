// One notification row: title, short body, relative time, unread dot.
// Used by both the bell dropdown and the notifications page.
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/date/relative";
import { getNotificationHref } from "@/lib/notifications";
import { markNotificationRead } from "@/lib/actions/notifications";
import type { Notification } from "@/types";
import { t, useLocale} from "@/lib/i18n";

export function NotificationItem({
  notification,
  onMarkedRead,
}: {
  notification: Notification;
  /** Called after a successful mark-read (parent updates its local state). */
  onMarkedRead?: (id: string) => void;
}) {
  useLocale();
  const router = useRouter();
  const [marking, setMarking] = React.useState(false);
  const unread = notification.read_at === null;

  async function handleClick() {
    const href = getNotificationHref(notification);
    if (unread && !marking) {
      setMarking(true);
      const result = await markNotificationRead(notification.id);
      setMarking(false);
      if (!result.error) onMarkedRead?.(notification.id);
    }
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-background",
        unread ? "bg-primary/[0.04]" : "bg-surface",
      )}
    >
      <span
        aria-label={unread ? t("notifications.unread") : t("notifications.read")}
        className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-ink/20")}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", unread ? "font-semibold text-ink" : "font-medium text-ink/80")}>
          {notification.title}
        </span>
        {notification.body ? (
          <span className="mt-0.5 block truncate text-sm text-muted">{notification.body}</span>
        ) : null}
        <span className="mt-1 block text-xs text-muted" title={new Date(notification.created_at).toISOString()}>
          {formatRelativeTime(notification.created_at)}
        </span>
      </span>
    </button>
  );
}
