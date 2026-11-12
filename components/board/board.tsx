// Kanban board (Part 2, §1).
//
// Four columns (To do / In progress / In review / Completed) with a task
// count in each header. Top-level tasks only. Drag and drop with dnd-kit:
// - cross-column drag moves the card and updates the task's status in the
//   database (lib/actions/board.ts → moveTask). The card lands at the END
//   of the target column — that is also where the server puts it
//   (manager: position = max + 1; developer: position untouched, because
//   the DB trigger rejects position changes by developers).
// - same-column drag reorders within the column and persists positions
//   (reorderTasks). Only the manager can reorder: the database trigger
//   `enforce_developer_task_update` rejects position changes by
//   developers, so a developer's reorder is reverted with an explanation
//   instead of a round-trip that is guaranteed to fail.
// - every move is optimistic: the card moves immediately, and if the
//   server rejects it (e.g. parent has open subtasks → the trigger's
//   message) the card returns to its column and the message is shown.
// - keyboard: dnd-kit keyboard sensors are enabled (arrow keys move a
//   focused card within its column, Space/Enter drops), and every card
//   has a "Move to…" menu for cross-column moves without a pointer.
// - mobile: columns scroll horizontally; cards stay readable at 360px.

"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { BoardCard, BoardCardOverlay, type BoardTaskView } from "@/components/board/board-card";
import { BoardRealtime } from "@/components/board/board-realtime";
import { statusLabels } from "@/components/tasks/status-select";
import { moveTask, reorderTasks } from "@/lib/actions/board";
import { canDragTask, canReorderTasks } from "@/lib/board-permissions";
import type { TaskStatus, WorkspaceRole } from "@/types";
import { t, useLocale} from "@/lib/i18n";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "in_review", "completed"];

type Columns = Record<TaskStatus, BoardTaskView[]>;

function groupTasks(tasks: BoardTaskView[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], in_review: [], completed: [] };
  for (const task of tasks) cols[task.status].push(task);
  return cols;
}

function BoardColumn({
  status,
  tasks,
  timezone,
  onMove,
}: {
  status: TaskStatus;
  tasks: BoardTaskView[];
  timezone: string;
  onMove: (taskId: string, status: TaskStatus) => void;
}) {
  useLocale();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      aria-label={t("board.columnAria", { status: statusLabels[status] })}
      className="flex w-[280px] min-w-[280px] shrink-0 flex-col rounded-2xl bg-ink/5 p-3 sm:w-[300px] sm:min-w-[300px]"
    >
      <header className="flex items-center justify-between px-1 pb-3">
        <h2 className="font-heading text-sm font-semibold text-ink">{statusLabels[status]}</h2>
        <Badge variant="neutral" aria-label={t("board.columnTasksAria", { count: tasks.length, status: statusLabels[status] })}>
          {tasks.length}
        </Badge>
      </header>
      <div
        ref={setNodeRef}
        className={`flex min-h-[140px] flex-1 flex-col gap-2 rounded-xl p-1 transition-colors ${
          isOver ? "bg-primary/10 ring-2 ring-primary/40" : ""
        }`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <BoardCard key={task.id} task={task} timezone={timezone} onMove={onMove} />
          ))}
        </SortableContext>
        {tasks.length === 0 ? <p className="px-2 py-8 text-center text-sm text-muted">{t("board.noTasks")}</p> : null}
      </div>
    </section>
  );
}

export function Board({
  initialTasks,
  projectIds,
  timezone,
  role,
  userId,
}: {
  initialTasks: BoardTaskView[];
  projectIds: string[];
  timezone: string;
  role: WorkspaceRole;
  userId: string;
}) {
  useLocale();
  const { toast } = useToast();
  const [columns, setColumns] = React.useState<Columns>(() => groupTasks(initialTasks));
  const [activeTask, setActiveTask] = React.useState<BoardTaskView | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function findColumn(taskId: string): TaskStatus | null {
    for (const status of COLUMNS) {
      if (columns[status].some((t) => t.id === taskId)) return status;
    }
    return null;
  }

  /** Optimistic cross-column move, shared by drag-and-drop and the "Move to…" menu. */
  function moveAcrossColumns(taskId: string, target: TaskStatus) {
    const source = findColumn(taskId);
    if (!source || source === target) return;
    const task = columns[source].find((t) => t.id === taskId);
    if (!task) return;
    if (!canDragTask(role, task.assignedTo, userId)) {
      toast(t("board.onlyMoveOwn"), "error");
      return;
    }
    const snapshot = columns;
    const moved = { ...task, status: target };
    setColumns({
      ...columns,
      [source]: columns[source].filter((t) => t.id !== taskId),
      // Lands at the end of the target column — same as the server does.
      [target]: [...columns[target], moved],
    });
    void moveTask(taskId, target).then((result) => {
      if (result.error) {
        setColumns(snapshot);
        toast(result.error, "error");
        return;
      }
      toast(t("board.movedTo", { status: statusLabels[target] }));
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const task = Object.values(columns)
      .flat()
      .find((t) => t.id === String(event.active.id));
    setActiveTask(task ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const source = findColumn(activeId);
    if (!source) return;
    const activeIndex = columns[source].findIndex((t) => t.id === activeId);

    let target: TaskStatus;
    let overIndex = -1;
    if ((COLUMNS as string[]).includes(overId)) {
      target = overId as TaskStatus;
    } else {
      const found = findColumn(overId);
      if (!found) return;
      target = found;
      overIndex = columns[target].findIndex((t) => t.id === overId);
    }

    if (source === target) {
      // Reorder inside the column.
      if (activeIndex === overIndex || overIndex === -1) return;
      if (!canReorderTasks(role)) {
        toast(t("board.onlyManagerReorder"), "error");
        return;
      }
      const snapshot = columns;
      const next = arrayMove(columns[source], activeIndex, overIndex);
      setColumns({ ...columns, [source]: next });
      void reorderTasks(source, next.map((t) => t.id)).then((result) => {
        if (result.error) {
          setColumns(snapshot);
          toast(result.error, "error");
        }
      });
      return;
    }

    // Cross-column: the card lands at the end of the target column.
    moveAcrossColumns(activeId, target);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      <BoardRealtime projectIds={projectIds} />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {COLUMNS.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={columns[status]}
            timezone={timezone}
            onMove={moveAcrossColumns}
          />
        ))}
        <DragOverlay>{activeTask ? <BoardCardOverlay task={activeTask} timezone={timezone} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
