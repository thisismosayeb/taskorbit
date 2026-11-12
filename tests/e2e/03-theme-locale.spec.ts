// Spec §11.5 (theme) and §11.6 (Bangla) — Light / Dark / System on
// landing, auth and dashboard; EN / বাংলা on landing, auth and
// dashboard; half-filled forms keep their values; choices survive
// refresh and re-login.
//
// Authenticated parts use the minted storage state (see global-setup:
// the login action allows 5 attempts per 10 min per IP, so the suite
// must not log in through the form in every test). The two tests that
// must exercise a real form login (language login-transition, theme
// re-login) keep exactly one loginAs() each.
import { expect, test } from "@playwright/test";
import { authedPage, loginAs, resolvedTheme, setLanguage, setTheme } from "./helpers";

test("theme: Light -> Dark -> System on landing, auth and dashboard; survives refresh", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  // Baseline first: the profile may hold Dark from an earlier run, and
  // a fresh context resolves the dashboard theme from the profile — so
  // set Light explicitly before asserting the cycle.
  const dash0 = await authedPage(browser, "manager");
  await setTheme(dash0, "Light");
  // The save is fire-and-forget — let it land before closing, or the
  // profile keeps the previous run's value and the dashboard below
  // resolves Dark from it.
  await dash0.waitForTimeout(3_000);
  await dash0.context().close();

  await page.goto("/");
  await setTheme(page, "Dark");
  expect(await resolvedTheme(page)).toBe("dark");
  await page.reload();
  expect(await resolvedTheme(page), "dark survives refresh on landing").toBe("dark");

  await page.goto("/login");
  expect(await resolvedTheme(page), "dark carries to auth").toBe("dark");
  await setTheme(page, "Light");
  expect(await resolvedTheme(page)).toBe("light");

  const dash = await authedPage(browser, "manager");
  expect(await resolvedTheme(dash), "light carries to dashboard").toBe("light");
  await setTheme(dash, "Dark");
  expect(await resolvedTheme(dash)).toBe("dark");
  await dash.reload();
  expect(await resolvedTheme(dash), "dark survives refresh on dashboard").toBe("dark");
  await setTheme(dash, "System");
  await dash.reload();
  // System resolves to the OS preference; in this headless shell it is light.
  expect(await resolvedTheme(dash), "system resolves after refresh").toBe("light");
  // Leave the profile in Light so later runs start clean.
  await setTheme(dash, "Light");
});

test("theme survives re-login (saved to the profile)", async ({ browser }) => {
  // ctx1: an already-authenticated session sets Dark. The save is
  // fire-and-forget, so wait for the profile write to land before
  // closing — otherwise the re-login below races it.
  const page1 = await authedPage(browser, "manager");
  await setTheme(page1, "Dark");
  expect(await resolvedTheme(page1)).toBe("dark");
  await page1.waitForTimeout(3_000);
  await page1.context().close();

  // ctx2: a FRESH context + a real form login. localStorage is empty
  // there, so Dark can only come back from profiles.theme_preference.
  const page2 = await (await browser.newContext()).newPage();
  try {
    await loginAs(page2, "manager");
    expect(await resolvedTheme(page2), "dark survives re-login in a fresh context").toBe("dark");
    await setTheme(page2, "Light");
  } finally {
    await page2.context().close();
  }
});

test("language: EN -> Bangla on landing, auth and dashboard; survives refresh", async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await setLanguage(page, "বাংলা");
  await expect(page.getByText("ফিচার").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("ফিচার").first()).toBeVisible();

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /আবার স্বাগতম/ })).toBeVisible();
  // A real form login here: this is the transition the spec tests —
  // the pre-login Bangla choice must survive logging in.
  await loginAs(page, "manager");
  await expect(page.getByRole("heading", { name: "ড্যাশবোর্ড" }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "ড্যাশবোর্ড" }).first()).toBeVisible();
  await setLanguage(page, "English");
  await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
});

test("language switch keeps a half-filled login form intact", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#email").fill("half-filled@testorbit.dev");
  await page.locator("#password").fill("KeepMe123!");
  await setLanguage(page, "বাংলা");
  await expect(page.locator("#email")).toHaveValue("half-filled@testorbit.dev");
  await expect(page.locator("#password")).toHaveValue("KeepMe123!");
  await setLanguage(page, "English");
  await expect(page.locator("#email")).toHaveValue("half-filled@testorbit.dev");
  await expect(page.locator("#password")).toHaveValue("KeepMe123!");
});
