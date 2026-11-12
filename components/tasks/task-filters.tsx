// Filter form for task lists (Part 2, §3): status, priority, assignee,
// due-date range, "Overdue only", and sort. A plain GET form — submitting
// it puts the filters in the URL query string (see lib/filters.ts), so a
// filtered view can be refreshed or shared. Used on the project task list
// and on /dashboard/my-tasks.

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { TaskFilterState } from "@/lib/filters";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export interface TaskFilterMember {
  user_id: string;
  full_name: string | null;
}

export async function TaskFilters({
  basePath,
  filters,
  members,
  showAssignee = true,
  showMine = false,
  mine = false,
}: {
  basePath: string;
  filters: TaskFilterState;
  members: TaskFilterMember[];
  /** My tasks are always the user's own, so there is no assignee filter there. */
  showAssignee?: boolean;
  /** Workspace-wide lists offer a "My tasks only" toggle (default ON for developers). */
  showMine?: boolean;
  /** Resolved "My tasks only" value (explicit URL value, else the role default). */
  mine?: boolean;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      <Select name="status" defaultValue={filters.status} aria-label={t("filters.statusAria")} className="w-auto">
        <option value="all">{t("filters.allStatuses")}</option>
        <option value="todo">{t("tasks.statusTodo")}</option>
        <option value="in_progress">{t("tasks.statusInProgress")}</option>
        <option value="in_review">{t("tasks.statusInReview")}</option>
        <option value="completed">{t("tasks.statusCompleted")}</option>
      </Select>

      <Select name="priority" defaultValue={filters.priority} aria-label={t("filters.priorityAria")} className="w-auto">
        <option value="all">{t("filters.allPriorities")}</option>
        <option value="urgent">{t("projects.priorityUrgent")}</option>
        <option value="high">{t("projects.priorityHigh")}</option>
        <option value="medium">{t("projects.priorityMedium")}</option>
        <option value="low">{t("projects.priorityLow")}</option>
      </Select>

      {showAssignee ? (
        <Select name="assignee" defaultValue={filters.assignee} aria-label={t("filters.assigneeAria")} className="w-auto">
          <option value="all">{t("filters.allAssignees")}</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name ?? t("common.memberFallback")}
            </option>
          ))}
        </Select>
      ) : null}

      <label className="inline-flex items-center gap-1.5 text-sm text-muted">
        {t("filters.dueFrom")}
        <Input type="date" name="due_from" defaultValue={filters.dueFrom ?? ""} aria-label={t("filters.dueFromAria")} className="w-auto" />
      </label>
      <label className="inline-flex items-center gap-1.5 text-sm text-muted">
        {t("filters.dueTo")}
        <Input type="date" name="due_to" defaultValue={filters.dueTo ?? ""} aria-label={t("filters.dueToAria")} className="w-auto" />
      </label>

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink">
        <input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdueOnly} className="h-4 w-4 accent-[#6658F5]" />
        {t("filters.overdueOnly")}
      </label>

      {showMine ? (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink">
          <input type="checkbox" name="mine" value="1" defaultChecked={mine} className="h-4 w-4 accent-[#6658F5]" />
          {t("filters.mineOnly")}
          {/* Unchecked must still submit mine=0: without it the URL omits
              the param and a developer's default (ON) would silently
              re-apply. The checkbox comes first, so the parser reads "1"
              when it is checked and "0" when it is not. */}
          <input type="hidden" name="mine" value="0" />
        </label>
      ) : null}

      <Select name="sort" defaultValue={filters.sort} aria-label={t("filters.sortAria")} className="w-auto">
        <option value="due_date">{t("filters.sortDue")}</option>
        <option value="priority">{t("filters.sortPriority")}</option>
        <option value="updated">{t("filters.sortUpdated")}</option>
      </Select>

      <Button type="submit" variant="outline" size="sm">
        {t("common.filter")}
      </Button>
      {(filters.status !== "all" ||
        filters.priority !== "all" ||
        filters.assignee !== "all" ||
        filters.dueFrom ||
        filters.dueTo ||
        filters.overdueOnly ||
        filters.mine !== null ||
        filters.sort !== "due_date") && (
        <Link href={basePath}>
          <Button type="button" variant="ghost" size="sm">
            {t("common.clear")}
          </Button>
        </Link>
      )}
    </form>
  );
}
