// Shared task-list filter / sort / pagination helpers (Part 2, §3).
//
// Filters live in the URL query string, so a filtered view can be refreshed
// or shared. These helpers parse, validate and serialize that query string,
// and apply the same filters to already-loaded task rows (project detail /
// my-tasks load all rows for progress counts anyway).
//
// Roles / rules come from docs/DECISIONS.md: deadline states are computed
// with getDeadlineState() (lib/date/deadline.ts) — never re-implemented here.

import { getDeadlineState } from "@/lib/date/deadline";
import type { Priority, Task, TaskStatus, WorkspaceRole } from "@/types";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "in_review", "completed"];
export const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];
export type TaskSort = "due_date" | "priority" | "updated";
export const TASK_SORTS: TaskSort[] = ["due_date", "priority", "updated"];

export const PAGE_SIZE = 20;

export interface TaskFilterState {
  /** "all" or a task status. */
  status: TaskStatus | "all";
  /** "all" or a priority. */
  priority: Priority | "all";
  /** "all" or a workspace member's user id. */
  assignee: string | "all";
  /** "all" or a project id. */
  project: string | "all";
  /** Due-date range, inclusive, "YYYY-MM-DD". Null means no bound. */
  dueFrom: string | null;
  dueTo: string | null;
  /** Only tasks whose deadline state is "overdue" (red). */
  overdueOnly: boolean;
  sort: TaskSort;
  page: number;
  /**
   * "My tasks only". Null means "not set in the URL" — the caller resolves
   * it with resolveMine(), which defaults it ON for developers.
   */
  mine: boolean | null;
}

export const DEFAULT_FILTERS: TaskFilterState = {
  status: "all",
  priority: "all",
  assignee: "all",
  project: "all",
  dueFrom: null,
  dueTo: null,
  overdueOnly: false,
  sort: "due_date",
  page: 1,
  mine: null,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts Next.js searchParams (values may be string | string[]). */
export type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function validDate(value: string | undefined): string | null {
  if (!value || !DATE_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : value;
}

function validPage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** Parse + validate the query string into a filter state. Invalid values fall back to defaults. */
export function parseTaskFilters(params: RawSearchParams): TaskFilterState {
  const statusRaw = first(params.status);
  const priorityRaw = first(params.priority);
  const mineRaw = first(params.mine);
  return {
    status: (statusRaw && (TASK_STATUSES as string[]).includes(statusRaw) ? statusRaw : "all") as TaskStatus | "all",
    priority: (priorityRaw && (PRIORITIES as string[]).includes(priorityRaw) ? priorityRaw : "all") as Priority | "all",
    assignee: first(params.assignee) || "all",
    project: first(params.project) || "all",
    dueFrom: validDate(first(params.due_from)),
    dueTo: validDate(first(params.due_to)),
    overdueOnly: first(params.overdue) === "1" || first(params.overdue) === "true",
    sort: (TASK_SORTS as string[]).includes(first(params.sort) ?? "") ? (first(params.sort) as TaskSort) : "due_date",
    page: validPage(first(params.page)),
    mine: mineRaw === "1" || mineRaw === "true" ? true : mineRaw === "0" || mineRaw === "false" ? false : null,
  };
}

/** "My tasks only" resolved: explicit URL value wins, otherwise ON for developers, OFF for managers. */
export function resolveMine(filters: Pick<TaskFilterState, "mine">, role: WorkspaceRole | null | undefined): boolean {
  if (filters.mine !== null) return filters.mine;
  return role === "developer";
}

/** Serialize a filter state to a URLSearchParams (defaults omitted, so shared links stay short). */
export function serializeTaskFilters(
  filters: TaskFilterState,
  overrides: Partial<TaskFilterState> = {},
): URLSearchParams {
  const f = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (f.status !== "all") params.set("status", f.status);
  if (f.priority !== "all") params.set("priority", f.priority);
  if (f.assignee !== "all") params.set("assignee", f.assignee);
  if (f.project !== "all") params.set("project", f.project);
  if (f.dueFrom) params.set("due_from", f.dueFrom);
  if (f.dueTo) params.set("due_to", f.dueTo);
  if (f.overdueOnly) params.set("overdue", "1");
  if (f.sort !== "due_date") params.set("sort", f.sort);
  if (f.page > 1) params.set("page", String(f.page));
  if (f.mine !== null) params.set("mine", f.mine ? "1" : "0");
  return params;
}

/** Build a href for `basePath` with the given filters (plus overrides). */
export function filterHref(basePath: string, filters: TaskFilterState, overrides: Partial<TaskFilterState> = {}): string {
  const qs = serializeTaskFilters(filters, overrides).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Apply the status / priority / assignee / due-range / overdue filters to loaded rows. */
export function filterTasks(
  tasks: Task[],
  filters: Pick<TaskFilterState, "status" | "priority" | "assignee" | "project" | "dueFrom" | "dueTo" | "overdueOnly">,
  workspaceTimezone: string,
  now: Date = new Date(),
): Task[] {
  return tasks.filter((task) => {
    if (filters.status !== "all" && task.status !== filters.status) return false;
    if (filters.priority !== "all" && task.priority !== filters.priority) return false;
    if (filters.assignee !== "all" && task.assigned_to !== filters.assignee) return false;
    if (filters.project !== "all" && task.project_id !== filters.project) return false;
    if (filters.dueFrom && (!task.due_date || task.due_date < filters.dueFrom)) return false;
    if (filters.dueTo && (!task.due_date || task.due_date > filters.dueTo)) return false;
    if (filters.overdueOnly) {
      // "Overdue" is the red deadline state from the single source of truth.
      if (getDeadlineState(task, workspaceTimezone, now).state !== "red") return false;
    }
    return true;
  });
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function dueDateRank(task: Task): string {
  // Null due dates sort last.
  return task.due_date ?? "9999-12-31";
}

/** Sort a task list. Ties fall back to position, then creation order. */
export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const rows = [...tasks];
  switch (sort) {
    case "priority":
      return rows.sort(
        (a, b) =>
          PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
          dueDateRank(a).localeCompare(dueDateRank(b)) ||
          a.position - b.position,
      );
    case "updated":
      return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.position - b.position);
    case "due_date":
    default:
      return rows.sort(
        (a, b) =>
          dueDateRank(a).localeCompare(dueDateRank(b)) || a.position - b.position || a.created_at.localeCompare(b.created_at),
      );
  }
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/** Slice a filtered + sorted list into a page. Page is clamped into range. */
export function paginate<T>(rows: T[], page: number, pageSize: number = PAGE_SIZE): PageResult<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
  };
}
