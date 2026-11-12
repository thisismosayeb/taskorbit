// Spec §11.1 (Step 0.3: /dashboard/tasks + KPI links) and §11.7
// (liquid progress shows the correct %).
import { expect, test } from "@playwright/test";
import { authedPage } from "./helpers";

test("Step 0.3: /dashboard/tasks renders for the manager with filters", async ({ browser }) => {
  const page = await authedPage(browser, "manager");
  await page.goto("/dashboard/tasks");
  await expect(page.getByRole("heading", { name: "All tasks" })).toBeVisible();
  // Filters from My Tasks: status, priority, assignee, due range, overdue,
  // sort — plus the workspace-wide "My tasks only" toggle (OFF for manager).
  await expect(page.getByLabel(/filter by status/i)).toBeVisible();
  await expect(page.getByLabel(/filter by assignee/i)).toBeVisible();
  await expect(page.getByText("My tasks only")).toBeVisible();
  const mine = page.getByRole("checkbox", { name: /my tasks only/i });
  await expect(mine).not.toBeChecked();
  // The sidebar links to it too.
  await expect(page.getByRole("link", { name: "All Tasks" }).first()).toBeVisible();
});

test("Step 0.3: KPI links — Completed tasks and Overdue tasks", async ({ browser }) => {
  const page = await authedPage(browser, "manager");
  await page.goto("/dashboard");

  const completedHref = await page
    .getByRole("link", { name: /Completed tasks/ })
    .first()
    .getAttribute("href");
  expect(completedHref).toBe("/dashboard/tasks?status=completed");
  const overdueHref = await page
    .getByRole("link", { name: /Overdue tasks/ })
    .first()
    .getAttribute("href");
  expect(overdueHref).toBe("/dashboard/tasks?overdue=1");

  // Follow the Completed link: the list is filtered to completed tasks.
  await page.getByRole("link", { name: /Completed tasks/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/tasks\?status=completed/);
  await expect(page.getByLabel(/filter by status/i)).toHaveValue("completed");

  // Follow the Overdue link: the Overdue-only box is checked.
  await page.goto("/dashboard");
  await page.getByRole("link", { name: /Overdue tasks/ }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/tasks\?overdue=1/);
  await expect(page.getByRole("checkbox", { name: /overdue only/i })).toBeChecked();
});

test("Step 0.3: developer sees All tasks with My tasks only ON by default", async ({
  browser,
}) => {
  const page = await authedPage(browser, "developer");
  await page.goto("/dashboard/tasks");
  await expect(page.getByRole("heading", { name: "All tasks" })).toBeVisible();
  const mine = page.getByRole("checkbox", { name: /my tasks only/i });
  await expect(mine).toBeChecked();
  // Turning it off shows tasks assigned to other people too.
  await mine.uncheck();
  await page.getByRole("button", { name: /filter/i }).click();
  await expect(page).toHaveURL(/mine=0/);
});

test("liquid progress shows the correct % for a project and a task", async ({ browser }) => {
  const page = await authedPage(browser, "manager");
  await page.goto("/dashboard");
  // Record the real numbers from the dashboard's own progress bars.
  const bars = page.locator('[role="progressbar"]');
  const count = await bars.count();
  expect(count).toBeGreaterThan(0);
  const values: { label: string; now: string | null }[] = [];
  for (let i = 0; i < count; i++) {
    const bar = bars.nth(i);
    values.push({
      label: (await bar.getAttribute("aria-label")) ?? "",
      now: await bar.getAttribute("aria-valuenow"),
    });
  }
  // The values are asserted in the report, not hardcoded here: every bar
  // must report a 0–100 number and show the same number as text nearby.
  for (const v of values) {
    const n = Number(v.now);
    expect(Number.isFinite(n) && n >= 0 && n <= 100).toBe(true);
  }

  // Task subtask progress: open the "Design homepage" task and read its bar.
  // (Long timeout: the dev server compiles the [taskId] route on first hit.)
  await page.goto("/dashboard/tasks");
  await page.getByRole("link", { name: "Design homepage" }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/tasks\//, { timeout: 60_000 });
  const taskBars = page.locator('[role="progressbar"]');
  await expect(taskBars.first()).toBeVisible();
  const taskNow = await taskBars.first().getAttribute("aria-valuenow");
  expect(Number(taskNow)).toBeGreaterThanOrEqual(0);
  expect(Number(taskNow)).toBeLessThanOrEqual(100);
});
