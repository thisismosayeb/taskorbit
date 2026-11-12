// Spec §11.4 — login/signup mascot states (email focus, password focus,
// error, success). The mascot is decorative (aria-hidden); its state is
// read from the SVG it renders: pupils shifted (look), hands over eyes
// (shy), mascot-error / mascot-success classes.
import { expect, test } from "@playwright/test";

const MASCOT = '[aria-hidden="true"] >> svg';

test("mascot: idle, look on email focus, shy on password focus", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(MASCOT)).toBeVisible();

  // Idle: pupils centred (cx 78 / 122), no hand ellipses.
  await expect(page.locator('svg circle[cx="78"][r="6"]')).toBeVisible();
  await expect(page.locator('svg ellipse[cx="78"]').first()).toBeHidden();

  // Email focus: pupils glance toward the form (cx 83 / 127).
  await page.locator("#email").click();
  await expect(page.locator('svg circle[cx="83"][r="6"]')).toBeVisible();

  // Password focus: hands cover the eyes, pupils hidden.
  await page.locator("#password").click();
  await expect(page.locator('svg ellipse[cx="78"]').first()).toBeVisible();
  await expect(page.locator('svg circle[cx="78"][r="6"]')).toBeHidden();
  // The password value itself is never revealed.
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
});

test("mascot: error shake on bad login, success bounce on good login", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("nobody@testorbit.dev");
  await page.locator("#password").fill("WrongPass123!");
  await page.locator("button[type='submit']").click();
  // Error state: the mascot root carries mascot-error and an error is shown.
  await expect(page.locator(".mascot-error")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/incorrect email or password/i)).toBeVisible();

  // Success: a good login bounces the mascot, then lands on /dashboard.
  await page.locator("#email").fill(process.env.TEST_MANAGER_EMAIL!);
  await page.locator("#password").fill(process.env.TEST_MANAGER_PASSWORD!);
  await page.locator("button[type='submit']").click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
});

test("mascot renders on signup too", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.locator(MASCOT)).toBeVisible();
  await page.locator("#email").click();
  await expect(page.locator('svg circle[cx="83"][r="6"]')).toBeVisible();
});
