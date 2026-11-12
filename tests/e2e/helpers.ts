// Shared Playwright helpers for the TaskOrbit E2E suite (Part 3, spec §11).
// Credentials are read from the environment only — never from a file.
import { expect, type Browser, type Page } from "@playwright/test";

export type TestRole = "manager" | "developer";

/** A page in a context restored from the minted storage state (no form login). */
export async function authedPage(
  browser: Browser,
  role: TestRole,
  viewport?: { width: number; height: number },
): Promise<Page> {
  const ctx = await browser.newContext({
    storageState: `tests/e2e/.auth/${role}.json`,
    ...(viewport ? { viewport } : {}),
  });
  const page = await ctx.newPage();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  return page;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} — export it before running the E2E suite.`);
  return value;
}

export function credentials(role: TestRole): { email: string; password: string } {
  if (role === "manager") {
    return { email: env("TEST_MANAGER_EMAIL"), password: env("TEST_MANAGER_PASSWORD") };
  }
  return { email: env("TEST_DEVELOPER_EMAIL"), password: env("TEST_DEVELOPER_PASSWORD") };
}

/** Log in through the real login form and land on the dashboard. The
 * submit button is matched by type, not by label, because its label is
 * translated (Bangla: "লগইন"). */
export async function loginAs(page: Page, role: TestRole): Promise<void> {
  const { email, password } = credentials(role);
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("button[type='submit']").click();
  await expect(page).toHaveURL(/\/dashboard(\?.*)?$/, { timeout: 30_000 });
  // waitForURL returns as soon as the URL changes, but the dashboard
  // document (and React hydration) can still be loading on the slow dev
  // server — interacting before hydration silently drops the click (the
  // button focuses but its onClick is not attached yet). Wait for load.
  await page.waitForLoadState("load");
}

/** Open the theme switcher and pick Light / Dark / System. */
export async function setTheme(page: Page, theme: "Light" | "Dark" | "System"): Promise<void> {
  const item = page.getByRole("menuitemradio", { name: new RegExp(`^${theme}$`, "i") });
  await page.locator("[data-theme-switcher]").click();
  try {
    await item.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    // The first click may have landed before hydration attached the
    // handler (slow dev server, fresh login) — the button focuses but
    // the menu never opens. Click once more, then wait properly.
    await page.locator("[data-theme-switcher]").click();
    await item.waitFor({ state: "visible", timeout: 30_000 });
  }
  await item.click();
}

/** Open the language switcher and pick English / বাংলা. */
export async function setLanguage(page: Page, language: "English" | "বাংলা"): Promise<void> {
  const item = page.getByRole("menuitemradio", { name: language });
  await page.locator("[data-language-switcher]").click();
  try {
    await item.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    // Same pre-hydration lost-click hazard as setTheme (see above).
    await page.locator("[data-language-switcher]").click();
    await item.waitFor({ state: "visible", timeout: 30_000 });
  }
  await item.click();
}

/** Resolved theme from <html>: "dark" when next-themes applied the dark class, else "light". */
export async function resolvedTheme(page: Page): Promise<"dark" | "light"> {
  return page.evaluate(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
}

/** Maximum horizontal overflow in pixels on the current page (0 = none). */
export async function horizontalOverflowPx(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}
