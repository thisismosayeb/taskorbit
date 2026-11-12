// Spec §11.1 (staging URL) — staging on Vercel is BLOCKED (no
// Vercel/GitHub connected), so this checks the public tunnel URL the
// dev server is exposed through instead. It is a smoke check only: the
// real suite runs against localhost (stable); the tunnel flaps.
import { expect, test } from "@playwright/test";

const TUNNEL_URL = process.env.PLAYWRIGHT_TUNNEL_URL ?? "https://shaggy-insect-87.loca.lt";

test("public tunnel URL serves the landing page and login", async ({ request }) => {
  const home = await request.get(`${TUNNEL_URL}/`, { timeout: 30_000 });
  expect(home.status(), `GET ${TUNNEL_URL}/ status`).toBe(200);
  const login = await request.get(`${TUNNEL_URL}/login`, { timeout: 30_000 });
  expect(login.status(), `GET ${TUNNEL_URL}/login status`).toBe(200);
  const body = await home.text();
  expect(body).toContain("TaskOrbit");
});
