import { describe, expect, it } from "vitest";
import {
  canChangeTaskStatus,
  canCreateSubtask,
  canDeleteComment,
  canEditTaskDetails,
  canInvite,
  canManageProjects,
  canManageSubtask,
  canManageTasks,
  getUserRole,
  isWorkspaceMember,
} from "@/lib/permissions";

const MANAGER = "manager" as const;
const DEV = "developer" as const;
const alice = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // developer, assignee
const bob = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // another developer
const managerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const members = [
  { user_id: managerId, role: MANAGER },
  { user_id: alice, role: DEV },
  { user_id: bob, role: DEV },
];

describe("manager", () => {
  it("can manage projects, tasks and invites", () => {
    expect(canManageProjects(MANAGER)).toBe(true);
    expect(canManageTasks(MANAGER)).toBe(true);
    expect(canInvite(MANAGER)).toBe(true);
  });

  it("can edit any task's details and change any status", () => {
    expect(canEditTaskDetails(MANAGER, alice, managerId)).toBe(true);
    expect(canChangeTaskStatus(MANAGER, alice, managerId)).toBe(true);
    expect(canChangeTaskStatus(MANAGER, null, managerId)).toBe(true);
  });

  it("can delete any comment", () => {
    expect(canDeleteComment(MANAGER, alice, managerId)).toBe(true);
    expect(canDeleteComment(MANAGER, bob, managerId)).toBe(true);
  });

  it("can create and manage subtasks anywhere", () => {
    expect(
      canCreateSubtask(MANAGER, { assigned_to: null, parent_task_id: null }, managerId),
    ).toBe(true);
    expect(canManageSubtask(MANAGER, alice, managerId)).toBe(true);
    expect(canManageSubtask(MANAGER, bob, managerId, false)).toBe(true);
  });
});

describe("developer: own assigned task", () => {
  it("can change its status", () => {
    expect(canChangeTaskStatus(DEV, alice, alice)).toBe(true);
  });

  it("cannot edit its title, deadline, priority or assignee", () => {
    expect(canEditTaskDetails(DEV, alice, alice)).toBe(false);
  });

  it("cannot manage projects, tasks or invites", () => {
    expect(canManageProjects(DEV)).toBe(false);
    expect(canManageTasks(DEV)).toBe(false);
    expect(canInvite(DEV)).toBe(false);
  });

  it("can create subtasks under it", () => {
    expect(
      canCreateSubtask(DEV, { assigned_to: alice, parent_task_id: null }, alice),
    ).toBe(true);
  });

  it("can manage its own subtasks", () => {
    expect(canManageSubtask(DEV, alice, alice)).toBe(true);
  });

  it("can delete their own comment only", () => {
    expect(canDeleteComment(DEV, alice, alice)).toBe(true);
    expect(canDeleteComment(DEV, bob, alice)).toBe(false);
    expect(canDeleteComment(DEV, managerId, alice)).toBe(false);
  });
});

describe("developer: someone else's task", () => {
  it("cannot change its status", () => {
    expect(canChangeTaskStatus(DEV, bob, alice)).toBe(false);
  });

  it("cannot edit its details", () => {
    expect(canEditTaskDetails(DEV, bob, alice)).toBe(false);
  });

  it("cannot create a subtask under it", () => {
    expect(
      canCreateSubtask(DEV, { assigned_to: bob, parent_task_id: null }, alice),
    ).toBe(false);
  });

  it("cannot manage its subtasks", () => {
    expect(canManageSubtask(DEV, bob, alice)).toBe(false);
    expect(canManageSubtask(DEV, bob, alice, false)).toBe(false);
  });
});

describe("developer: unassigned task", () => {
  it("cannot create a subtask under it (manager only)", () => {
    expect(
      canCreateSubtask(DEV, { assigned_to: null, parent_task_id: null }, alice),
    ).toBe(false);
    expect(
      canCreateSubtask(
        MANAGER,
        { assigned_to: null, parent_task_id: null },
        managerId,
      ),
    ).toBe(true);
  });

  it("cannot change its status", () => {
    expect(canChangeTaskStatus(DEV, null, alice)).toBe(false);
  });
});

describe("subtask nesting", () => {
  it("no subtask under a subtask, for anyone", () => {
    expect(
      canCreateSubtask(
        MANAGER,
        { assigned_to: alice, parent_task_id: "some-parent-id" },
        managerId,
      ),
    ).toBe(false);
    expect(
      canCreateSubtask(
        DEV,
        { assigned_to: alice, parent_task_id: "some-parent-id" },
        alice,
      ),
    ).toBe(false);
  });
});

describe("no role (not a member)", () => {
  it("can never change a task's status, even when assigned to them", () => {
    expect(canChangeTaskStatus(null, alice, alice)).toBe(false);
    expect(canChangeTaskStatus(undefined, alice, alice)).toBe(false);
    expect(canChangeTaskStatus(null, null, alice)).toBe(false);
  });

  it("can never manage a subtask, even when the parent is assigned to them", () => {
    expect(canManageSubtask(null, alice, alice)).toBe(false);
    expect(canManageSubtask(undefined, alice, alice)).toBe(false);
    expect(canManageSubtask(null, alice, alice, false)).toBe(false);
    expect(canManageSubtask(null, null, alice)).toBe(false);
    // An unknown (non-developer, non-manager) role is likewise blocked.
    expect(canManageSubtask("admin" as never, alice, alice)).toBe(false);
  });
});

describe("membership helpers", () => {
  it("isWorkspaceMember finds members and rejects strangers", () => {
    expect(isWorkspaceMember(members, alice)).toBe(true);
    expect(isWorkspaceMember(members, "dddddddd-dddd-4ddd-8ddd-dddddddddddd")).toBe(false);
    expect(isWorkspaceMember(members, null)).toBe(false);
  });

  it("getUserRole returns the member's role or null", () => {
    expect(getUserRole(members, managerId)).toBe("manager");
    expect(getUserRole(members, alice)).toBe("developer");
    expect(getUserRole(members, "dddddddd-dddd-4ddd-8ddd-dddddddddddd")).toBe(null);
  });
});
