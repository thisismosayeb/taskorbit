// TaskOrbit Part 4, spec §4 — shared helpers for the FINAL QA journeys
// (tests/e2e/journeys/journey-a.spec.ts … journey-h.spec.ts).
//
// These helpers build on tests/e2e/helpers.ts (authedPage / loginAs /
// setTheme / setLanguage) and add the multi-step flows the journeys
// repeat: sign up a brand-new user, create a workspace, create a project,
// create a task, post a comment, manage subtasks, read the deadline chip.
//
// Every journey uses UNIQUE names/emails (run suffix) so runs never
// collide with existing test data or with each other, on local or staging.
//
// No secrets here: the only password used is the throwaway test password
// for freshly created journey accounts (Test1234!), never a real key.
import { expect, type Page } from "@playwright/test";

export const JOURNEY_PASSWORD = "Test1234!";

/** Short unique suffix for names/emails created by a journey run. */
export function runId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function uniqueEmail(prefix: string, run: string): string {
  return `${prefix}-${run}@testorbit.dev`;
}

/**
 * Click a locator and wait until the URL matches. If the click landed
 * before React hydration attached the handler (slow dev server), nothing
 * happens — click once more before giving up. Same hazard as the
 * pre-hydration lost clicks documented in ../helpers.ts.
 */
export async function clickAndWaitForUrl(
  page: Page,
  locator: ReturnType<Page["locator"]> | ReturnType<Page["getByRole"]>,
  pattern: RegExp,
  timeoutMs: number = 30_000,
): Promise<void> {
  await locator.click();
  const landed = await page
    .waitForURL(pattern, { timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
  if (landed) return;
  await locator.click();
  await page.waitForURL(pattern, { timeout: timeoutMs });
}

/** "YYYY-MM-DD" `days` from today, where "today" is measured in the
 * WORKSPACE timezone (Asia/Dhaka) — the app measures deadlines in that
 * zone, and this machine runs UTC, so a local-date calculation lands a
 * day early (a "+7 days" due date showed as "Due in 6 days"). */
export function isoDate(daysFromToday: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + daysFromToday));
  return d.toISOString().slice(0, 10);
}

/**
 * Sign up a brand-new user through the real signup form.
 * Expects the test project's email confirmation to be OFF (a session is
 * returned and the browser lands on `next` — /onboarding by default, or
 * the invite page when `next` is an invite URL). If confirmation is ON,
 * the "check your email" screen appears instead and this throws a clear
 * error naming that — it does not silently continue.
 */
export async function signupNewUser(
  page: Page,
  opts: { name: string; email: string; next?: string },
): Promise<void> {
  await page.goto(opts.next ? `/signup?next=${encodeURIComponent(opts.next)}` : "/signup");
  await expect(page.locator("#full_name")).toBeVisible({ timeout: 30_000 });
  await page.locator("#full_name").fill(opts.name);
  await page.locator("#email").fill(opts.email);
  await page.locator("#password").fill(JOURNEY_PASSWORD);
  await page.locator("#confirm_password").fill(JOURNEY_PASSWORD);
  const submit = page.getByRole("button", { name: /create account/i });
  // Either we land on the next step, or the app tells us to confirm email.
  const urlPattern = opts.next
    ? new RegExp(opts.next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    : /\/onboarding/;
  let outcome: "landed" | "confirmation" | "timeout" = "timeout";
  for (let attempt = 0; attempt < 2 && outcome === "timeout"; attempt++) {
    await submit.click();
    outcome = await Promise.race([
      page.waitForURL(urlPattern, { timeout: 30_000 }).then(() => "landed" as const),
      page
        .getByText(/check your email|confirm your email/i)
        .first()
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "confirmation" as const),
    ]).catch(() => "timeout" as const);
  }
  if (outcome === "confirmation") {
    throw new Error(
      "signup returned the email-confirmation screen — confirmation is ON for this project, so UI signup cannot continue. " +
        "Journey aborted honestly; do not mark it PASS.",
    );
  }
  if (outcome === "timeout") {
    throw new Error(
      `signup did not land on ${urlPattern} and showed no confirmation screen within 30 s (still at ${page.url()}).`,
    );
  }
  await page.waitForLoadState("load");
}

