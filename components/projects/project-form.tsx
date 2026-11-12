"use client";

import * as React from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { projectSchema, projectSchemaFor, type ProjectInput } from "@/lib/validators";
import { createProject, updateProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { Project, ProjectStatus, Priority } from "@/types";
import { t, useLocale} from "@/lib/i18n";

const statusOptions: { value: ProjectStatus; label: string }[] = [
  { value: "planning", label: t("projects.statusPlanning") },
  { value: "active", label: t("projects.statusActive") },
  { value: "on_hold", label: t("projects.statusOnHold") },
  { value: "completed", label: t("projects.statusCompleted") },
  { value: "archived", label: t("projects.statusArchived") },
];

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "low", label: t("projects.priorityLow") },
  { value: "medium", label: t("projects.priorityMedium") },
  { value: "high", label: t("projects.priorityHigh") },
  { value: "urgent", label: t("projects.priorityUrgent") },
];

export function ProjectForm({
  workspaceId,
  project,
  onDone,
}: {
  workspaceId: string;
  project?: Project;
  onDone?: () => void;
}) {
  const locale = useLocale();
  const schema = useMemo(() => projectSchemaFor(locale), [locale]);
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ProjectInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name ?? "",
      description: project?.description ?? "",
      status: project?.status ?? "planning",
      priority: project?.priority ?? "medium",
      start_date: project?.start_date ?? null,
      due_date: project?.due_date ?? null,
    },
  });
  // Pending state is owned here, not by react-hook-form's isSubmitting:
  // the button must reset whenever the server action settles — success,
  // returned error, or a rejected (dropped) request. In the Part 1 E2E run
  // the button sat on "Saving…" while the request went through the flaky
  // tunnel and the form then remounted (fields cleared, no message) even
  // though the project had been created (friction (b)). The old code had
  // no try/catch, so a rejected action promise escaped onSubmit unhandled
  // with no feedback at all; with local state in a finally, the button
  // always resets and a dropped request shows an error toast instead.
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(values: ProjectInput) {
    setSaving(true);
    try {
      const result = project
        ? await updateProject(project.id, values)
        : await createProject(workspaceId, values);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(project ? t("projects.updated") : t("projects.created"));
      if (onDone) onDone();
      if (!project && "projectId" in result && result.projectId) {
        router.push(`/dashboard/projects/${result.projectId}`);
      } else {
        router.refresh();
      }
    } catch {
      toast(t("errors.generic"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="project-name">{t("projects.projectName")}</Label>
        <Input id="project-name" placeholder={t("projects.namePlaceholder")} {...register("name")} />
        {errors.name ? <p className="text-xs text-red-600">{errors.name.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="project-description">{t("projects.description")}</Label>
        <Textarea id="project-description" placeholder={t("projects.descriptionPlaceholder")} {...register("description")} />
        {errors.description ? <p className="text-xs text-red-600">{errors.description.message}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="project-status">{t("projects.status")}</Label>
          <Select id="project-status" {...register("status")}>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-priority">{t("projects.priority")}</Label>
          <Select id="project-priority" {...register("priority")}>
            {priorityOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="project-start">{t("projects.startDate")}</Label>
          <Input
            id="project-start"
            type="date"
            defaultValue={project?.start_date ?? ""}
            onChange={(e) => setValue("start_date", e.target.value || null, { shouldValidate: true })}
          />
          {errors.start_date ? <p className="text-xs text-red-600">{errors.start_date.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-due">{t("projects.dueDate")}</Label>
          <Input
            id="project-due"
            type="date"
            defaultValue={project?.due_date ?? ""}
            onChange={(e) => setValue("due_date", e.target.value || null, { shouldValidate: true })}
          />
          {errors.due_date ? <p className="text-xs text-red-600">{errors.due_date.message}</p> : null}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onDone ? (
          <Button type="button" variant="outline" onClick={onDone} disabled={saving}>
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button type="submit" disabled={saving}>
          {saving ? t("common.saving") : project ? t("settings.saveChanges") : t("common.createProject")}
        </Button>
      </div>
    </form>
  );
}
