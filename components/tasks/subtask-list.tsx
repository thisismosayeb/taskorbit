"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { LiquidProgress } from "@/components/motion/liquid-progress";
import { DeadlineChip } from "@/components/dashboard/deadline-chip";
import { taskProgress } from "@/lib/progress";
import { createSubtask, deleteSubtask, toggleSubtaskStatus, updateSubtask } from "@/lib/actions/tasks";
import { useToast } from "@/components/ui/toast";
import type { Task } from "@/types";
import { t, useLocale} from "@/lib/i18n";

export function SubtaskList({
  parentTask,
  subtasks,
  timezone,
  canCreate,
  canManage,
}: {
  parentTask: Task;
  subtasks: Task[];
  timezone: string;
  canCreate: boolean;
  canManage: boolean;
}) {
  useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [newTitle, setNewTitle] = React.useState("");
  const [newDueDate, setNewDueDate] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState("");
  const [editDueDate, setEditDueDate] = React.useState("");
  const [savingEdit, setSavingEdit] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<Task | null>(null);

  const progress = taskProgress(subtasks);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      toast(t("tasks.enterSubtaskTitle"), "error");
      return;
    }
    setAdding(true);
    try {
      const result = await createSubtask(parentTask.id, {
        title,
        description: null,
        priority: "medium",
        status: "todo",
        start_date: null,
        due_date: newDueDate || null,
      });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setNewTitle("");
      setNewDueDate("");
      toast(t("tasks.subtaskAdded"));
      router.refresh();
    } catch {
      // A rejected request (e.g. dropped connection) must not leave the
      // button stuck on "Adding…" — same bug class as the project form.
      toast(t("errors.generic"), "error");
    } finally {
      setAdding(false);
    }
  }

  async function handleToggle(subtask: Task) {
    setTogglingId(subtask.id);
    try {
      const result = await toggleSubtaskStatus(subtask.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      router.refresh();
    } catch {
      toast(t("errors.generic"), "error");
    } finally {
      setTogglingId(null);
    }
  }

  function startEdit(subtask: Task) {
    setEditingId(subtask.id);
    setEditTitle(subtask.title);
    setEditDueDate(subtask.due_date ?? "");
  }

  async function handleSaveEdit(subtask: Task) {
    const title = editTitle.trim();
    if (!title) {
      toast(t("tasks.enterSubtaskTitle"), "error");
      return;
    }
    setSavingEdit(true);
    try {
      const result = await updateSubtask(subtask.id, { title, due_date: editDueDate || null });
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      setEditingId(null);
      toast(t("subtasks.updated"));
      router.refresh();
    } catch {
      toast(t("errors.generic"), "error");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-muted">
            {progress.total === 0
              ? t("tasks.noSubtasks")
              : t("subtasks.progress", { done: progress.completed, total: progress.total })}
          </span>
          <span className="font-medium text-ink">{progress.label}</span>
        </div>
        <LiquidProgress percent={progress.percent} variant="bar" accent="developer" showLabel={false} />
      </div>

      {subtasks.length === 0 ? (
        <p className="text-sm text-muted">{t("subtasks.noSubtasksHint")}</p>
      ) : (
        <ul className="divide-y divide-ink/5">
          {subtasks.map((subtask) => {
            const done = subtask.status === "completed";
            return (
              <li key={subtask.id} className="flex flex-wrap items-center gap-2 py-2.5">
                <input
                  type="checkbox"
                  aria-label={done ? t("tasks.markNotDone", { title: subtask.title }) : t("tasks.markDone", { title: subtask.title })}
                  checked={done}
                  disabled={!canManage || togglingId === subtask.id}
                  onChange={() => void handleToggle(subtask)}
                  className="h-4 w-4 shrink-0 accent-[#2DD4BF]"
                />
                {editingId === subtask.id ? (
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Input
                      aria-label={t("tasks.subtaskTitleAria")}
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="h-8 min-w-[160px] flex-1"
                    />
                    <Input
                      aria-label={t("tasks.subtaskDueAria")}
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      className="h-8 w-auto"
                    />
                    <Button size="sm" disabled={savingEdit} onClick={() => void handleSaveEdit(subtask)}>
                      {savingEdit ? t("common.saving") : t("common.save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      {t("common.cancel")}
                    </Button>
                  </span>
                ) : (
                  <>
                    <Link
                      href={`/dashboard/tasks/${subtask.id}`}
                      className={`min-w-0 flex-1 text-sm hover:text-primary hover:underline ${done ? "text-muted line-through" : "text-ink"}`}
                    >
                      {subtask.title}
                    </Link>
                    <DeadlineChip task={subtask} timezone={timezone} />
                    {canManage ? (
                      <span className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" aria-label={t("tasks.editSubtaskAria", { title: subtask.title })} onClick={() => startEdit(subtask)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={t("tasks.deleteSubtaskAria", { title: subtask.title })}
                          onClick={() => setDeleting(subtask)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </span>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {canCreate ? (
        <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
          <Input
            aria-label={t("tasks.newSubtaskTitleAria")}
            placeholder={t("tasks.addSubtaskPlaceholder")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="min-w-[180px] flex-1"
          />
          <Input
            aria-label={t("tasks.newSubtaskDueAria")}
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            className="w-auto"
          />
          <Button type="submit" size="sm" variant="mint" disabled={adding}>
            <Plus className="h-4 w-4" /> {adding ? t("tasks.adding") : t("tasks.addButton")}
          </Button>
        </form>
      ) : (
        <p className="border-t border-ink/10 pt-4 text-sm text-muted">
          {t("tasks.cannotAddHint")}
        </p>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("subtasks.deleteConfirmTitle")}
        description={deleting ? t("tasks.deleteSubtaskBody", { title: deleting.title }) : ""}
        confirmLabel={t("subtasks.deleteSubtask")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            const result = await deleteSubtask(deleting.id);
            if (result.error) return result;
          } catch {
            // Return an error object instead of throwing, so the dialog's
            // own pending state resets instead of sticking on "Deleting…".
            return { error: t("errors.generic") };
          }
          setDeleting(null);
          toast(t("subtasks.deleted"));
          router.refresh();
        }}
      />
    </div>
  );
}
