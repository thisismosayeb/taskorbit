import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { isManager } from "@/lib/permissions";
import { paginate, PAGE_SIZE } from "@/lib/filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ProjectCard } from "@/components/projects/project-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Pagination } from "@/components/tasks/pagination";
import type { Project, ProjectStatus, Task } from "@/types";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

// Module scope has no request locale (the bound `t` lives inside the
// page function), so status options are built by this getter instead.
function getStatusOptions(tr: (key: string) => string): { value: string; label: string }[] {
  return [
    { value: "all", label: tr("projects.allStatuses") },
    { value: "planning", label: tr("projects.statusPlanning") },
    { value: "active", label: tr("projects.statusActive") },
    { value: "on_hold", label: tr("projects.statusOnHold") },
    { value: "completed", label: tr("projects.statusCompleted") },
    { value: "archived", label: tr("projects.statusArchived") },
  ];
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const statusOptions = getStatusOptions(t);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const { workspace, role } = ctx;
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim();
  const statusFilter = (params.status ?? "all") as string;
  const page = Math.max(1, Number(params.page) || 1);

  const supabase = await createClient();
  let query = supabase.from("projects").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false });
  if (q) query = query.ilike("name", `%${q}%`);
  if (statusFilter !== "all") query = query.eq("status", statusFilter as ProjectStatus);
  const { data: projectRows } = await query;
  const allProjects = (projectRows ?? []) as Project[];
  const paged = paginate(allProjects, page);
  const projects = paged.items;

  const queryParams = new URLSearchParams();
  if (q) queryParams.set("q", q);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);

  const projectIds = projects.map((p) => p.id);
  const { data: taskRows } =
    projectIds.length > 0
      ? await supabase.from("tasks").select("*").in("project_id", projectIds)
      : { data: [] as Task[] };
  const tasks = (taskRows ?? []) as Task[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("projects.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("projects.subtitle", { workspace: workspace.name })}</p>
        </div>
        {isManager(role) ? (
          <Link href="/dashboard/projects/new">
            <Button>{t("projects.newProject")}</Button>
          </Link>
        ) : null}
      </div>

      <form method="get" className="flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("projects.searchPlaceholder")}
          aria-label={t("projects.searchAria")}
          className="min-w-[200px] max-w-sm flex-1"
        />
        <Select name="status" defaultValue={statusFilter} aria-label={t("projects.statusFilterAria")} className="w-auto">
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          {t("projects.searchButton")}
        </Button>
        {q || statusFilter !== "all" ? (
          <Link href="/dashboard/projects">
            <Button type="button" variant="ghost">
              {t("common.clear")}
            </Button>
          </Link>
        ) : null}
      </form>

      {projects.length === 0 ? (
        <EmptyState
          title={q || statusFilter !== "all" ? t("projects.noMatchTitle") : t("dashboard.noProjects")}
          description={
            q || statusFilter !== "all"
              ? t("projects.noMatchBody")
              : isManager(role)
                ? t("projects.noProjectsManagerBody")
                : t("projects.noProjectsDevBody")
          }
          action={
            isManager(role) && !q && statusFilter === "all" ? (
              <Link href="/dashboard/projects/new">
                <Button>{t("common.createProject")}</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} tasks={tasks.filter((t) => t.project_id === project.id)} />
            ))}
          </div>
          <Pagination
            basePath="/dashboard/projects"
            query={queryParams.toString()}
            page={paged.page}
            totalPages={paged.totalPages}
            total={paged.total}
            pageSize={PAGE_SIZE}
            itemLabel={t("projects.itemsLabel")}
          />
        </>
      )}
    </div>
  );
}
