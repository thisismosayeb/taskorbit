// Bell in the top bar: unread-count badge + dropdown with the latest 10.
// Live updates come from useNotificationsRealtime (filtered to this user's
// own notifications); if realtime never connects, the hook falls back to
// polling and the count refreshes on the 30 s / window-focus refresh.
// A server refresh re-renders the layout with fresh initial props, and the
// effect below resyncs the local state from them — without it the badge
// could never change from a refresh, because useState reads the initial
// value only once. The root carries data-realtime-mode (connecting | live
// | polling) so a browser test can read the subscription state without
// DevTools; it is not visible UI.
"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "@/components/notifications/notification-item";
import {
  getLatestNotifications,
  getUnreadCount,
  markAllNotificationsRead,
} from "@/lib/actions/notifications";
import { useNotificationsRealtime } from "@/lib/realtime/hooks";
import type { Notification } from "@/types";
import { t, useLocale} from "@/lib/i18n";

export function NotificationBell({
  workspaceId,
  userId,
  initialUnreadCount,
  initialNotifications,
}: {
  workspaceId: string;
  userId: string;
  initialUnreadCount: number;
  initialNotifications: Notification[];
}) {
  useLocale();
  const [open, setOpen] = React.useState(false);
  const [unreadCount, setUnreadCount] = React.useState(initialUnreadCount);
  const [items, setItems] = React.useState<Notification[]>(initialNotifications);

  const realtimeMode = useNotificationsRealtime(userId, ({ notification }) => {
    setItems((prev) => [notification as Notification, ...prev].slice(0, 10));
    setUnreadCount((c) => c + 1);
  });

  // Resync from the server whenever a refresh (or navigation) delivers new
  // initial props. This effect only runs when the props themselves change,
  // so live increments from the realtime callback above are untouched
  // between refreshes; the server-fetched props are the source of truth.
  React.useEffect(() => {
    setUnreadCount(initialUnreadCount);
    setItems(initialNotifications);
  }, [initialUnreadCount, initialNotifications]);

  // Refresh the dropdown contents and the exact count when it opens.
  async function refresh() {
    const [latest, count] = await Promise.all([
      getLatestNotifications(workspaceId, 10),
      getUnreadCount(workspaceId),
    ]);
    setItems(latest);
    setUnreadCount(count);
  }

  function handleMarkedRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function handleMarkAllRead() {
    const result = await markAllNotificationsRead(workspaceId);
    if (!result.error) {
      setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      setUnreadCount(0);
    }
  }

  return (
    <div className="relative" data-realtime-mode={realtimeMode} data-realtime-channel="notifications">
      <Button
        variant="ghost"
        size="sm"
        aria-label={unreadCount > 0 ? t("notifications.bellAriaUnread", { count: unreadCount }) : t("notifications.bellAria")}
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral px-1 text-[11px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Button>
      {open ? (
        <>
          <button aria-label={t("notifications.close")} className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-ink/10 bg-surface shadow-lg sm:w-96">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <h2 className="font-heading text-sm font-semibold text-ink">{t("notifications.title")}</h2>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t("notifications.markAllRead")}
                </button>
              ) : null}
            </div>
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">{t("notifications.noNotifications")}</p>
            ) : (
              <ul className="max-h-96 divide-y divide-ink/5 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <NotificationItem notification={n} onMarkedRead={handleMarkedRead} />
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-ink/10 px-4 py-2 text-center">
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-primary hover:underline"
              >
                {t("notifications.viewAll")}
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