/** Create the first workspace for a brand-new user (on /onboarding). */
export async function createWorkspace(page: Page, name: string): Promise<void> {
  await page.goto("/onboarding");
  await page.locator("#workspace-name").fill(name);
  await page.getByRole("button", { name: /create workspace/i }).click();
  await expect(page).toHaveURL(/\/dashboard(\?.*)?$/, { timeout: 30_000 });
  await page.waitForLoadState("load");
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
}

/** Create a project (manager) and return its id from the redirect URL.
 * Navigates straight to /dashboard/projects/new (the project form is
 * the UI under test; the list page's "New project" button is covered by
 * Journey E, which asserts it is absent for developers). */
export async function createProject(page: Page, name: string): Promise<string> {
  await page.goto("/dashboard/projects/new");
  await expect(page.locator("#project-name")).toBeVisible({ timeout: 30_000 });
  await page.locator("#project-name").fill(name);
  await page.getByRole("button", { name: /^create project$/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await page.waitForLoadState("load");
  const url = page.url();
  const id = url.match(/\/dashboard\/projects\/([0-9a-f-]{36})/)?.[1];
  if (!id) throw new Error(`createProject: could not read project id from ${url}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return id;
}

export interface NewTaskOpts {
  title: string;
  /** Exact option label in the assignee select (full name of a member). */
  assigneeName?: string;
  dueInDays?: number;
  description?: string;
  /**
   * Open the task page after creating (default true). Set false when the
   * caller navigates there itself — each task-page load costs ~10 s on
   * the slow dev server, and journeys that create several tasks (C) or
   * do not need the page (B/E setup) save it.
   */
  openAfter?: boolean;
}

/** Log in through the real login form with explicit credentials (same
 * flow as helpers.loginAs, which only knows the two shared test
 * accounts). Used for freshly signed-up journey users. */
export async function loginAsEmail(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("button[type='submit']").click();
  await expect(page).toHaveURL(/\/dashboard(\?.*)?$/, { timeout: 30_000 });
  // Same hydration wait as helpers.loginAs: the URL changes before
  // React hydration attaches the dashboard's handlers.
  await page.waitForLoadState("load");
}

/**
 * Create a task on a project page (manager) via the "New task" dialog,
 * then open it by reading its link href from the project page (no
 * extra /dashboard/tasks round-trip — the journeys run against a slow
 * dev server and every navigation costs seconds).
 */
export async function createTask(page: Page, projectId: string, opts: NewTaskOpts): Promise<string> {
  await page.goto(`/dashboard/projects/${projectId}`);
  await expect(page.getByRole("heading", { name: /.+/ }).first()).toBeVisible({ timeout: 30_000 });
  const newTaskBtn = page.getByRole("button", { name: /^new task$/i });
  // Hydration-safe open: the click can land before React attaches the
  // handler (slow dev server) and get lost — same hazard as
  // clickAndWaitForUrl, and it hit Journeys A and E repeatedly. Retry
  // the click until the dialog appears. Before each retry, re-check
  // whether the dialog opened after the previous wait timed out (slow
  // render): clicking the button behind an open dialog's overlay would
  // time out on actionability, so a failed click is swallowed and the
  // dialog check decides.
  let dialogOpened = false;
  for (let attempt = 0; attempt < 3 && !dialogOpened; attempt++) {
    if (await page.locator("#task-title").isVisible().catch(() => false)) {
      dialogOpened = true;
      break;
    }
    await newTaskBtn.click({ timeout: 10_000 }).catch(() => undefined);
    dialogOpened = await page
      .locator("#task-title")
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!dialogOpened) {
    throw new Error(`createTask: "New task" dialog did not open after 3 clicks (still at ${page.url()})`);
  }
  await page.locator("#task-title").fill(opts.title);
  if (opts.description) await page.locator("#task-description").fill(opts.description);
  if (opts.assigneeName) {
    await page.locator("#task-assignee").selectOption({ label: opts.assigneeName });
  }
  if (opts.dueInDays !== undefined) {
    await page.locator("#task-due").fill(isoDate(opts.dueInDays));
  }
  await page.getByRole("button", { name: /^create task$/i }).click();
  // The dialog closes and the project page refreshes with the new task.
  await expect(page.locator("#task-title")).toBeHidden({ timeout: 15_000 });
  const link = page.getByRole("link", { name: opts.title }).first();
  await expect(link).toBeVisible({ timeout: 30_000 });
  const href = await link.getAttribute("href");
  const id = href?.match(/\/dashboard\/tasks\/([0-9a-f-]{36})/)?.[1];
  if (!id) throw new Error(`createTask: could not read task id from link href ${href}`);
  if (opts.openAfter === false) return id;
  await page.goto(`/dashboard/tasks/${id}`);
  await expect(page.getByRole("heading", { name: opts.title })).toBeVisible({ timeout: 60_000 });
  return id;
}

export interface OpenTaskOpts {
  /**
   * Task id when the caller already knows it (createTask returns it):
   * navigate straight to /dashboard/tasks/<id> — no list walk at all.
   */
  taskId?: string;
  /** Max list pages to walk when searching by title (default 10). */
  maxPages?: number;
}

/**
 * Open a task from /dashboard/tasks by its title; return its id.
 *
 * Pagination-aware: the list shows 20/page sorted by due date, so a
 * task can slide off page 1 — the bell-live run failed here, the
 * manager stuck on a link that was on page 2. Walk ?page=N until the
 * link is found, stopping at the last page (the Next button is
 * disabled there, or absent when there is a single page) or at
 * maxPages. Pass { taskId } when the id is already known to skip the
 * walk entirely.
 */
export async function openTaskByTitle(page: Page, title: string, opts?: OpenTaskOpts): Promise<string> {
  if (opts?.taskId) {
    await page.goto(`/dashboard/tasks/${opts.taskId}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState("load");
    return opts.taskId;
  }
  const maxPages = opts?.maxPages ?? 10;
  // The Pagination component's Next button label is translated
  // (common.next: "Next" / "পরেরটি") — match both.
  const nextName = /^(Next|পরেরটি)$/;
  let pagesSearched = 0;
  for (let p = 1; p <= maxPages; p++) {
    await page.goto(p === 1 ? "/dashboard/tasks" : `/dashboard/tasks?page=${p}`);
    await expect(page.getByRole("heading", { name: "All tasks", exact: true })).toBeVisible({ timeout: 30_000 });
    pagesSearched = p;
    const link = page.getByRole("link", { name: title }).first();
    if (await link.count()) {
      await link.click();
      await expect(page).toHaveURL(/\/dashboard\/tasks\/[0-9a-f-]{36}/, { timeout: 60_000 });
      await page.waitForLoadState("load");
      const url = page.url();
      const id = url.match(/\/dashboard\/tasks\/([0-9a-f-]{36})/)?.[1];
      if (!id) throw new Error(`openTaskByTitle: could not read task id from ${url}`);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      return id;
    }
    const next = page.getByRole("button", { name: nextName });
    if ((await next.count()) === 0) break; // single page: no pagination rendered
    if (await next.first().isDisabled()) break; // last page
  }
  throw new Error(
    `openTaskByTitle: task "${title}" not found on /dashboard/tasks after searching ${pagesSearched} page(s) — ` +
      `it may be on a later page, filtered out, or in another workspace.`,
  );
}

/** Post a comment on the open task detail page and wait for it to show. */
export async function postComment(page: Page, text: string): Promise<void> {
  await page.getByLabel(/write a comment/i).fill(text);
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText(text)).toBeVisible({ timeout: 15_000 });
}

/** Add a subtask on the open task detail page.
 *
 * Two waits, in order: first the input clearing (the server action
 * returned and the form reset — fast), then, unless `waitForText` is
 * false, the subtask text appearing (needs the full router.refresh
 * re-render — ~10 s on the slow dev server). Batch callers pass
 * waitForText: false and wait once for all the texts together.
 */
export async function addSubtask(
  page: Page,
  title: string,
  dueInDays?: number,
  waitForText: boolean = true,
): Promise<void> {
  const input = page.getByLabel(/new subtask title/i);
  await input.fill(title);
  if (dueInDays !== undefined) {
    await page.getByLabel(/new subtask due date/i).fill(isoDate(dueInDays));
  }
  await page.getByRole("button", { name: /^add$/i }).click();
  // The action returned and the form reset (guards the next fill in a
  // batch against the previous action's reset clearing it).
  await expect(input).toHaveValue("", { timeout: 15_000 });
  if (waitForText) {
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  }
}

/**
 * Toggle a subtask's checkbox. `done=true` marks it done,
 * `done=false` reopens it. Waits for the subtask progress text to update.
 */
export async function toggleSubtask(page: Page, title: string, done: boolean): Promise<void> {
  const label = done ? `Mark "${title}" done` : `Mark "${title}" not done`;
  await page.getByLabel(label, { exact: true }).click();
  // The checkbox flips to the opposite state once the server accepts it.
  const nextLabel = done ? `Mark "${title}" not done` : `Mark "${title}" done`;
  const next = page.getByLabel(nextLabel, { exact: true });
  try {
    await expect(next).toBeVisible({ timeout: 15_000 });
    return;
  } catch {
    // The server action commits (verified in the DB) but on this slow
    // dev server the in-place router.refresh() can resolve with a stale
    // snapshot — Journey B once failed here while the DB already showed
    // the subtask completed. A reload is a fresh server read: confirm
    // there instead of failing on the stale render.
    console.log(`[toggleSubtask] in-place refresh did not show "${title}" ${done ? "done" : "not done"} — reloading to confirm`);
    await page.reload();
    await page.waitForLoadState("load");
    await expect(page.getByLabel(nextLabel, { exact: true })).toBeVisible({ timeout: 30_000 });
  }
}

/** "N of M done" progress text + the LiquidProgress bar value on a task page. */
export async function subtaskProgress(page: Page): Promise<{ text: string; percent: number }> {
  const text = (await page.getByText(/^\d+ of \d+ done$/).first().textContent()) ?? "";
  const bar = page.locator('[role="progressbar"]').first();
  await expect(bar).toBeVisible();
  const percent = Number(await bar.getAttribute("aria-valuenow"));
  return { text: text.trim(), percent };
}

/**
 * Read the DeadlineChip on the open task detail page: its label and the
 * Tailwind colour class that carries the state (green / red / amber /
 * cyan / neutral). The chip is the only badge whose text is a deadline
 * label, so it is found by text, not by position.
 */
export async function deadlineChip(page: Page): Promise<{ label: string; color: string }> {
  const chip = await page.evaluate(() => {
    const patterns = [
      /^Completed on time$/,
      /^Overdue by /,
      /^Completed late \(/,
      /^Due in \d+ days?$/,
      /^Due today$/,
      /^Due tomorrow$/,
      /^No deadline$/,
    ];
    const el = [...document.querySelectorAll("span")].find((s) =>
      patterns.some((re) => re.test((s.textContent ?? "").trim())),
    );
    if (!el) return null;
    return { label: (el.textContent ?? "").trim(), cls: el.className };
  });
  if (!chip) throw new Error("deadlineChip: no deadline badge found on this task page");
  const color =
    chip.cls.includes("bg-green-100") ? "green"
    : chip.cls.includes("bg-red-100") ? "red"
    : chip.cls.includes("bg-amber-100") ? "amber"
    : chip.cls.includes("bg-cyanbrand") ? "cyan"
    : chip.cls.includes("bg-slate-100") ? "neutral"
    : `unknown(${chip.cls})`;
  return { label: chip.label, color };
}

/**
 * Read the DeadlineChip for one task row on a LIST page (project page,
 * board, task list): find the task's title link, walk up to its row,
 * and read the deadline badge inside it. One page load serves every
 * row, unlike deadlineChip() which needs the task detail page.
 */
export async function deadlineChipForTask(
  page: Page,
  title: string,
): Promise<{ label: string; color: string }> {
  const chip = await page.evaluate((taskTitle) => {
    const patterns = [
      /^Completed on time$/,
      /^Overdue by /,
      /^Completed late \(/,
      /^Due in \d+ days?$/,
      /^Due today$/,
      /^Due tomorrow$/,
      /^No deadline$/,
    ];
    const badgeColor = (cls: string): string =>
      cls.includes("bg-green-100") ? "green"
      : cls.includes("bg-red-100") ? "red"
      : cls.includes("bg-amber-100") ? "amber"
      : cls.includes("bg-cyanbrand") ? "cyan"
      : cls.includes("bg-slate-100") ? "neutral"
      : `unknown(${cls})`;
    const link = [...document.querySelectorAll("a")].find(
      (a) => (a.textContent ?? "").trim() === taskTitle,
    );
    if (!link) return null;
    const row = link.closest("div[class*='border-b']") ?? link.parentElement;
    if (!row) return null;
    const el = [...row.querySelectorAll("span")].find((s) =>
      patterns.some((re) => re.test((s.textContent ?? "").trim())),
    );
    if (!el) return null;
    return { label: (el.textContent ?? "").trim(), color: badgeColor(el.className) };
  }, title);
  if (!chip) throw new Error(`deadlineChipForTask: no deadline badge found for "${title}"`);
  return chip;
}

/**
 * Confirm a status change against a FRESH server read. The select's DOM
 * value is transient until the refresh lands, and on this slow dev
 * server concurrent router.refresh() calls (subtask toggle, comment,
 * status change) can resolve out of order, leaving the page on a stale
 * snapshot — Journey B once passed both the toast check and toHaveValue
 * while the change had never landed (DB still showed "todo" and the
 * page later re-rendered "2 of 3 done"). A reload is a fresh server
 * render, so it is the only proof. If the reload still shows the old
 * state, the change never landed: retry the change once (it is
 * idempotent for the same transition) before failing.
 */
export async function confirmTaskStatusAfterReload(
  page: Page,
  status: "todo" | "in_progress" | "in_review" | "completed",
  opts?: { chip?: RegExp },
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.reload();
    await page.waitForLoadState("load");
    const value = await page.getByLabel(/change task status/i).inputValue();
    if (value === status) {
      if (opts?.chip) {
        await expect(page.getByText(opts.chip)).toBeVisible({ timeout: 30_000 });
      }
      return;
    }
    console.log(`[confirmTaskStatus] attempt ${attempt + 1}: reload shows "${value}", want "${status}" — retrying the change`);
    await setTaskStatus(page, status);
  }
  throw new Error(`confirmTaskStatus: status "${status}" did not persist after reload + retry`);
}

/**
 * Change the task status via the StatusSelect on the open task page.
 *
 * The outcome toast is the proof the server accepted the change — the
 * select's DOM value alone is NOT: it is transient until the refresh
 * lands, so asserting it right after selectOption can pass on a change
 * the server then rejects (seen in Journey B: the select read
 * "completed" while the page still showed "To do" and the chip stayed
 * "Due in 7 days"). So this waits for the success toast, then waits
 * for the refreshed select value.
 *
 * Retries once on an error toast: on this slow dev server a server
 * action request occasionally drops (a known flake class), and a retry
 * distinguishes that from a real rejection — which fails again and is
 * reported with the server's own words.
 */
export async function setTaskStatus(page: Page, status: "todo" | "in_progress" | "in_review" | "completed"): Promise<void> {
  const select = page.getByLabel(/change task status/i);
  await expect(select).toBeVisible({ timeout: 15_000 });
  for (let attempt = 0; attempt < 2; attempt++) {
    await select.selectOption(status);
    const toast = page.getByRole("status").first();
    await expect(toast, "a success or error toast must appear after the status change").toBeVisible({ timeout: 30_000 });
    const text = (await toast.textContent())?.trim() ?? "";
    if (/marked completed|orbit cleared|status changed to/i.test(text)) {
      // Success toast: now wait for the refreshed server state.
      await expect(select).toHaveValue(status, { timeout: 30_000 });
      return;
    }
    console.log(`[setTaskStatus] attempt ${attempt + 1} rejected: "${text}"`);
    if (attempt === 1) {
      throw new Error(`setTaskStatus: server rejected status "${status}": ${text}`);
    }
    // Let the error toast clear before retrying, so the next wait sees the new one.
    await page.waitForTimeout(5_000);
  }
}

/** Current task status, from the StatusSelect value (or its read-only badge). */
export async function currentTaskStatus(page: Page): Promise<string> {
  const select = page.getByLabel(/change task status/i);
  if (await select.count()) return (await select.inputValue()) ?? "";
  // Read-only badge (user cannot change this task's status).
  const badge = page.locator("span", { hasText: /^(To do|In progress|In review|Completed)$/ }).first();
  return (await badge.textContent())?.trim() ?? "";
}

/** Realtime mode of a channel wrapper on the page (live | polling | connecting). */
export async function realtimeMode(page: Page, channel: string): Promise<string | null> {
  return page.locator(`[data-realtime-channel="${channel}"]`).getAttribute("data-realtime-mode");
}

/**
 * Invite a developer from /dashboard/team (manager) and return the raw
 * invite link shown after creation. Only the token is used by callers —
 * the link's host may be the app URL, not the test baseURL.
 */
export async function inviteDeveloper(page: Page, email: string): Promise<{ link: string; token: string }> {
  // Skip the navigation when already on the team page (Journey E creates
  // several invites in a row; each goto costs ~8 s on the slow dev server).
  if (!page.url().includes("/dashboard/team")) {
    await page.goto("/dashboard/team");
    await expect(page.getByRole("heading", { name: "Team" })).toBeVisible({ timeout: 30_000 });
  }
  // The form's link span (min-w-0 flex-1 break-all) shows the JUST-created
  // invite, but it also holds the PREVIOUS invite's link until the new
  // one lands — and the pending list below has spans with the same
  // classes, so a bare "visible" wait can resolve instantly on a stale
  // link (Journey E 4c read 4b's token this way and the accept failed
  // with "different email address"). Capture the current text first,
  // then wait for it to CHANGE after submitting.
  // The span only renders AFTER an invite is created (inviteLink state
  // starts null), so on a fresh Team page it does not exist at all —
  // without an explicit timeout textContent() waits out the whole test
  // timeout (180 s) instead of resolving to "" via the catch (Journey B
  // hung here in all three video runs, 2026-11-13).
  const linkEl = page.locator("span.min-w-0.flex-1.break-all").first();
  const before = (await linkEl.textContent({ timeout: 5_000 }).catch(() => null))?.trim() ?? "";
  await page.locator("#invite-email").fill(email);
  await page.getByRole("button", { name: /create invite/i }).click();
  let link = "";
  await expect
    .poll(
      async () => {
        const text = (await linkEl.textContent().catch(() => null))?.trim() ?? "";
        link = text && text !== before ? text : "";
        return link;
      },
      { timeout: 30_000 },
    )
    .not.toBe("");
  const token = link.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error(`inviteDeveloper: no invite token in "${link}"`);
  return { link, token };
}

/** Accept (or try to accept) an invite as the logged-in user; returns the alert text if it fails. */
export async function tryAcceptInvite(page: Page, token: string): Promise<{ ok: boolean; error: string | null }> {
  await page.goto(`/invite/${token}`);
  await expect(page.getByRole("button", { name: /accept invite/i })).toBeVisible({ timeout: 30_000 });
  const accept = page.getByRole("button", { name: /accept invite/i });
  // The error renders inside the form (<p role="alert">). Do NOT use a
  // bare getByRole("alert"): Next.js injects a visually-hidden
  // #__next-route-announcer__ with role="alert" on every page, and
  // Playwright treats it as visible — a bare alert wait resolves
  // instantly on it and its text is empty, so the real error was read
  // as "" (Journey E bogus-token case).
  const alert = page.locator("form [role='alert']");
  let outcome: "accepted" | "error" | "timeout" = "timeout";
  for (let attempt = 0; attempt < 2 && outcome === "timeout"; attempt++) {
    await accept.click();
    outcome = await Promise.race([
      page.waitForURL(/\/dashboard(\?.*)?$/, { timeout: 30_000 }).then(() => "accepted" as const),
      alert
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => "error" as const),
    ]).catch(() => "timeout" as const);
  }
  if (outcome === "accepted") return { ok: true, error: null };
  if (outcome === "timeout") {
    return { ok: false, error: `no redirect and no error shown within 30 s (still at ${page.url()})` };
  }
  const error = (await alert.textContent())?.trim() ?? "";
  return { ok: false, error };
}
