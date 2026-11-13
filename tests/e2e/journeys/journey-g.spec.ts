// TaskOrbit Part 4, spec §4 — FINAL QA Journey G (AI, no key).
//
// No Gemini API key exists (and none is faked here), so the expected
// state on staging AND locally is the not-configured state:
// "TaskOrbit AI is not configured yet". This journey asserts that state
// on the AI page and on the dashboard AI card, and asserts that no AI
// generation is attempted — zero network requests to any Gemini endpoint
// while the pages load and sit idle.
//
// This is the NOT TESTED counterpart of spec §11.10 (AI with a key):
// that test stays NOT TESTED until a key is provided.
import { expect, test } from "@playwright/test";
import { authedPage, setLanguage } from "../helpers";

const GEMINI_HOSTS = /(generativelanguage\.googleapis\.com|gemini\.googleapis\.com|aiplatform\.googleapis\.com)/;

test("Journey G — AI: not-configured state, no generation attempted", async ({ browser }) => {
  const page = await authedPage(browser, "manager");
  // Pin the language to English first: the assertions below check the
  // English copy, and the profile language may be Bangla if Journey F
  // died before its Light + English restore (its first run did exactly
  // that — the dashboard then renders "TaskOrbit AI এখনো কনফিগার করা
  // হয়নি" instead of the English title).
  await setLanguage(page, "English");
  const geminiRequests: string[] = [];
  page.on("request", (req) => {
    if (GEMINI_HOSTS.test(req.url())) geminiRequests.push(req.url());
  });
  try {
    await page.goto("/dashboard/ai");
    await expect(page.getByText("TaskOrbit AI is not configured yet")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/has not added a Gemini API key yet/i)).toBeVisible();
    // No error page, no error toast.
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    // No generate / ask button is offered while unconfigured.
    await expect(page.getByRole("button", { name: /generate|ask ai/i })).toHaveCount(0);
    console.log("[journey-g] /dashboard/ai shows the not-configured state, no generate control");

    // The dashboard's AI card shows the same state.
    await page.goto("/dashboard");
    await expect(page.getByText("TaskOrbit AI is not configured yet")).toBeVisible({ timeout: 30_000 });
    console.log("[journey-g] dashboard AI card shows the same not-configured state");

    // Let both pages sit idle; no Gemini request may fire at any point.
    await page.waitForTimeout(5_000);
    expect(
      geminiRequests,
      `no request to any Gemini endpoint was made (saw ${geminiRequests.length})`,
    ).toEqual([]);
    console.log("[journey-g] PASS — 0 Gemini requests observed");
  } finally {
    await page.context().close();
  }
});
