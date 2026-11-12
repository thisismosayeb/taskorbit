// Kanban card (Part 2, §1).
//
// A card shows: title, project name, assignee initials (Avatar), priority
// badge, deadline chip (text + colour from getDeadlineState via
// DeadlineChip), and subtask progress "2/3".
//
// Dragging: the grip handle is the drag handle (the whole card is the
// drop target, but the handle keeps touch scrolling working on mobile).
// Cards the user may not move show a lock icon instead of a grip and
// cannot be dragged. Clicking a card (not on a button/link) opens the
// task. The "Move to…" menu is the keyboard alternative to dragging:
// it moves the card to any other column without a pointer.

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DeadlineChip } from "@/components/dashboard/deadline-chip";
import { statusLabels } from "@/components/tasks/status-select";
import type { Priority, TaskStatus } from "@/types";
import { t, useLocale} from "@/lib/i18n";

const priorityVariants: Record<Priority, "neutral" | "cyan" | "amber" | "red"> = {
  low: "neutral",
  medium: "cyan",
  high: "amber",
  urgent: "red",
};

const allStatuses: TaskStatus[] = ["todo", "in_progress", "in_review", "completed"];

export interface BoardTaskView {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  completed_at: string | null;
  projectId: string;
  projectName: string;
  assignedTo: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  completedSubtasks: number;
  totalSubtasks: number;
  /** False for cards the user may not move (lock icon, not draggable). */
  canDrag: boolean;
  dragReason: string | null;
}

function CardBody({ task, timezone }: { task: BoardTaskView; timezone: string }) {
  useLocale();
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{task.projectName}</p>
      <Link
        href={`/dashboard/tasks/${task.id}`}
        className="mt-0.5 block break-words font-medium text-ink hover:text-primary hover:underline"
      >
        {task.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant={priorityVariants[task.priority]}>{t("board.priorityLabel", { priority: task.priority })}</Badge>
        <DeadlineChip task={task} timezone={timezone} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-muted">
          {task.assignedTo ? (
            <>
              <Avatar name={task.assigneeName} email={task.assigneeEmail} size="sm" />
              <span className="max-w-[110px] truncate">{task.assigneeName || task.assigneeEmail || t("common.memberFallback")}</span>
            </>
          ) : (
            t("tasks.unassigned")
          )}
        </span>
        {task.totalSubtasks > 0 ? (
          <span className="text-xs text-muted" title={t("board.subtasksDoneTitle", { done: task.completedSubtasks, total: task.totalSubtasks })}>
            {t("board.subtasksFraction", { done: task.completedSubtasks, total: task.totalSubtasks })}
          </span>
        ) : (
          <span className="text-xs text-muted">{t("board.noSubtasks")}</span>
        )}
      </div>
    </div>
  );
}

function MoveToMenu({ task, onMove }: { task: BoardTaskView; onMove: (taskId: string, status: TaskStatus) => void }) {
  useLocale();
  const [open, setOpen] = React.useState(false);
  const others = allStatuses.filter((s) => s !== task.status);
  return (
    <div className="relative mt-2">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-md border border-ink/15 bg-surface px-2 py-1 text-xs font-medium text-ink hover:bg-background"
      >
        {t("board.moveTo")}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-label={t("board.closeMoveMenu")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
          <div role="menu" aria-label={t("board.moveToAria", { title: task.title })} className="absolute left-0 z-20 mt-1 w-44 rounded-lg border border-ink/10 bg-surface py-1 shadow-lg">
            {others.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onMove(task.id, s);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-background"
              >
                {statusLabels[s]}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function BoardCard({
  task,
  timezone,
  onMove,
}: {
  task: BoardTaskView;
  timezone: string;
  onMove: (taskId: string, status: TaskStatus) => void;
}) {
  useLocale();
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !task.canDrag,
    data: { type: "task", status: task.status },
  });

  // Clicking the card opens the task — except clicks on links, buttons
  // (drag handle, Move to… menu) or the menu itself.
  function handleCardClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("a, button, input, select, [role='menu']")) return;
    router.push(`/dashboard/tasks/${task.id}`);
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      onClick={handleCardClick}
      className={`flex cursor-pointer gap-1.5 rounded-xl border border-ink/10 bg-surface p-3 shadow-sm hover:border-primary/40 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {task.canDrag ? (
        <button
          type="button"
          aria-label={t("board.dragAria", { title: task.title })}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-muted hover:bg-background hover:text-ink active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : (
        <span
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted"
          title={task.dragReason ?? t("board.cannotMove")}
          aria-label={task.dragReason ?? t("board.cannotMove")}
        >
          <Lock className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <CardBody task={task} timezone={timezone} />
        {task.canDrag ? <MoveToMenu task={task} onMove={onMove} /> : null}
      </div>
    </div>
  );
}

/** Static clone used for the DragOverlay (no sortable hooks). */
export function BoardCardOverlay({ task, timezone }: { task: BoardTaskView; timezone: string }) {
  return (
    <div className="flex gap-1.5 rounded-xl border border-primary/50 bg-surface p-3 shadow-xl">
      <span className="mt-0.5 shrink-0 rounded p-0.5 text-muted">
        <GripVertical className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <CardBody task={task} timezone={timezone} />
      </div>
    </div>
  );
}
