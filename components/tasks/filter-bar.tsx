// Client-side filter bar for the board and calendar pages (Part 2, §1–§2).
//
// Why client-side instead of a plain GET form: the "My tasks only" toggle
// defaults ON for developers, so "no value in the URL" does NOT mean OFF —
// a GET checkbox cannot express that. This bar pushes an explicit
// mine=1 / mine=0 on every toggle, so the URL always says what it means.
// Every change resets to page 1 (board/calendar have no pages, but the
// field is cleared for consistency).

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import {
  serializeTaskFilters,
  type TaskFilterState,
} from "@/lib/filters";
import { t, useLocale} from "@/lib/i18n";

export interface FilterBarProject {
  id: string;
  name: string;
}

export interface FilterBarMember {
  user_id: string;
  full_name: string | null;
}

export function FilterBar({
  basePath,
  current,
  mineResolved,
  projects,
  members,
  showPriority,
  showStatus,
  preserve,
}: {
  basePath: string;
  /** Current filters, parsed from the URL by the page. */
  current: TaskFilterState;
  /** "My tasks only" after resolving the developer default (see lib/filters resolveMine). */
  mineResolved: boolean;
  projects: FilterBarProject[];
  members: FilterBarMember[];
  showPriority?: boolean;
  showStatus?: boolean;
  /** Extra query params to keep when pushing (e.g. view + date on the calendar). */
  preserve?: Record<string, string>;
}) {
  useLocale();
  const router = useRouter();

  function push(next: Partial<TaskFilterState>) {
    const merged: TaskFilterState = { ...current, ...next, page: 1 };
    const params = serializeTaskFilters(merged);
    for (const [key, value] of Object.entries(preserve ?? {})) params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={t("filterBar.projectAria")}
        value={current.project}
        onChange={(e) => push({ project: e.target.value })}
        className="w-auto"
      >
        <option value="all">{t("filterBar.allProjects")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label={t("filterBar.assigneeAria")}
        value={current.assignee}
        onChange={(e) => push({ assignee: e.target.value })}
        className="w-auto"
      >
        <option value="all">{t("filterBar.allAssignees")}</option>
        {members.map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.full_name ?? t("common.memberFallback")}
          </option>
        ))}
      </Select>

      {showPriority ? (
        <Select
          aria-label={t("filterBar.priorityAria")}
          value={current.priority}
          onChange={(e) => push({ priority: e.target.value as TaskFilterState["priority"] })}
          className="w-auto"
        >
          <option value="all">{t("filterBar.allPriorities")}</option>
          <option value="urgent">{t("projects.priorityUrgent")}</option>
          <option value="high">{t("projects.priorityHigh")}</option>
          <option value="medium">{t("projects.priorityMedium")}</option>
          <option value="low">{t("projects.priorityLow")}</option>
        </Select>
      ) : null}

      {showStatus ? (
        <Select
          aria-label={t("filterBar.statusAria")}
          value={current.status}
          onChange={(e) => push({ status: e.target.value as TaskFilterState["status"] })}
          className="w-auto"
        >
          <option value="all">{t("filterBar.allStatuses")}</option>
          <option value="todo">{t("tasks.statusTodo")}</option>
          <option value="in_progress">{t("tasks.statusInProgress")}</option>
          <option value="in_review">{t("tasks.statusInReview")}</option>
          <option value="completed">{t("tasks.statusCompleted")}</option>
        </Select>
      ) : null}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={mineResolved}
          onChange={(e) => push({ mine: e.target.checked })}
          className="h-4 w-4 accent-[#6658F5]"
        />
        {t("filterBar.myTasksOnly")}
      </label>
    </div>
  );
}
