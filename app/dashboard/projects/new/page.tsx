import { notFound } from "next/navigation";
import { getDashboardContext } from "@/lib/actions/workspace";
import { canManageProjects } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProjectForm } from "@/components/projects/project-form";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

export default async function NewProjectPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;
  if (!canManageProjects(ctx.role)) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("projects.newProject")}</h1>
        <p className="mt-1 text-sm text-muted">{t("projects.newSubtitle", { workspace: ctx.workspace.name })}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("projects.detailsTitle")}</CardTitle>
          <CardDescription>{t("projects.dateRule")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectForm workspaceId={ctx.workspace.id} />
        </CardContent>
      </Card>
    </div>
  );
}
