// TaskOrbit Part 4, spec §4 — FINAL QA Journey A (Manager path).
//
// Homepage → signup (new unique manager) → workspace → project
// "Software Engineering Lab" → task "Build Login Page" assigned with a
// due date → project progress → board → comment → analytics.
//
// Base-URL driven (PLAYWRIGHT_BASE_URL); unique names per run, so it
// never collides with existing test data on local or staging.
import { expect, test } from "@playwright/test";
import {
  createProject,
  createTask,
  createWorkspace,
  postComment,
  runId,
  signupNewUser,
  uniqueEmail,
} from "./helpers";

test("Journey A — Manager: homepage to analytics", async ({ page }) => {
  const run = runId();
  const managerName = `Journey A Manager ${run}`;
  const managerEmail = uniqueEmail("journey-a-manager", run);
  const workspaceName = `Journey A Workspace ${run}`;
  const projectName = `Software Engineering Lab ${run}`;
  const taskTitle = `Build Login Page ${run}`;
  const comment = `Journey A comment ${run}: login page scope agreed.`;

  // 1. Homepage → signup.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /turn big ideas into/i }).first()).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole("link", { name: /get started/i }).first().click();
  await expect(page).toHaveURL(/\/signup/);

  // 2. Signup (new unique manager) → onboarding → workspace.
  await signupNewUser(page, { name: managerName, email: managerEmail });
  await createWorkspace(page, workspaceName);
  await expect(page.locator("aside, nav").first().getByText(workspaceName)).toBeVisible();

  // 3. Project "Software Engineering Lab".
  const projectId = await createProject(page, projectName);

  // 4. Task "Build Login Page", assigned to the manager (only member so
  // far) with a due date 7 days out.
  const taskId = await createTask(page, projectId, {
    title: taskTitle,
    assigneeName: managerName,
    dueInDays: 7,
  });
  expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
  // The detail page shows the assignee and the due date.
  await expect(page.getByText(managerName).first()).toBeVisible();
  await expect(page.getByText(/due in 7 days/i)).toBeVisible();

  // 5. Project progress: 0 of 1 tasks completed, 0% bar.
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByText("0 of 1 tasks completed")).toBeVisible({ timeout: 30_000 });
  const bar = page.locator('[role="progressbar"]').first();
  await expect(bar).toBeVisible();
  expect(await bar.getAttribute("aria-valuenow")).toBe("0");

  // 6. Board shows the task.
  await page.goto("/dashboard/board");
  await expect(page.getByRole("heading", { name: "Board" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: taskTitle }).first()).toBeVisible({ timeout: 30_000 });

  // 7. Comment on the task.
  await page.goto(`/dashboard/tasks/${taskId}`);
  await postComment(page, comment);
  await page.reload();
  await expect(page.getByText(comment)).toBeVisible({ timeout: 30_000 });

  // 8. Analytics loads for the manager and reflects the workspace.
  await page.goto("/dashboard/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/workspace-wide charts/i)).toBeVisible();

  console.log(
    `[journey-a] PASS manager=${managerEmail} workspace="${workspaceName}" project=${projectId} task=${taskId}`,
  );
});
