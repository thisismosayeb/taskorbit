// Spec §11.9 (AI without key -> "not configured") and §11.11 (cron
// endpoint: 401 without/wrong secret, runs with the secret, second run
// the same day sends no duplicates). Test §11.10 (AI with key) is NOT
// TESTED — no Gemini key was provided; it is not faked here.
import { expect, test, type APIRequestContext } from "@playwright/test";
import { authedPage } from "./helpers";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

test("AI without key shows the not-configured state, no errors", async ({ browser }) => {
  const page = await authedPage(browser, "manager");
  await page.goto("/dashboard/ai");
  await expect(page.getByText("TaskOrbit AI is not configured yet")).toBeVisible();
  await expect(page.getByText(/has not added a Gemini API key yet/i)).toBeVisible();
  // No error toast / error page.
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  // The dashboard's AI card shows the same state.
  await page.goto("/dashboard");
  await expect(page.getByText("TaskOrbit AI is not configured yet")).toBeVisible();
});

async function cronGet(request: APIRequestContext, secret?: string) {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers.Authorization = `Bearer ${secret}`;
  return request.get("/api/cron/daily", { headers });
}

test("cron endpoint: 401 without/wrong secret; runs with the secret; second run same day", async ({
  request,
}) => {
  test.skip(!CRON_SECRET, "CRON_SECRET is not set in the test environment");

  const noAuth = await cronGet(request);
  expect(noAuth.status(), "no secret -> 401").toBe(401);

  const wrong = await cronGet(request, "definitely-not-the-cron-secret");
  expect(wrong.status(), "wrong secret -> 401").toBe(401);

  // Migration 0007 is NOT applied to the test project, so the reminders
  // RPC does not exist: the route must still answer 200 with the
  // failure isolated (reminders.failed = 1), not crash.
  const first = await cronGet(request, CRON_SECRET);
  expect(first.status(), "right secret -> 200").toBe(200);
  const firstBody = await first.json();
  console.log(`[e2e cron] first run: ${JSON.stringify(firstBody)}`);
  expect(firstBody.ok).toBe(true);
  expect(firstBody.reminders.failed).toBe(1);

  const second = await cronGet(request, CRON_SECRET);
  expect(second.status(), "second run same day -> 200").toBe(200);
  const secondBody = await second.json();
  console.log(`[e2e cron] second run: ${JSON.stringify(secondBody)}`);
  expect(secondBody.ok).toBe(true);
  // No duplicate notifications can be created while the reminders job
  // itself cannot run (no RPC): both runs report the same isolated
  // failure and zero due-soon/overdue deliveries.
  expect(secondBody.reminders.dueSoon).toBe(0);
  expect(secondBody.reminders.overdue).toBe(0);
});
