// Dashboard widget: the latest 8 activity items for the active workspace,
// with a "View all" link to /dashboard/activity.
//
// DEFAULT export, NO required props, works standalone: it loads its own
// dashboard context (membership is re-checked server-side) and renders
// nothing when there is no signed-in user or workspace. The dashboard page
// can mount it with a bare <RecentActivity />.
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { getRecentActivity } from "@/lib/actions/activity";
import { getDashboardContext } from "@/lib/actions/workspace";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function RecentActivity() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace) return null;

  const items = await getRecentActivity(ctx.workspace.id, 8);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("activity.recentTitle")}</CardTitle>
        <Link href="/dashboard/activity" className="text-sm font-medium text-primary hover:underline">
          {t("common.viewAll")}
        </Link>
      </CardHeader>
      <CardContent>
        <ActivityTimeline items={items} timezone={ctx.workspace.timezone} />
      </CardContent>
    </Card>
  );
}
