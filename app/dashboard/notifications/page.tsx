import { getDashboardContext } from "@/lib/actions/workspace";
import { listNotifications, type NotificationTab } from "@/lib/actions/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace) return null;

  const params = await searchParams;
  const tab: NotificationTab = params.tab === "unread" ? "unread" : "all";
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const result = await listNotifications(ctx.workspace.id, { tab, page });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("notifications.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("notifications.subtitle", { workspace: ctx.workspace.name })}
        </p>
      </div>

      <NotificationList
        workspaceId={ctx.workspace.id}
        initialNotifications={result.notifications}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        tab={tab}
        timezone={ctx.workspace.timezone}
      />
    </div>
  );
}
