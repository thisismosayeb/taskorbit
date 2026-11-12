// TaskOrbit Part 3 — Playwright E2E (Track D, spec §11).
// Base URL defaults to the local dev server (stable); the public tunnel
// is only used for the explicit tunnel check. Credentials come from the
// environment (TEST_MANAGER_EMAIL etc.) — never hardcode them here.
import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "tests/e2e/results.json" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
