// TaskOrbit Part 4, spec §4 — FINAL QA Journey F (Preferences).
//
// Dark / Light and English / বাংলা survive a refresh (and are saved to
// the profile), and the mobile navigation works at 375 px.
//
// Runs as the minted manager; leaves the profile in Light + English so
// later runs start clean.
import { expect, test } from "@playwright/test";
import { authedPage, horizontalOverflowPx, resolvedTheme, setLanguage, setTheme } from "../helpers";

test("Journey F — Preferences: theme + language survive refresh; mobile nav at 375px", async ({
  browser,
}) => {
  const page = await authedPage(browser, "manager");
  try {
    // Dark + Bangla, then refresh: both must survive.
    await setTheme(page, "Dark");
    expect(await resolvedTheme(page)).toBe("dark");
    await setLanguage(page, "বাংলা");
    await expect(page.getByRole("heading", { name: "ড্যাশবোর্ড" }).first()).toBeVisible();
    await page.reload();
    await page.waitForLoadState("load");
    expect(await resolvedTheme(page), "dark survives refresh").toBe("dark");
    await expect(page.getByRole("heading", { name: "ড্যাশবোর্ড" }).first()).toBeVisible({
      timeout: 30_000,
    });
    console.log("[journey-f] dark + Bangla survived refresh");

    // Back to Light + English, then refresh: both must survive.
    await setTheme(page, "Light");
    expect(await resolvedTheme(page)).toBe("light");
    await setLanguage(page, "English");
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
    await page.reload();
    await page.waitForLoadState("load");
    expect(await resolvedTheme(page), "light survives refresh").toBe("light");
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible({
      timeout: 30_000,
    });
    console.log("[journey-f] light + English survived refresh");
  } finally {
    await page.context().close();
  }

  // Mobile navigation at 375 px: the menu opens, the nav links are
  // reachable, and the page has no horizontal overflow.
  const mobile = await authedPage(browser, "manager", { width: 375, height: 667 });
  try {
    await mobile.goto("/dashboard");
    await expect(mobile.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible({
      timeout: 30_000,
    });
    const overflow = await horizontalOverflowPx(mobile);
    expect(overflow, "no horizontal overflow at 375px").toBe(0);
    await mobile.getByLabel(/open menu/i).click();
    await expect(mobile.getByRole("dialog", { name: /navigation menu/i })).toBeVisible();
    await expect(mobile.getByRole("link", { name: "Board" }).first()).toBeVisible();
    await mobile.getByRole("link", { name: "Board" }).first().click();
    await expect(mobile).toHaveURL(/\/dashboard\/board/);
    await expect(mobile.getByRole("heading", { name: "Board" })).toBeVisible({ timeout: 30_000 });
    expect(await horizontalOverflowPx(mobile), "no horizontal overflow on board at 375px").toBe(0);
    console.log("[journey-f] mobile 375px: menu opens, Board reachable, 0px overflow");
    console.log("[journey-f] PASS");
  } finally {
    await mobile.context().close();
  }
});
