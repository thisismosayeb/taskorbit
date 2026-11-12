// Spec §11.8 (reduced motion) and §11.12 + §10 (320px and the full
// width sweep: no horizontal page overflow except intentional board
// scroll).
import { expect, test } from "@playwright/test";
import { authedPage, horizontalOverflowPx } from "./helpers";

test("reduced motion: animations off, page still usable", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  try {
    await page.goto("/");
    const prefersReduced = await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    expect(prefersReduced).toBe(true);
    // The hero's floating bits must not be animating.
    const animated = await page.evaluate(() => {
      const els = [...document.querySelectorAll(".animate-float, .animate-float-soft, .animate-bob")];
      return els.map((el) => {
        const cs = getComputedStyle(el);
        return { name: cs.animationName, duration: cs.animationDuration };
      });
    });
    expect(animated.length, "animated elements exist to check").toBeGreaterThan(0);
    // The app disables motion under reduced motion by collapsing
    // durations to 0.01ms (globals.css) — effectively instant, not
    // "none". Accept a sub-10ms duration as "off".
    for (const a of animated) {
      const seconds = a.duration.endsWith("ms") ? parseFloat(a.duration) / 1000 : parseFloat(a.duration);
      expect(
        a.name === "none" || seconds < 0.01,
        `animation off under reduced motion: ${JSON.stringify(a)}`,
      ).toBe(true);
    }
    // Still usable: CTA works.
    await page.locator("#main").getByRole("link", { name: "Get Started Free" }).click();
    await expect(page).toHaveURL(/\/signup$/);
  } finally {
    await ctx.close();
  }
});

const WIDTHS = [320, 375, 390, 430, 768, 1024, 1440, 1920];

test("width sweep (landing): no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(300);
    expect(await horizontalOverflowPx(page), `landing overflow at ${width}px`).toBe(0);
  }
});

test("320px: landing, login, dashboard and task page are usable", async ({ browser, page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await expect(page.locator("#main").getByRole("link", { name: "Get Started Free" })).toBeVisible();
  expect(await horizontalOverflowPx(page), "landing overflow at 320px").toBe(0);

  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.getByRole("button", { name: /log in/i })).toBeVisible();
  expect(await horizontalOverflowPx(page), "login overflow at 320px").toBe(0);

  const dash = await authedPage(browser, "manager", { width: 320, height: 700 });
  await expect(dash.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect(await horizontalOverflowPx(dash), "dashboard overflow at 320px").toBe(0);

  await dash.goto("/dashboard/tasks");
  await dash.getByRole("link", { name: "Design homepage" }).first().click();
  await expect(dash).toHaveURL(/\/dashboard\/tasks\//, { timeout: 60_000 });
  expect(await horizontalOverflowPx(dash), "task page overflow at 320px").toBe(0);
});

test("width sweep (dashboard): no horizontal overflow", async ({ browser }) => {
  const page = await authedPage(browser, "manager");
  await page.goto("/dashboard");
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    await page.waitForTimeout(300);
    expect(await horizontalOverflowPx(page), `dashboard overflow at ${width}px`).toBe(0);
  }
});
