// TaskOrbit Part 4, spec §4 — FINAL QA Journey C (Deadlines).
//
// Five tasks on one project, one per deadline state:
//   neutral — due in 5 days, still open ("Due in 5 days", cyan chip)
//   red     — due yesterday, still open ("Overdue by …", red chip)
//   green   — due in 5 days, completed on time ("Completed on time")
//   amber   — due yesterday, completed late ("Completed late (…)")
//   none    — no due date ("No deadline", neutral chip)
// Then the green task is reopened: unchecking its subtask sends the
// parent back to in_progress (DB trigger trg_tasks_reopen_parent) and
// the green chip is gone.
//
// Runs as the minted manager in the Test Workspace; unique names per run.
import { expect, test } from "@playwright/test";
import { authedPage } from "../helpers";
import {
  addSubtask,
  confirmTaskStatusAfterReload,
  createProject,
  createTask,
  deadlineChip,
  deadlineChipForTask,
  runId,
  setTaskStatus,
  toggleSubtask,
} from "./helpers";

test("Journey C — Deadlines: neutral, red, green, amber, none, reopen loses green", async ({
  browser,
}) => {
  const run = runId();
  const projectName = `Journey C Deadlines ${run}`;
  const page = await authedPage(browser, "manager");
  try {
    const projectId = await createProject(page, projectName);

    // Create the five tasks (the green one gets a subtask, so it can be
    // reopened at the end). openAfter: false — this journey opens each
    // task page itself below, and each load costs ~10 s here.
    const neutralId = await createTask(page, projectId, { title: `C neutral ${run}`, dueInDays: 5, openAfter: false });
    const redId = await createTask(page, projectId, { title: `C overdue ${run}`, dueInDays: -1, openAfter: false });
    const greenId = await createTask(page, projectId, { title: `C on time ${run}`, dueInDays: 5, openAfter: false });
    const amberId = await createTask(page, projectId, { title: `C late ${run}`, dueInDays: -1, openAfter: false });
    const noneId = await createTask(page, projectId, { title: `C no deadline ${run}`, openAfter: false });

    // Neutral / red / none are read from the PROJECT page in one load:
    // each task row renders its own DeadlineChip, so no per-task page
    // load is needed for these three (each load costs ~10 s here).
    await page.goto(`/dashboard/projects/${projectId}`);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible({ timeout: 30_000 });

    // Neutral: open, due in 5 days, cyan chip.
    let chip = await deadlineChipForTask(page, `C neutral ${run}`);
    expect(chip.label).toMatch(/^Due in 5 days$/);
    expect(chip.color).toBe("cyan");
    console.log(`[journey-c] neutral: "${chip.label}" (${chip.color})`);

    // Red: overdue, still open.
    chip = await deadlineChipForTask(page, `C overdue ${run}`);
    expect(chip.label).toMatch(/^Overdue by /);
    expect(chip.color).toBe("red");
    console.log(`[journey-c] red: "${chip.label}" (${chip.color})`);

    // None: no due date.
    chip = await deadlineChipForTask(page, `C no deadline ${run}`);
    expect(chip.label).toBe("No deadline");
    expect(chip.color).toBe("neutral");
    console.log(`[journey-c] none: "${chip.label}" (${chip.color})`);

    // Amber: due yesterday, completed late. Status changes happen on the
    // task detail page; the chip is read there after the refresh.
    await page.goto(`/dashboard/tasks/${amberId}`);
    await setTaskStatus(page, "completed");
    await confirmTaskStatusAfterReload(page, "completed", { chip: /^Completed late \(/ });
    chip = await deadlineChip(page);
    expect(chip.label).toMatch(/^Completed late \(/);
    expect(chip.color).toBe("amber");
    console.log(`[journey-c] amber: "${chip.label}" (${chip.color})`);

    // Green: due in 5 days, subtask first, then complete on time.
    await page.goto(`/dashboard/tasks/${greenId}`);
    await addSubtask(page, `C green subtask ${run}`);
    await toggleSubtask(page, `C green subtask ${run}`, true);
    await setTaskStatus(page, "completed");
    await confirmTaskStatusAfterReload(page, "completed", { chip: /Completed on time/ });
    chip = await deadlineChip(page);
    expect(chip.label).toBe("Completed on time");
    expect(chip.color).toBe("green");
    console.log(`[journey-c] green: "${chip.label}" (${chip.color})`);

    // Reopen: uncheck the subtask → the DB trigger returns the parent
    // to in_progress and the green chip must be gone.
    await toggleSubtask(page, `C green subtask ${run}`, false);
    await page.reload();
    await page.waitForLoadState("load");
    await expect(page.getByLabel(/change task status/i)).toHaveValue("in_progress", { timeout: 30_000 });
    chip = await deadlineChip(page);
    expect(chip.label).toMatch(/^Due in 5 days$/);
    expect(chip.color).toBe("cyan");
    expect(chip.label).not.toBe("Completed on time");
    console.log(`[journey-c] reopened: status=in_progress, chip "${chip.label}" (${chip.color}) — green gone`);

    console.log(`[journey-c] PASS project=${projectId} neutral=${neutralId} red=${redId} green=${greenId} amber=${amberId} none=${noneId}`);
  } finally {
    await page.context().close();
  }
});
