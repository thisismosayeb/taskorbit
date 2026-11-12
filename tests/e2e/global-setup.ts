// Playwright global setup: mint one authenticated session per role and
// save it as a storage state, so the suite does NOT log in through the
// form in every test.
//
// Why: the app's login action has an in-memory per-IP guard of 5 login
// attempts per 10 minutes (lib/auth/actions.ts — documented in
// docs/DECISIONS.md). A suite that logs in per test trips it and later
// logins hang on /login with "Too many login attempts". Minting here
// uses the Supabase Auth REST API directly (the same cookie format the
// @supabase/ssr client reads: "base64-" + base64url(session JSON)),
// exactly as the Part 2 analytics verification did. The two tests that
// must exercise the real form (mascot error/success, the language
// login-transition, the theme re-login) still use loginAs() and stay
// within the budget (4 form logins per full run).
//
// Supabase URL / publishable key come from PLAYWRIGHT_SUPABASE_URL /
// PLAYWRIGHT_SUPABASE_ANON_KEY when set, else from the app's .env.local
// (read-only; the publishable key is public by design). Test passwords
// come from the environment only — never from a file.
import { chromium, type FullConfig } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} — export it before running the E2E suite.`);
  return value;
}

function envFile(): Record<string, string> {
  try {
    const raw = readFileSync(path.resolve(__dirname, "..", "..", ".env.local"), "utf8");
    return Object.fromEntries(
      raw.split("\n").map((l) => {
        const i = l.indexOf("=");
        return i === -1 ? ["", ""] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
    );
  } catch {
    return {};
  }
}

async function signIn(supabaseUrl: string, anonKey: string, email: string, password: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`global-setup sign-in failed for ${email}: ${res.status}`);
  return res.json();
}

async function workspaceId(supabaseUrl: string, anonKey: string, session: { access_token: string; user: { id: string } }) {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/workspace_members?select=workspace_id&user_id=eq.${session.user.id}`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } },
  );
  const rows = (await res.json()) as { workspace_id: string }[];
  const ids = rows.map((r) => r.workspace_id);
  const res2 = await fetch(
    `${supabaseUrl}/rest/v1/workspaces?select=id,name&id=in.(${ids.join(",")})`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } },
  );
  const workspaces = (await res2.json()) as { id: string; name: string }[];
  const found = workspaces.find((w) => w.name === "Test Workspace") ?? workspaces[0];
  if (!found) throw new Error("global-setup: no workspace membership found");
  return found.id;
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const fileEnv = envFile();
  const supabaseUrl = process.env.PLAYWRIGHT_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.PLAYWRIGHT_SUPABASE_ANON_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!supabaseUrl || !anonKey) {
    throw new Error("global-setup: set PLAYWRIGHT_SUPABASE_URL/PLAYWRIGHT_SUPABASE_ANON_KEY or keep them in .env.local");
  }
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  const authDir = path.resolve(__dirname, ".auth");
  mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const [role, emailVar, passVar] of [
      ["manager", "TEST_MANAGER_EMAIL", "TEST_MANAGER_PASSWORD"],
      ["developer", "TEST_DEVELOPER_EMAIL", "TEST_DEVELOPER_PASSWORD"],
    ] as const) {
      const session = await signIn(supabaseUrl, anonKey, env(emailVar), env(passVar));
      const wsId = await workspaceId(supabaseUrl, anonKey, session);
      const cookieValue = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
      const ctx = await browser.newContext({ baseURL });
      await ctx.addCookies([
        { name: `sb-${ref}-auth-token`, value: cookieValue, domain: new URL(baseURL).hostname, path: "/" },
        { name: "taskorbit-workspace-id", value: wsId, domain: new URL(baseURL).hostname, path: "/" },
      ]);
      const page = await ctx.newPage();
      await page.goto("/dashboard");
      await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
      await ctx.storageState({ path: path.join(authDir, `${role}.json`) });
      await ctx.close();
      // eslint-disable-next-line no-console
      console.log(`[global-setup] ${role} session minted (${session.user.email})`);
    }
  } finally {
    await browser.close();
  }
}
