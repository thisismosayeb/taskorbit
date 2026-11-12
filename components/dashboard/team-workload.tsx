// Team workload mini list (Part 2, Section 8) — each developer's open
// and overdue task counts on the manager dashboard. Counts come from
// workloadByMember() in lib/analytics.ts (top-level tasks only).

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { MemberWorkload } from "@/lib/analytics";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export async function TeamWorkload({ rows }: { rows: MemberWorkload[] }) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  if (rows.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{t("teamWorkload.title")}</h2>
        <Card>
          <CardContent className="px-6 py-6 text-sm text-muted">
            {t("teamWorkload.empty")}
          </CardContent>
        </Card>
      </section>
    );
  }
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{t("teamWorkload.title")}</h2>
        <Link href="/dashboard/team" className="text-sm font-medium text-primary hover:underline">
          {t("teamWorkload.manageTeam")}
        </Link>
      </div>
      <Card>
        <CardContent className="divide-y divide-ink/5 px-0 py-0">
          {rows.map((row) => (
            <div key={row.userId} className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
              <span className="min-w-0 flex-1 font-medium">{row.name}</span>
              <span className="text-sm text-muted">
                {t("teamWorkload.openCompleted", { open: row.open, completed: row.completed })}
              </span>
              {row.overdue > 0 ? (
                <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  {t("teamWorkload.overdueCount", { count: row.overdue })}
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{t("teamWorkload.noneOverdue")}</span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
