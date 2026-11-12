// Board permission helper (lib/board-permissions.ts).
//
// Rules from docs/DECISIONS.md: the manager can move any task; a developer
// can move only tasks assigned to them. Reordering inside a column changes
// tasks.position, which the database trigger
// `enforce_developer_task_update` rejects for developers — so only the
// manager can reorder.

import { describe, expect, it } from "vitest";
import { canDragTask, canReorderTasks, dragDisabledReason } from "@/lib/board-permissions";

const MANAGER_ID = "manager-1";
const DEV_ID = "dev-1";
const OTHER_DEV_ID = "dev-2";

describe("canDragTask", () => {
  it("manager can drag any task", () => {
    expect(canDragTask("manager", OTHER_DEV_ID, MANAGER_ID)).toBe(true);
    expect(canDragTask("manager", null, MANAGER_ID)).toBe(true);
  });

  it("developer can drag only tasks assigned to them", () => {
    expect(canDragTask("developer", DEV_ID, DEV_ID)).toBe(true);
    expect(canDragTask("developer", OTHER_DEV_ID, DEV_ID)).toBe(false);
    expect(canDragTask("developer", null, DEV_ID)).toBe(false);
  });

  it("nobody without a user id can drag", () => {
    expect(canDragTask("manager", DEV_ID, null)).toBe(false);
    expect(canDragTask("developer", DEV_ID, null)).toBe(false);
    expect(canDragTask(null, DEV_ID, DEV_ID)).toBe(false);
  });
});

describe("canReorderTasks", () => {
  it("only the manager can reorder inside a column", () => {
    expect(canReorderTasks("manager")).toBe(true);
    expect(canReorderTasks("developer")).toBe(false);
    expect(canReorderTasks(null)).toBe(false);
    expect(canReorderTasks(undefined)).toBe(false);
  });
});

describe("dragDisabledReason", () => {
  it("returns null when dragging is allowed", () => {
    expect(dragDisabledReason("manager", OTHER_DEV_ID, MANAGER_ID)).toBeNull();
    expect(dragDisabledReason("developer", DEV_ID, DEV_ID)).toBeNull();
  });

  it("explains why a card cannot be dragged", () => {
    expect(dragDisabledReason("developer", OTHER_DEV_ID, DEV_ID)).toBe("Only the assignee can move this task.");
    expect(dragDisabledReason("developer", DEV_ID, null)).toBe("Log in to move tasks.");
  });
});
