// TaskOrbit Part 4, spec §4 — FINAL QA Journey D (Collaboration).
//
// Two browser contexts (manager + developer) on the shared "Design
// homepage" task: a comment and a status change by one side must become
// visible to the other. The subscription mode is read from the
// data-realtime-mode DOM attribute and logged — live when Realtime
// delivers, polling when the 30 s fallback does (both are valid; the
// mode is recorded, not assumed).
//
// Known context: Part 3 proved comment-live PASS and bell-live FAIL.
// This journey covers comments + task status, never the bell.
import { expect, test } from "@playwright/test";
import { authedPage } from "../helpers";
import { confirmTaskStatusAfterReload, postComment, realtimeMode, setTaskStatus } from "./helpers";

const TASK = "Design homepage";

test("Journey D — Collaboration: comment and status change reach the other side", async ({
  browser,
}) => {
  const stamp = `Journey D comment ${new Date().toISOString()}`;
  const dev = await authedPage(browser, "developer");
  const mgr = await authedPage(browser, "manager");
  try {
    // Both sides open the same task; the developer's subscriptions must
    // be established before the manager acts.
    await dev.goto("/dashboard/tasks");
    await dev.getByRole("link", { name: TASK }).first().click();
    await expect(dev).toHaveURL(/\/dashboard\/tasks\//, { timeout: 60_000 });
    const commentsModeBefore = await realtimeMode(dev, "comments");
    const taskModeBefore = await realtimeMode(dev, "task");
    console.log(
      `[journey-d] developer modes before: comments=${commentsModeBefore} task=${taskModeBefore}`,
    );

    const statusBefore = await dev.getByLabel(/change task status/i).inputValue();
    const nextStatus = statusBefore === "in_progress" ? "in_review" : "in_progress";

    // Manager posts the comment and changes the status.
    await mgr.goto("/dashboard/tasks");
    await mgr.getByRole("link", { name: TASK }).first().click();
    await expect(mgr).toHaveURL(/\/dashboard\/tasks\//, { timeout: 60_000 });
    const t0 = Date.now();
    await postComment(mgr, stamp);
    await setTaskStatus(mgr, nextStatus);

    // Developer sees the comment (live or 30 s polling) within 120 s.
    await expect(dev.getByText(stamp)).toBeVisible({ timeout: 120_000 });
    const commentDelayMs = Date.now() - t0;
    const commentsModeAfter = await realtimeMode(dev, "comments");
    console.log(
      `[journey-d] comment visible after ${commentDelayMs} ms (mode before=${commentsModeBefore}, after=${commentsModeAfter})`,
    );

    // Developer sees the status change too (TaskRealtime refreshes the
    // page from the server on task updates, live or polling).
    await expect
      .poll(() => dev.getByLabel(/change task status/i).inputValue(), { timeout: 120_000 })
      .toBe(nextStatus);
    const statusDelayMs = Date.now() - t0;
    const taskModeAfter = await realtimeMode(dev, "task");
    console.log(
      `[journey-d] status "${statusBefore}" -> "${nextStatus}" visible after ${statusDelayMs} ms (mode before=${taskModeBefore}, after=${taskModeAfter})`,
    );

    // Restore the shared fixture's status so later journeys see it as found.
    await setTaskStatus(mgr, statusBefore as "todo" | "in_progress" | "in_review" | "completed");
    await confirmTaskStatusAfterReload(mgr, statusBefore as "todo" | "in_progress" | "in_review" | "completed");
    console.log(`[journey-d] PASS — comment + status reached the developer; status restored to "${statusBefore}"`);
  } finally {
    await dev.context().close();
    await mgr.context().close();
  }
});
