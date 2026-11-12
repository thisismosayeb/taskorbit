import Link from "next/link";
import { getDashboardContext } from "@/lib/actions/workspace";
import { listActivity, getActivityFilterOptions, ACTIVITY_PAGE_SIZE } from "@/lib/actions/activity";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; member?: string; action?: string; page?: string }>;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace) return null;

  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const filters = {
    projectId: params.project || undefined,
    memberId: params.member || undefined,
    action: params.action || undefined,
    page,
  };

  const [result, options] = await Promise.all([
    listActivity(ctx.workspace.id, filters),
    getActivityFilterOptions(ctx.workspace.id),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / ACTIVITY_PAGE_SIZE));
  const query = new URLSearchParams();
  if (filters.projectId) query.set("project", filters.projectId);
  if (filters.memberId) query.set("member", filters.memberId);
  if (filters.action) query.set("action", filters.action);
  const pageHref = (p: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(p));
    return `/dashboard/activity?${q.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("activity.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("activity.subtitle", { workspace: ctx.workspace.name, timezone: ctx.workspace.timezone })}
        </p>
      </div>

      <ActivityFilters
        options={options}
        selected={{ projectId: filters.projectId, memberId: filters.memberId, action: filters.action }}
      />

      <div className="rounded-xl border border-ink/10 bg-surface p-4 sm:p-6">
        <ActivityTimeline items={result.items} timezone={ctx.workspace.timezone} />
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            {t("activity.pageSummary", { page: result.page, totalPages, total: result.total, entry: result.total === 1 ? t("activity.entryOne") : t("activity.entryOther") })}
          </span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link href={pageHref(result.page - 1)} className="rounded-lg border border-ink/15 bg-surface px-3 py-1.5 hover:bg-background">
                {t("common.previous")}
              </Link>
            ) : null}
            {result.page < totalPages ? (
              <Link href={pageHref(result.page + 1)} className="rounded-lg border border-ink/15 bg-surface px-3 py-1.5 hover:bg-background">
                {t("common.next")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
