// TaskOrbit Part 4, spec §4 — FINAL QA Journey H (Production smoke,
// STAGING ONLY — production does not exist yet).
//
// *** This journey runs against STAGING, never production. ***
// Production does not exist yet, so there is nothing to smoke-test
// there; the staging URL stands in, and the test title, skip message
// and console output all say STAGING. Never claim this ran on production.
//
// Read-only except for one status flip on an existing task, which is
// flipped back at the end. Uses the dedicated test accounts
// (manager/developer@testorbit.dev) via the real login form.
//
// When PLAYWRIGHT_BASE_URL is not the staging host (e.g. a local run),
// this journey SKIPS itself with a clear reason — it is staging-only
// by design, and a local pass would be a false claim.
import { expect, test } from "@playwright/test";
import { loginAs } from "../helpers";
import { confirmTaskStatusAfterReload, setTaskStatus } from "./helpers";

type TaskStatus = "todo" | "in_progress" | "in_review" | "completed";

const STAGING_HOST = "taskorbit-gamma.vercel.app";

function baseURL(): string {
  return process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
}

test("Journey H — Production smoke on STAGING (production does not exist yet): login, dashboard, task change persists", async ({
  page,
}) => {
  const base = baseURL();
  const host = new URL(base).hostname;
  test.skip(
    host !== STAGING_HOST,
    `Journey H is staging-only: PLAYWRIGHT_BASE_URL host is "${host}", not staging "${STAGING_HOST}". ` +
      "Run it with PLAYWRIGHT_BASE_URL=https://taskorbit-gamma.vercel.app after the Part 4 deploy. " +
      "It is NOT run against local, and production does not exist yet.",
  );
  console.log(`[journey-h STAGING] baseURL=${base} — production does not exist yet; smoke-testing staging`);

  // 1. Login works (real form login, manager test account).
  await loginAs(page, "manager");
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible({
    timeout: 30_000,
  });
  console.log("[journey-h STAGING] login OK, dashboard loads");

  // 2. A task exists and opens. (If the staging seed has no tasks yet,
  // skip honestly instead of inventing one.)
  await page.goto("/dashboard/tasks");
  await expect(page.getByRole("heading", { name: "All tasks" })).toBeVisible({ timeout: 30_000 });
  const firstTask = page.locator("main a[href^='/dashboard/tasks/']").first();
  if ((await firstTask.count()) === 0) {
    test.skip(true, "Journey H (STAGING): no tasks exist for the smoke account yet — nothing to flip. Seed demo data first.");
  }
  const taskTitle = (await firstTask.textContent())?.trim() ?? "(unnamed task)";
  await firstTask.click();
  await expect(page).toHaveURL(/\/dashboard\/tasks\//, { timeout: 60_000 });
  console.log(`[journey-h STAGING] opened task "${taskTitle}"`);

  // 3. Flip the status, reload, assert it persisted — then flip it back.
  // (setTaskStatus waits for the server's success toast, and the reload
  // confirm reads a fresh server render — the select's DOM value alone
  // is transient until the refresh lands; see helpers.)
  const select = page.getByLabel(/change task status/i);
  await expect(select).toBeVisible({ timeout: 30_000 });
  const before = (await select.inputValue()) as TaskStatus;
  const next: TaskStatus = before === "in_progress" ? "in_review" : "in_progress";
  await setTaskStatus(page, next);
  await confirmTaskStatusAfterReload(page, next);
  console.log(`[journey-h STAGING] status "${before}" -> "${next}" persisted after reload`);

  await setTaskStatus(page, before);
  await confirmTaskStatusAfterReload(page, before);
  console.log(`[journey-h STAGING] PASS — status restored to "${before}"; staging smoke green (NOT production)`);
});
