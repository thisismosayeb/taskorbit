"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { ProjectForm } from "@/components/projects/project-form";
import { deleteProject } from "@/lib/actions/projects";
import { useToast } from "@/components/ui/toast";
import type { Project } from "@/types";
import { t, useLocale} from "@/lib/i18n";

/** Manager-only edit / delete controls for a project. */
export function ProjectActions({ project }: { project: Project }) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> {t("projects.editProject")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="text-red-600 hover:text-red-700">
          <Trash2 className="h-4 w-4" /> {t("projects.deleteProject")}
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen} title={t("projects.editProject")} description={t("projects.editProjectBody", { name: project.name })}>
        <ProjectForm workspaceId={project.workspace_id} project={project} onDone={() => setEditOpen(false)} />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("projects.deleteConfirmTitle")}
        description={t("projects.deleteProjectBody", { name: project.name })}
        confirmLabel={t("projects.deleteProject")}
        onConfirm={async () => {
          const result = await deleteProject(project.id);
          if (result.error) return result;
          toast(t("projects.deleted"));
          router.push("/dashboard/projects");
        }}
      />
    </>
  );
}
