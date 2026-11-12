// (6) Project progress table — one row per project: progress % (official
// formula), total / completed / overdue tasks, due date with deadline chip.
// Server component; links go to the project detail page.

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import type { ProjectProgressRow } from "@/lib/analytics";
import { createTranslator, getServerLocale, type SupportedLocale } from "@/lib/i18n/server";
import { formatDateShortLocale } from "@/lib/i18n/format";

const dueVariant: Record<ProjectProgressRow["dueState"], "green" | "red" | "amber" | "cyan" | "neutral"> = {
  green: "green",
  red: "red",
  amber: "amber",
  neutral: "cyan",
  none: "neutral",
};

function formatDate(value: string | null, locale: SupportedLocale): string {
  if (!value) return "—";
  return formatDateShortLocale(new Date(`${value}T00:00:00`), locale);
}

export async function ProjectProgressTable({ rows }: { rows: ProjectProgressRow[] }) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("analytics.tableProject")}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("analytics.tableProgress")}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("analytics.tableTasks")}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("analytics.tableOverdue")}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t("analytics.tableDueDate")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.projectId} className="border-b border-ink/5 last:border-b-0">
              <td className="py-3 pr-3">
                <Link href={`/dashboard/projects/${row.projectId}`} className="font-medium hover:text-primary hover:underline">
                  {row.projectName}
                </Link>
                <span className="mt-0.5 block text-xs capitalize text-muted">{row.projectStatus.replace("_", " ")}</span>
              </td>
              <td className="py-3 pr-3">
                <div className="flex min-w-[140px] items-center gap-2">
                  <span className="w-24 shrink-0">
                    <ProgressBar percent={row.progress.percent} locale={locale} />
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted">
                    {row.progress.label}
                    {row.progress.total > 0 ? ` (${row.progress.completed}/${row.progress.total})` : ""}
                  </span>
                </div>
              </td>
              <td className="py-3 pr-3">
                {t("analytics.ofDone", { completed: row.progress.completed, total: row.progress.total })}
              </td>
              <td className="py-3 pr-3">
                {row.overdue > 0 ? (
                  <span className="font-medium text-red-700">{t("analytics.overdueCount", { count: row.overdue })}</span>
                ) : (
                  <span className="text-muted">{t("analytics.noneOverdue")}</span>
                )}
              </td>
              <td className="py-3">
                <span className="mr-2">{formatDate(row.dueDate, locale)}</span>
                <Badge variant={dueVariant[row.dueState]}>{row.dueLabel}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
