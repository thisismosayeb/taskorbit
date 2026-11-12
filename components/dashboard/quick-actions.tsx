// Quick actions (Part 2, Section 8) — the three things a manager does
// most from the dashboard. "New task" opens the most recent project,
// where the task form lives (AddTaskButton on the project detail page);
// with no projects yet it goes to the projects list instead.

import Link from "next/link";
import { FolderPlus, ListPlus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export async function QuickActions({ latestProjectId }: { latestProjectId: string | null }) {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t("quickActions.aria")}>
      <Link href="/dashboard/projects/new">
        <Button>
          <FolderPlus className="mr-2 h-4 w-4" />
          {t("quickActions.newProject")}
        </Button>
      </Link>
      <Link href={latestProjectId ? `/dashboard/projects/${latestProjectId}` : "/dashboard/projects"}>
        <Button variant="outline">
          <ListPlus className="mr-2 h-4 w-4" />
          {t("quickActions.newTask")}
        </Button>
      </Link>
      <Link href="/dashboard/team">
        <Button variant="outline">
          <UserPlus className="mr-2 h-4 w-4" />
          {t("quickActions.inviteDeveloper")}
        </Button>
      </Link>
    </div>
  );
}
