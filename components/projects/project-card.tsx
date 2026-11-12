import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiquidProgress } from "@/components/motion/liquid-progress";
import { projectProgress } from "@/lib/progress";
import type { Project, ProjectStatus, Priority, Task } from "@/types";
import { createTranslator, getServerLocale, type SupportedLocale } from "@/lib/i18n/server";
import { formatDateShortLocale } from "@/lib/i18n/format";

// Module scope has no request locale (the bound `t` lives inside the
// component), so status labels are built by this getter instead.
function getStatusLabels(tr: (key: string) => string): Record<ProjectStatus, string> {
  return {
    planning: tr("projects.statusPlanning"),
    active: tr("projects.statusActive"),
    on_hold: tr("projects.statusOnHold"),
    completed: tr("projects.statusCompleted"),
    archived: tr("projects.statusArchived"),
  };
}

const statusVariants: Record<ProjectStatus, "primary" | "mint" | "amber" | "green" | "neutral"> = {
  planning: "primary",
  active: "mint",
  on_hold: "amber",
  completed: "green",
  archived: "neutral",
};

const priorityVariants: Record<Priority, "neutral" | "cyan" | "amber" | "red"> = {
  low: "neutral",
  medium: "cyan",
  high: "amber",
  urgent: "red",
};

function formatDate(value: string | null, locale: SupportedLocale): string {
  if (!value) return "—";
  return formatDateShortLocale(new Date(`${value}T00:00:00`), locale);
}

export async function ProjectCard({ project, tasks }: { project: Project; tasks: Task[] }) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const statusLabels = getStatusLabels(t);
  const progress = projectProgress(tasks);
  return (
    <Link href={`/dashboard/projects/${project.id}`} className="block">
      <Card className="hover-lift transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2">{project.name}</CardTitle>
            <Badge variant={statusVariants[project.status]}>{statusLabels[project.status]}</Badge>
          </div>
          {project.description ? <p className="line-clamp-2 text-sm text-muted">{project.description}</p> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge variant={priorityVariants[project.priority]}>{t("projects.priorityLabel", { priority: project.priority })}</Badge>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(project.start_date, locale)} → {formatDate(project.due_date, locale)}
            </span>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted">
                {progress.total === 0
                  ? t("projects.noTasksYet")
                  : t("projects.ofTasksDone", { completed: progress.completed, total: progress.total })}
              </span>
              <span className="font-medium text-ink">{progress.label}</span>
            </div>
            <LiquidProgress percent={progress.percent} variant="bar" accent="manager" label={t("projects.ofTasksDone", { completed: progress.completed, total: progress.total })} showLabel={false} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
