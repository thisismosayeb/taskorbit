// TaskOrbit Part 4, spec §4 — FINAL QA Journey E (Isolation).
//
// 1. Developer cannot create a project: /dashboard/projects/new is a
//    server-rendered 404 for developers (canManageProjects gate) and the
//    "New project" button is absent on the projects list.
// 2. Developer cannot edit/delete another's task: on the project page
//    the edit/delete buttons are absent for a manager-owned task, and on
//    the task page the status control is a read-only badge, not a select.
//    (The UI absence is server-rendered from the same permission checks
//    the server actions enforce — lib/actions/tasks.ts returns
//    "Only the workspace manager can edit task details." /
//    "Only the workspace manager can delete tasks."; a raw server-action
//    call is not invocable from the browser, so the observable server
//    gate is the 404 + the server-rendered controls.)
// 3. A user from another workspace gets Not found for a guessed task URL
//    (and project URL) from the Test Workspace.
// 4. Invite failures show a clear error: reused, wrong-email, revoked,
//    and a bogus token. Expired is NOT covered here: invites expire after
//    7 days (lib/actions/team.ts) and no UI can backdate one — it is
//    skipped explicitly, never marked PASS.
import { expect, test } from "@playwright/test";
import { authedPage, credentials } from "../helpers";
import {
  createProject,
  createTask,
  createWorkspace,
  inviteDeveloper,
  runId,
  signupNewUser,
  tryAcceptInvite,
  uniqueEmail,
} from "./helpers";

const NOT_FOUND = /could not be found|not found|404/i;

test("Journey E — Isolation: developer blocked, other workspace blocked, bad invites fail", async ({
  browser,
}) => {
  const run = runId();
  const mgr = await authedPage(browser, "manager");
  const dev = await authedPage(browser, "developer");
  try {
    // --- Setup (manager): a project + a task assigned to the manager.
    const projectId = await createProject(mgr, `Journey E Isolation ${run}`);
    const taskId = await createTask(mgr, projectId, {
      title: `E manager task ${run}`,
      // Unassigned: no developer can edit it either way (edit is
      // manager-only), and the developer cannot change its status
      // because it is not assigned to them.
      dueInDays: 7,
      openAfter: false, // the developer opens it below; the manager does not need the page
    });
    console.log(`[journey-e] setup project=${projectId} task=${taskId} (manager-owned)`);

    // --- 1. Developer cannot create a project.
    await dev.goto("/dashboard/projects/new");
    await expect(dev.getByText(NOT_FOUND).first()).toBeVisible({ timeout: 30_000 });
    console.log("[journey-e] developer /dashboard/projects/new -> server 404 (not found)");
    await dev.goto("/dashboard/projects");
    await expect(dev.getByRole("link", { name: "New project" })).toHaveCount(0);
    console.log("[journey-e] developer projects list has no 'New project' button");

    // --- 2. Developer cannot edit/delete the manager's task, or change it.
    await dev.goto(`/dashboard/projects/${projectId}`);
    await expect(dev.getByRole("button", { name: /^new task$/i })).toHaveCount(0);
    await expect(
      dev.getByRole("button", { name: `Edit E manager task ${run}` }),
    ).toHaveCount(0);
    await expect(
      dev.getByRole("button", { name: `Delete E manager task ${run}` }),
    ).toHaveCount(0);
    console.log("[journey-e] developer project page: no New/Edit/Delete task controls");
    await dev.goto(`/dashboard/tasks/${taskId}`);
    await expect(dev.getByLabel(/change task status/i)).toHaveCount(0);
    await expect(dev.getByText(/^(To do|In progress|In review|Completed)$/).first()).toBeVisible();
    console.log("[journey-e] developer task page: status is a read-only badge, not a select");

    // --- 3. A user from ANOTHER workspace gets Not found for guessed URLs.
    const outsiderEmail = uniqueEmail("journey-e-outsider", run);
    const outCtx = await browser.newContext();
    const out = await outCtx.newPage();
    try {
      await signupNewUser(out, { name: `Journey E Outsider ${run}`, email: outsiderEmail });
      await createWorkspace(out, `Journey E Outside ${run}`);
      await out.goto(`/dashboard/tasks/${taskId}`);
      await expect(out.getByText(NOT_FOUND).first()).toBeVisible({ timeout: 30_000 });
      console.log(`[journey-e] outsider guessed task URL ${taskId} -> Not found`);
      await out.goto(`/dashboard/projects/${projectId}`);
      await expect(out.getByText(NOT_FOUND).first()).toBeVisible({ timeout: 30_000 });
      console.log(`[journey-e] outsider guessed project URL ${projectId} -> Not found`);
    } finally {
      await outCtx.close();
    }

    // --- 4a. Bogus token fails with a clear error.
    const bogus = "f".repeat(64);
    const bogusRes = await tryAcceptInvite(dev, bogus);
    expect(bogusRes.ok).toBe(false);
    expect(bogusRes.error).toMatch(/not found or already used/i);
    console.log(`[journey-e] bogus token -> "${bogusRes.error}"`);

    // --- 4b. Wrong-email invite fails with a clear error.
    // Invite a fresh address, then accept as developer@testorbit.dev.
    const wrongEmail = uniqueEmail("journey-e-wrong", run);
    const wrong = await inviteDeveloper(mgr, wrongEmail);
    const wrongRes = await tryAcceptInvite(dev, wrong.token);
    expect(wrongRes.ok).toBe(false);
    expect(wrongRes.error).toMatch(/different email address/i);
    console.log(`[journey-e] wrong-email invite -> "${wrongRes.error}"`);

    // --- 4c. Reused invite fails: invite the developer, accept once,
    // then accept the same token again.
    const devEmail = credentials("developer").email;
    const reuse = await inviteDeveloper(mgr, devEmail);
    const first = await tryAcceptInvite(dev, reuse.token);
    expect(first.ok, `first accept of the developer invite should succeed, got: ${first.error}`).toBe(true);
    console.log("[journey-e] developer accepted their invite (first use OK)");
    const second = await tryAcceptInvite(dev, reuse.token);
    expect(second.ok).toBe(false);
    expect(second.error).toMatch(/already used/i);
    console.log(`[journey-e] reused invite -> "${second.error}"`);

    // --- 4d. Revoked invite fails with a clear error.
    const revoked = await inviteDeveloper(mgr, devEmail);
    await mgr.goto("/dashboard/team");
    await mgr
      .getByLabel(`Revoke invite for ${devEmail}`)
      .first()
      .click();
    await expect(mgr.getByRole("heading", { name: /revoke invitation/i })).toBeVisible({ timeout: 15_000 });
    await mgr.getByRole("button", { name: /^revoke invite$/i }).click();
    await expect(mgr.getByLabel(`Revoke invite for ${devEmail}`)).toHaveCount(0, { timeout: 30_000 });
    const revokedRes = await tryAcceptInvite(dev, revoked.token);
    expect(revokedRes.ok).toBe(false);
    expect(revokedRes.error).toMatch(/revoked/i);
    console.log(`[journey-e] revoked invite -> "${revokedRes.error}"`);

    console.log("[journey-e] PASS — all isolation checks held (expired-invite case explicitly not covered: 7-day expiry, no UI to backdate)");
  } finally {
    await dev.context().close();
    await mgr.context().close();
  }
});
