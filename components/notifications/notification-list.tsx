// Notifications list for /dashboard/notifications: All / Unread tabs,
// "Mark all as read", and pagination. The page (server component) loads the
// data; this client component owns the interactive bits.
"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { NotificationItem } from "@/components/notifications/notification-item";
import { markAllNotificationsRead } from "@/lib/actions/notifications";
import type { Notification } from "@/types";
import type { NotificationTab } from "@/lib/actions/notifications";
import { t, useLocale} from "@/lib/i18n";

export function NotificationList({
  workspaceId,
  initialNotifications,
  total,
  page,
  pageSize,
  tab,
  timezone,
}: {
  workspaceId: string;
  initialNotifications: Notification[];
  total: number;
  page: number;
  pageSize: number;
  tab: NotificationTab;
  timezone: string;
}) {
  useLocale();
  const { toast } = useToast();
  const [items, setItems] = React.useState<Notification[]>(initialNotifications);
  const [markingAll, setMarkingAll] = React.useState(false);

  // The page re-renders with fresh server data on tab/page change.
  React.useEffect(() => {
    setItems(initialNotifications);
  }, [initialNotifications]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const unreadOnPage = items.filter((n) => n.read_at === null).length;

  function handleMarkedRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  async function handleMarkAllRead() {
    setMarkingAll(true);
    const result = await markAllNotificationsRead(workspaceId);
    setMarkingAll(false);
    if (result.error) {
      toast(result.error, "error");
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    toast(t("notifications.markedAll"));
  }

  const tabLink = (t: NotificationTab) =>
    `/dashboard/notifications?tab=${t}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-ink/5 p-1" role="tablist" aria-label={t("notifications.filterAria")}>
          {(["all", "unread"] as NotificationTab[]).map((tabValue) => (
            <Link
              key={tabValue}
              href={tabLink(tabValue)}
              role="tab"
              aria-selected={tab === tabValue}
              className={
                tab === tabValue
                  ? "rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-ink shadow-sm"
                  : "rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink"
              }
            >
              {tabValue === "all" ? t("notifications.all") : t("notifications.unread")}
            </Link>
          ))}
        </div>
        <Button variant="outline" size="sm" disabled={markingAll || unreadOnPage === 0} onClick={() => void handleMarkAllRead()}>
          {markingAll ? t("notifications.marking") : t("notifications.markAllRead")}
        </Button>
      </div>

      <p className="mt-3 text-xs text-muted">
        {total === 0
          ? t("notifications.noNotifications")
          : t("notifications.summary", {
              total,
              totalS: total === 1 ? "" : "s",
              unreadPart: tab === "unread" ? t("notifications.unreadPart") : "",
              timezone,
            })}
      </p>

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-ink/10 bg-surface p-6 text-center text-sm text-muted">
          {tab === "unread" ? t("notifications.noUnread") : t("notifications.noNotifications")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-ink/5 overflow-hidden rounded-xl border border-ink/10 bg-surface">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem notification={n} onMarkedRead={handleMarkedRead} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">
            {t("common.pageOf", { page, totalPages })}
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/dashboard/notifications?tab=${tab}&page=${page - 1}`}
                className="rounded-lg border border-ink/15 bg-surface px-3 py-1.5 hover:bg-background"
              >
                {t("common.previous")}
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={`/dashboard/notifications?tab=${tab}&page=${page + 1}`}
                className="rounded-lg border border-ink/15 bg-surface px-3 py-1.5 hover:bg-background"
              >
                {t("common.next")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
