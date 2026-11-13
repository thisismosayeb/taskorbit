// TaskOrbit Part 4, spec §4 — FINAL QA Journey B (Developer path).
//
// Manager invites a new developer → developer follows the invite link →
// signup → accept → assigned task → subtasks "Design form",
// "Connect Supabase", "Validate errors" → complete two (shows 67%) →
// comment "Authentication UI is ready" → complete the third and the parent.
//
// The manager side runs in the shared Test Workspace as the minted
// manager session; the developer is a brand-new unique account per run.
// Both sessions are kept open and reused across the steps (no second
// authedPage, no second form login — each round-trip costs seconds on
// the slow dev server and the journey must fit the 180 s test timeout).
import { expect, test } from "@playwright/test";
import { authedPage } from "../helpers";
import {
  addSubtask,
  clickAndWaitForUrl,
  confirmTaskStatusAfterReload,
  createProject,
  createTask,
  inviteDeveloper,
  openTaskByTitle,
  postComment,
  runId,
  setTaskStatus,
  signupNewUser,
  subtaskProgress,
  toggleSubtask,
  uniqueEmail,
} from "./helpers";

const SUBTASKS = ["Design form", "Connect Supabase", "Validate errors"];

test("Journey B — Developer: invite to completed parent task", async ({ browser }) => {
  const run = runId();
  const devName = `Journey B Developer ${run}`;
  const devEmail = uniqueEmail("journey-b-developer", run);
  const projectName = `Journey B Lab ${run}`;
  const taskTitle = `Implement Login ${run}`;

  const mgr = await authedPage(browser, "manager");
  const devCtx = await browser.newContext();
  const dev = await devCtx.newPage();
  try {
    // 1. Manager invites the developer (Test Workspace).
    const { token } = await inviteDeveloper(mgr, devEmail);
    console.log(`[journey-b] invite created for ${devEmail}`);

    // 2. Developer follows the invite link → signup → accept.
    await dev.goto(`/invite/${token}`);
    await expect(dev.getByRole("link", { name: /create an account/i })).toBeVisible({ timeout: 30_000 });
    await clickAndWaitForUrl(dev, dev.getByRole("link", { name: /create an account/i }), /\/signup\?next=\/invite\//);
    await signupNewUser(dev, { name: devName, email: devEmail, next: `/invite/${token}` });
    // Back on the invite page, signed in: accept.
    await expect(dev.getByRole("button", { name: /accept invite/i })).toBeVisible({ timeout: 30_000 });
    await dev.getByRole("button", { name: /accept invite/i }).click();
    await expect(dev).toHaveURL(/\/dashboard(\?.*)?$/, { timeout: 30_000 });
    await dev.waitForLoadState("load");
    await expect(dev.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    console.log(`[journey-b] developer ${devEmail} accepted the invite`);

    // 3. The SAME manager session creates the project and assigns the task.
    const projectId = await createProject(mgr, projectName);
    const taskId = await createTask(mgr, projectId, {
      title: taskTitle,
      assigneeName: devName,
      dueInDays: 7,
      openAfter: false, // the developer opens it themselves below
    });
    console.log(`[journey-b] project=${projectId} task=${taskId} assigned to ${devName}`);

    // 4. The developer opens the assigned task — My tasks only is ON by
    // default for developers, so it must be listed — and adds 3 subtasks
    // (batched: one joint wait for all three). The task id is known
    // (createTask returned it), so open it directly, no list walk.
    await openTaskByTitle(dev, taskTitle, { taskId });
    for (const sub of SUBTASKS) await addSubtask(dev, `${sub} ${run}`, undefined, false);
    for (const sub of SUBTASKS) {
      await expect(dev.getByText(`${sub} ${run}`)).toBeVisible({ timeout: 30_000 });
    }

    // 5. Complete two subtasks → 2 of 3 done, 67%.
    await toggleSubtask(dev, `Design form ${run}`, true);
    await toggleSubtask(dev, `Connect Supabase ${run}`, true);
    const progress = await subtaskProgress(dev);
    expect(progress.text).toBe("2 of 3 done");
    expect(progress.percent).toBe(67);
    console.log(`[journey-b] progress after 2/3 subtasks: ${progress.text} (${progress.percent}%)`);

    // 6. Comment, then complete the third subtask and the parent.
    await postComment(dev, "Authentication UI is ready");
    await toggleSubtask(dev, `Validate errors ${run}`, true);
    const done = await subtaskProgress(dev);
    expect(done.text).toBe("3 of 3 done");
    expect(done.percent).toBe(100);

    await setTaskStatus(dev, "completed");
    await confirmTaskStatusAfterReload(dev, "completed", { chip: /completed on time/i });
    console.log(`[journey-b] PASS task completed with all subtasks done`);
  } finally {
    await mgr.context().close();
    await devCtx.close();
  }
});
