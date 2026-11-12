// Spec §11.2 (landing), §11.3 (logo/favicon/OG), §10 (skip link, focus,
// overflow) — public landing page.
import { expect, test } from "@playwright/test";
import { horizontalOverflowPx } from "./helpers";

test("landing: all sections present, CTAs go to the right pages", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/TaskOrbit/);

  // Hero headline + sub-text.
  await expect(page.getByText("Turn Big Ideas Into")).toBeVisible();
  await expect(page.getByText("Brilliantly Managed")).toBeVisible();
  await expect(
    page.getByText("Spend less time organizing and more time building."),
  ).toBeVisible();

  // Hero CTAs (the header has its own Get Started link — scope to #main).
  await page.locator("#main").getByRole("link", { name: "Get Started Free" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Explore Features" }).click();
  await expect(page).toHaveURL(/#features$/);

  // Sections (ids + headings).
  for (const section of ["#features", "#how", "#showcase", "#developers"]) {
    await expect(page.locator(section)).toBeVisible();
  }
  await expect(page.getByText("Deadline", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mosayeb Siam" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nabil Zaman" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mamshad" })).toBeVisible();
  await expect(page.getByText("Your Next Great Project Starts Here.")).toBeVisible();

  // Footer links (scoped to the footer: the header has its own Log in link).
  await expect(page.getByRole("link", { name: /Privacy/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Terms/i }).first()).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.locator("footer").getByRole("link", { name: /Create account/i })).toBeVisible();
});

test("landing: logo, favicon and OG image load", async ({ page, request }) => {
  await page.goto("/");
  // Logo wordmark in the header.
  await expect(page.locator("header a[href='/']").first()).toBeVisible();
  const favicon = await request.get("/favicon.ico");
  expect(favicon.status(), "favicon.ico status").toBe(200);
  const og = await request.get("/brand/og-image.png");
  expect(og.status(), "OG image status").toBe(200);
  const ogMeta = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(ogMeta).toContain("og-image.png");
});

test("landing: skip link, focus ring, no horizontal overflow", async ({ page }) => {
  await page.goto("/");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeAttached();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  const outline = await skip.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline, "skip link has a visible focus style").not.toBe("none");
  expect(await horizontalOverflowPx(page)).toBe(0);
});

test("landing: mobile menu opens at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/");
  await expect(page.locator("#mobile-menu")).toBeHidden();
  await page.getByRole("button", { name: /open menu/i }).click();
  await expect(page.locator("#mobile-menu")).toBeVisible();
  await expect(page.locator("#mobile-menu").getByRole("link", { name: /features/i }).first()).toBeVisible();
  await page.locator("#mobile-menu").getByRole("link", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/login$/);
});
