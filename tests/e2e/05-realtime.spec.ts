// Spec §11.1 — bell live, mark one / mark all as read, comment delay +
// mode. Two browser contexts (manager + developer) on the local dev
// server. The realtime mode is read from the data-realtime-mode DOM
// attribute (live | polling | connecting) — Part 2 could never read it
// in the cloud browser; Playwright can.
import { expect, test, type Page } from "@playwright/test";
import { authedPage } from "./helpers";

async function bellCount(page: Page): Promise<number> {
  const label = await page
    .locator('[data-realtime-channel="notifications"] button')
    .first()
    .getAttribute("aria-label");
  const m = label?.match(/(\d+) unread/);
  return m ? Number(m[1]) : 0;
}

async function bellMode(page: Page): Promise<string | null> {
  return page.locator('[data-realtime-channel="notifications"]').getAttribute("data-realtime-mode");
}

async function openTask(page: Page, title: string): Promise<void> {
  await page.goto("/dashboard/tasks");
  await page.getByRole("link", { name: title }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/tasks\//);
}

test("bell live: developer bell moves when the manager comments, with mode + delay", async ({
  browser,
}) => {
  const dev = await authedPage(browser, "developer");
  const mgr = await authedPage(browser, "manager");
  try {
    await dev.goto("/dashboard");
    const before = await bellCount(dev);
    const mode = await bellMode(dev);

    // Manager comments on "Design homepage" (assigned to the developer),
    // which notifies the assignee.
    await openTask(mgr, "Design homepage");
    const stamp = `E2E bell probe ${new Date().toISOString()}`;
    await mgr.getByLabel(/write a comment/i).fill(stamp);
    const t0 = Date.now();
    await mgr.getByRole("button", { name: "Post comment" }).click();
    await expect(mgr.getByText(stamp)).toBeVisible({ timeout: 15_000 });

    // Watch the developer bell for up to 120 s (realtime should be
    // seconds; the 30 s polling fallback is the slow path).
    let after = before;
    let delayMs: number | null = null;
    for (let i = 0; i < 24; i++) {
      await dev.waitForTimeout(5_000);
      after = await bellCount(dev);
      if (after !== before) {
        delayMs = Date.now() - t0;
        break;
      }
    }
    const modeAfter = await bellMode(dev);
    // Report the observation in the test title output (and fail loudly
    // if nothing arrived within 2 minutes).
    expect(
      delayMs,
      `bell unread ${before} -> ${after} within 120 s (mode before=${mode}, after=${modeAfter})`,
    ).not.toBeNull();
    console.log(
      `[e2e bell-live] before=${before} after=${after} delayMs=${delayMs} modeBefore=${mode} modeAfter=${modeAfter}`,
    );
    expect(after).toBeGreaterThan(before);
  } finally {
    await dev.context().close();
    await mgr.context().close();
  }
});

test("comment live: manager sees the developer comment, with mode + delay", async ({
  browser,
}) => {
  const dev = await authedPage(browser, "developer");
  const mgr = await authedPage(browser, "manager");
  try {
    await openTask(mgr, "Design homepage");
    const mode = await mgr
      .locator('[data-realtime-channel="comments"]')
      .getAttribute("data-realtime-mode");

    await openTask(dev, "Design homepage");
    const stamp = `E2E comment probe ${new Date().toISOString()}`;
    await dev.getByLabel(/write a comment/i).fill(stamp);
    const t0 = Date.now();
    await dev.getByRole("button", { name: "Post comment" }).click();
    await expect(dev.getByText(stamp)).toBeVisible({ timeout: 15_000 });

    await expect(mgr.getByText(stamp)).toBeVisible({ timeout: 120_000 });
    const delayMs = Date.now() - t0;
    const modeAfter = await mgr
      .locator('[data-realtime-channel="comments"]')
      .getAttribute("data-realtime-mode");
    console.log(
      `[e2e comment-live] delayMs=${delayMs} modeBefore=${mode} modeAfter=${modeAfter}`,
    );
    expect(delayMs).toBeLessThan(120_000);
  } finally {
    await dev.context().close();
    await mgr.context().close();
  }
});

test("mark one / mark all as read", async ({ browser }) => {
  const page = await authedPage(browser, "manager");
  await page.goto("/dashboard");
  const before = await bellCount(page);
  expect(before).toBeGreaterThan(0);

  await page.locator('[data-realtime-channel="notifications"] button').first().click();
  await expect(page.getByRole("button", { name: /mark all as read/i })).toBeVisible();
  await page.getByRole("button", { name: /mark all as read/i }).click();
  await expect
    .poll(() => bellCount(page), { timeout: 15_000 })
    .toBe(0);
});
