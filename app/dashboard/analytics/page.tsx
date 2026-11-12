// Analytics page (Part 2, Section 7) — MANAGER ONLY.
//
// Role enforcement is server-side twice: getAnalytics() refuses
// developers (it returns { error } and no data), and this page renders
// the No-access page for them instead of the charts. Developers see
// personal stats on their own dashboard instead.

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { getDashboardContext } from "@/lib/actions/workspace";
import { getAnalytics } from "@/lib/actions/analytics";
import { isManager } from "@/lib/permissions";
import {
  completedPerWeekSummary,
  deadlineHealthSummary,
  prioritySummary,
  projectProgressSummary,
  statusSummary,
  workloadSummary,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ChartCard, ChartEmpty } from "@/components/analytics/chart-card";
import {
  CompletedPerWeekChart,
  DeadlineHealthChart,
  PriorityChart,
  StatusDonut,
  WorkloadChart,
} from "@/components/analytics/analytics-charts";
import { ProjectProgressTable } from "@/components/analytics/project-progress-table";
import { createTranslator, getServerLocale, type SupportedLocale } from "@/lib/i18n/server";

function NoAccess({ locale }: { locale?: SupportedLocale }) {
  const tr = createTranslator(locale ?? "en");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{tr("analytics.title")}</h1>
        <p className="mt-1 text-sm text-muted">{tr("analytics.subtitle")}</p>
      </div>
      <EmptyState
        title={tr("analytics.noAccessTitle")}
        description={tr("analytics.noAccessBody")}
        action={
          <Link href="/dashboard">
            <Button>{tr("analytics.backToMyDashboard")}</Button>
          </Link>
        }
      />
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string; from?: string; to?: string }>;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  if (!isManager(ctx.role)) return <NoAccess locale={locale} />;

  const params = (await searchParams) ?? {};
  const projectParam = (params.project ?? "all").trim();
  const result = await getAnalytics({
    projectId: projectParam === "all" ? null : projectParam,
    from: params.from ?? null,
    to: params.to ?? null,
  });

  if (result.error || !result.data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("analytics.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("analytics.subtitleFor", { workspace: ctx.workspace.name })}</p>
        </div>
        <EmptyState
          title={t("analytics.loadFailedTitle")}
          description={result.error ?? t("analytics.loadFailedFallback")}
          action={
            <Link href="/dashboard/analytics">
              <Button>{t("analytics.clearFiltersRetry")}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const data = result.data;
  const hasTasks = data.totals.tasks > 0;
  const hasCompleted = data.totals.completed > 0;
  const hasWorkload = data.workload.some((w) => w.open > 0 || w.completed > 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("analytics.title")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t("analytics.headerSummary", {
              workspace: data.workspaceName,
              projects: data.totals.projects,
              projectS: data.totals.projects === 1 ? "" : "s",
              tasks: data.totals.tasks,
              taskS: data.totals.tasks === 1 ? "" : "s",
              timezone: data.timezone,
            })}.
          </p>
        </div>
        <Link href="/dashboard">
          <Button variant="outline">{t("analytics.backToDashboard")}</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t("analytics.filterProject")}
              <Select name="project" defaultValue={data.projectId ?? "all"} aria-label={t("filterBar.projectAria")} className="w-56">
                <option value="all">{t("filterBar.allProjects")}</option>
                {data.projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t("analytics.filterFrom")}
              <Input type="date" name="from" defaultValue={data.from ?? ""} aria-label={t("analytics.filterFromAria")} className="w-44" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t("analytics.filterTo")}
              <Input type="date" name="to" defaultValue={data.to ?? ""} aria-label={t("analytics.filterToAria")} className="w-44" />
            </label>
            <Button type="submit" size="sm">
              {t("common.applyFilters")}
            </Button>
            {(data.projectId || data.from || data.to) && (
              <Link href="/dashboard/analytics">
                <Button type="button" variant="ghost" size="sm">
                  {t("common.clear")}
                </Button>
              </Link>
            )}
          </form>
          <p className="mt-3 text-xs text-muted">
            {t("analytics.filterNote")}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t("analytics.chartStatusTitle")} summary={statusSummary(data.status, locale)}>
          {hasTasks ? (
            <StatusDonut data={data.status} />
          ) : (
            <ChartEmpty
              title={t("analytics.emptyTitle")}
              description={t("analytics.emptyStatusBody")}
              action={
                <Link href="/dashboard/projects/new">
                  <Button size="sm">{t("common.createProject")}</Button>
                </Link>
              }
            />
          )}
        </ChartCard>

        <ChartCard title={t("analytics.chartHealthTitle")} summary={deadlineHealthSummary(data.deadlineHealth, locale)}>
          {hasTasks ? (
            <DeadlineHealthChart data={data.deadlineHealth} />
          ) : (
            <ChartEmpty
              title={t("analytics.emptyTitle")}
              description={t("analytics.emptyHealthBody")}
              action={
                <Link href="/dashboard/projects">
                  <Button size="sm">{t("analytics.goToProjects")}</Button>
                </Link>
              }
            />
          )}
        </ChartCard>

        <ChartCard
          title={t("analytics.chartWorkloadTitle")}
          summary={workloadSummary(data.workload, locale)}
          action={
            <Link href="/dashboard/team">
              <Button variant="outline" size="sm">
                {t("analytics.manageTeam")}
              </Button>
            </Link>
          }
        >
          {hasWorkload ? (
            <>
              <WorkloadChart data={data.workload} />
              <p className="mt-2 text-xs text-muted">
                {t("analytics.workloadNote")}
              </p>
            </>
          ) : (
            <ChartEmpty
              title={t("analytics.emptyTitle")}
              description={t("analytics.emptyWorkloadBody")}
              action={
                <Link href="/dashboard/projects">
                  <Button size="sm">{t("analytics.goToProjects")}</Button>
                </Link>
              }
            />
          )}
        </ChartCard>

        <ChartCard title={t("analytics.chartWeekTitle")} summary={completedPerWeekSummary(data.completedPerWeek, locale)}>
          {data.completedPerWeek.length > 0 ? (
            <CompletedPerWeekChart data={data.completedPerWeek} />
          ) : (
            <ChartEmpty
              title={t("analytics.emptyTitle")}
              description={
                data.from || data.to ? t("analytics.emptyWeekRangeBody") : t("analytics.emptyWeekBody")
              }
              action={
                data.from || data.to ? (
                  <Link href="/dashboard/analytics">
                    <Button size="sm">{t("analytics.clearDateRange")}</Button>
                  </Link>
                ) : (
                  <Link href="/dashboard/my-tasks">
                    <Button size="sm">{t("analytics.goToMyTasks")}</Button>
                  </Link>
                )
              }
            />
          )}
        </ChartCard>

        <ChartCard title={t("analytics.chartPriorityTitle")} summary={prioritySummary(data.priority, locale)}>
          {hasTasks ? (
            <PriorityChart data={data.priority} />
          ) : (
            <ChartEmpty
              title={t("analytics.emptyTitle")}
              description={t("analytics.emptyPriorityBody")}
              action={
                <Link href="/dashboard/projects">
                  <Button size="sm">{t("analytics.goToProjects")}</Button>
                </Link>
              }
            />
          )}
        </ChartCard>

        <ChartCard title={t("analytics.chartProgressTitle")} summary={projectProgressSummary(data.projectRows, locale)}>
          {data.projectRows.length > 0 ? (
            <ProjectProgressTable rows={data.projectRows} />
          ) : (
            <ChartEmpty
              title={t("analytics.emptyTitle")}
              description={t("analytics.emptyProgressBody")}
              action={
                <Link href="/dashboard/projects/new">
                  <Button size="sm">{t("common.createProject")}</Button>
                </Link>
              }
            />
          )}
        </ChartCard>
      </div>

      <p className="flex items-start gap-2 text-xs text-muted">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {t("analytics.footerNote", { timezone: data.timezone })}
        </span>
      </p>
    </div>
  );
}
