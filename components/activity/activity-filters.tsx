// Filter bar for the activity page: project, member, action type.
// A plain GET form — no JavaScript needed; the page re-renders server-side.
import Link from "next/link";
import { ACTIVITY_ACTION_TYPES } from "@/lib/activity/format";
import type { ActivityFilterOptions } from "@/lib/actions/activity";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export async function ActivityFilters({
  options,
  selected,
}: {
  options: ActivityFilterOptions;
  selected: { projectId?: string; memberId?: string; action?: string };
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const selectClass =
    "h-9 max-w-[220px] rounded-lg border border-ink/15 bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  const hasFilter = Boolean(selected.projectId ?? selected.memberId ?? selected.action);

  return (
    <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-ink/10 bg-surface p-4">
      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("activity.filterProject")}
        <select name="project" defaultValue={selected.projectId ?? ""} className={selectClass}>
          <option value="">{t("activity.allProjects")}</option>
          {options.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("activity.filterMember")}
        <select name="member" defaultValue={selected.memberId ?? ""} className={selectClass}>
          <option value="">{t("activity.allMembers")}</option>
          {options.members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name ?? t("common.memberFallback")} ({m.role})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        {t("activity.filterAction")}
        <select name="action" defaultValue={selected.action ?? ""} className={selectClass}>
          <option value="">{t("activity.allActions")}</option>
          {ACTIVITY_ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
      >
        {t("common.filter")}
      </button>
      {hasFilter ? (
        <Link href="/dashboard/activity" className="inline-flex h-9 items-center text-sm text-muted hover:text-ink">
          {t("common.clear")}
        </Link>
      ) : null}
    </form>
  );
}
