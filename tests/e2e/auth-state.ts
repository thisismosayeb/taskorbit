// Shared Auth-REST minting for the Playwright E2E suite (Part 4).
//
// A minted storage state is SINGLE-USE: Supabase rotates the refresh
// token when a session is used, so a second browser context restored
// from the same minted tests/e2e/.auth/*.json file is rejected — proven
// on staging runs, where tests 2–3 in a spec file failed while test 1
// passed. authedPage therefore mints a FRESH session per context via
// the Supabase Auth REST API (the same password-grant endpoint
// global-setup uses), instead of reading the shared files. Nothing
// loads tests/e2e/.auth/*.json at test time; the files global-setup
// writes remain a one-per-run artifact and an early env check.
//
// Volume: one password-grant sign-in per authedPage call (~26 for a
// full run) — far inside Supabase's /auth/v1/token limit of 150
// requests per 5 minutes per IP — and it never touches the app's login
// form, so the 5-logins-per-10-minutes in-memory guard
// (lib/auth/actions.ts) is not involved.
//
// Supabase URL / publishable key come from PLAYWRIGHT_SUPABASE_URL /
// PLAYWRIGHT_SUPABASE_ANON_KEY when set, else from the app's .env.local
// (read-only; the publishable key is public by design). Test passwords
// come from the environment only — never from a file.
import { readFileSync } from "node:fs";
import path from "node:path";

export type TestRole = "manager" | "developer";

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

export function supabaseConfig(): { url: string; anonKey: string } {
  const fileEnv = envFile();
  const url = process.env.PLAYWRIGHT_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.PLAYWRIGHT_SUPABASE_ANON_KEY ?? fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (!url || !anonKey) {
    throw new Error("auth-state: set PLAYWRIGHT_SUPABASE_URL/PLAYWRIGHT_SUPABASE_ANON_KEY or keep them in .env.local");
  }
  return { url, anonKey };
}

export function credentials(role: TestRole): { email: string; password: string } {
  if (role === "manager") {
    return { email: env("TEST_MANAGER_EMAIL"), password: env("TEST_MANAGER_PASSWORD") };
  }
  return { email: env("TEST_DEVELOPER_EMAIL"), password: env("TEST_DEVELOPER_PASSWORD") };
}

export async function signIn(supabaseUrl: string, anonKey: string, email: string, password: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`auth-state sign-in failed for ${email}: ${res.status}`);
  return res.json();
}

export async function workspaceId(supabaseUrl: string, anonKey: string, session: { access_token: string; user: { id: string } }) {
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
  if (!found) throw new Error("auth-state: no workspace membership found");
  return found.id;
}

/**
 * Mint a fresh, single-use storage state for ONE browser context:
 * the Supabase session cookie (same "base64-" + base64url(session JSON)
 * format the @supabase/ssr client reads) plus the workspace cookie.
 * Never reuse the returned state in a second context — the refresh
 * token inside it is rotated on first use and a reused copy is
 * rejected by Supabase.
 */
export async function mintStorageState(role: TestRole, baseURL: string) {
  const { url, anonKey } = supabaseConfig();
  const { email, password } = credentials(role);
  const session = await signIn(url, anonKey, email, password);
  const wsId = await workspaceId(url, anonKey, session);
  const ref = new URL(url).hostname.split(".")[0];
  const cookieValue = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const domain = new URL(baseURL).hostname;
  // Session cookies (expires -1): the same shape browser.newContext()
  // accepts for storageState; secure must stay false — the dev/staging
  // baseURL is plain http.
  const cookie = (name: string, value: string) => ({
    name,
    value,
    domain,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  });
  return {
    cookies: [cookie(`sb-${ref}-auth-token`, cookieValue), cookie("taskorbit-workspace-id", wsId)],
    origins: [],
  };
}
