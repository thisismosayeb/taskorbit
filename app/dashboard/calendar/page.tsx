import { createClient } from "@/lib/supabase/server";
import { getDashboardContext } from "@/lib/actions/workspace";
import { getCalendarData } from "@/lib/actions/calendar";
import { parseTaskFilters, resolveMine, type RawSearchParams } from "@/lib/filters";
import { todayInTimezone } from "@/lib/calendar";
import { CalendarView, type CalendarViewMode } from "@/components/calendar/calendar-view";
import type { Profile, Project } from "@/types";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<RawSearchParams>;
}) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  const params = (await searchParams) ?? {};

  const viewRaw = Array.isArray(params.view) ? params.view[0] : params.view;
  const viewFromUrl = viewRaw === "month" || viewRaw === "week" || viewRaw === "list";
  const view: CalendarViewMode = viewFromUrl ? (viewRaw as CalendarViewMode) : "month";

  const today = todayInTimezone(ctx.workspace.timezone);
  const dateRaw = Array.isArray(params.date) ? params.date[0] : params.date;
  const date = dateRaw && DATE_RE.test(dateRaw) ? dateRaw : today;

  const filters = parseTaskFilters(params);
  const mine = resolveMine(filters, ctx.role);
  const data = await getCalendarData(params);

  const supabase = await createClient();
  const { data: projectRows } = await supabase
    .from("projects")
    .select("id, name")
    .eq("workspace_id", ctx.workspace.id)
    .order("name");
  const projects = (projectRows ?? []) as Pick<Project, "id" | "name">[];

  const { data: memberRows } = await supabase.from("workspace_members").select("user_id").eq("workspace_id", ctx.workspace.id);
  const memberIds = ((memberRows ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const { data: profileRows } =
    memberIds.length > 0 ? await supabase.from("profiles").select("*").in("id", memberIds) : { data: [] as Profile[] };
  const profiles = new Map(((profileRows ?? []) as Profile[]).map((p) => [p.id, p]));
  const memberOptions = memberIds.map((id) => ({
    user_id: id,
    full_name: profiles.get(id)?.full_name ?? null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("calendar.title")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("calendar.intro", { workspace: ctx.workspace.name, timezone: ctx.workspace.timezone })}
        </p>
      </div>

      {data.error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {data.error}
        </p>
      ) : null}

      <CalendarView
        events={data.events}
        completedPerWeek={data.completedPerWeek}
        timezone={data.timezone}
        today={today}
        view={view}
        viewFromUrl={viewFromUrl}
        date={date}
        filters={filters}
        mineResolved={mine}
        projects={projects}
        members={memberOptions}
      />
    </div>
  );
}
