"use client";

import * as React from "react";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { taskSchema, taskSchemaFor, type TaskInput } from "@/lib/validators";
import { createTask, updateTask } from "@/lib/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { Priority, Task, TaskStatus } from "@/types";
import { t, useLocale} from "@/lib/i18n";

export interface MemberOption {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

const priorityOptions: { value: Priority; label: string }[] = [
  { value: "low", label: t("projects.priorityLow") },
  { value: "medium", label: t("projects.priorityMedium") },
  { value: "high", label: t("projects.priorityHigh") },
  { value: "urgent", label: t("projects.priorityUrgent") },
];

const statusOptions: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: t("tasks.statusTodo") },
  { value: "in_progress", label: t("tasks.statusInProgress") },
  { value: "in_review", label: t("tasks.statusInReview") },
  { value: "completed", label: t("tasks.statusCompleted") },
];

export function TaskForm({
  projectId,
  members,
  task,
  onDone,
}: {
  projectId: string;
  members: MemberOption[];
  task?: Task;
  onDone?: () => void;
}) {
  const locale = useLocale();
  const schema = useMemo(() => taskSchemaFor(locale), [locale]);
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<TaskInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task?.title ?? "",
      description: task?.description ?? "",
      priority: task?.priority ?? "medium",
      status: task?.status ?? "todo",
      start_date: task?.start_date ?? null,
      due_date: task?.due_date ?? null,
      assigned_to: task?.assigned_to ?? null,
    },
  });
  // Pending state owned here, not by react-hook-form's isSubmitting — same
  // stuck-"Saving…" bug class as the project form (see project-form.tsx).
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(values: TaskInput) {
    setSaving(true);
    try {
      const result = task
        ? await updateTask(task.id, values)
        : await createTask(projectId, values);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(task ? t("tasks.updated") : t("tasks.created"));
      if (onDone) onDone();
      router.refresh();
    } catch {
      toast(t("errors.generic"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="task-title">{t("tasks.taskTitle")}</Label>
        <Input id="task-title" placeholder={t("tasks.titlePlaceholderLong")} {...register("title")} />
        {errors.title ? <p className="text-xs text-red-600">{errors.title.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-description">{t("tasks.description")}</Label>
        <Textarea id="task-description" placeholder={t("tasks.descriptionPlaceholderLong")} {...register("description")} />
        {errors.description ? <p className="text-xs text-red-600">{errors.description.message}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-assignee">{t("tasks.assignToLabel")}</Label>
        <Select
          id="task-assignee"
          defaultValue={task?.assigned_to ?? ""}
          onChange={(e) => setValue("assigned_to", e.target.value || null, { shouldValidate: true })}
        >
          <option value="">{t("tasks.unassigned")}</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.full_name || m.email || t("common.memberFallback")}
            </option>
          ))}
        </Select>
        {errors.assigned_to ? <p className="text-xs text-red-600">{errors.assigned_to.message}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="task-priority">{t("tasks.priority")}</Label>
          <Select id="task-priority" {...register("priority")}>
            {priorityOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-status">{t("tasks.status")}</Label>
          <Select id="task-status" {...register("status")}>
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="task-start">{t("tasks.startDate")}</Label>
          <Input
            id="task-start"
            type="date"
            defaultValue={task?.start_date ?? ""}
            onChange={(e) => setValue("start_date", e.target.value || null, { shouldValidate: true })}
          />
          {errors.start_date ? <p className="text-xs text-red-600">{errors.start_date.message}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="task-due">{t("tasks.dueDate")}</Label>
          <Input
            id="task-due"
            type="date"
            defaultValue={task?.due_date ?? ""}
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
          {saving ? t("common.saving") : task ? t("settings.saveChanges") : t("tasks.createTask")}
        </Button>
      </div>
    </form>
  );
}

/** Manager-only button that opens the create-task dialog. */
export function AddTaskButton({ projectId, members }: { projectId: string; members: MemberOption[] }) {
  useLocale();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> {t("tasks.newTaskButton")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("tasks.newTaskTitle")} description={t("tasks.newTaskBody")}>
        <TaskForm projectId={projectId} members={members} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
