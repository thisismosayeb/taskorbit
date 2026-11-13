// TaskOrbit demo reset — OWNER RUNS LOCALLY ONLY.
//
// Deletes ONLY the demo workspace "Software Engineering Lab" (matched by
// exact name, and only if the demo manager from the env file owns it) and
// everything under it — projects, tasks, subtasks, comments, activity,
// notifications, memberships — via the ON DELETE CASCADE foreign keys.
// It never touches any other workspace.
//
//   node scripts/reset-demo.ts [--env .env.demo.local]
//
// Credentials come ONLY from the env file (default `.env.demo.local`,
// git-ignored) or exported process env vars — see docs/DEMO_DATA.md.
// Only the Supabase URL, the service-role key and the demo manager's email
// are needed (the manager's email is used to verify ownership before
// deleting). The demo auth users are deliberately NOT deleted: they are
// reused by the next seed run, so the documented passwords keep working.
//
// Requires Node >= 22.6 (type stripping runs this .ts file directly).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Untyped service-role client (the scripts do not import the DB types). */
type DemoClient = SupabaseClient<any, "public", any>;
import {
  DEMO_ENV_FILE_DEFAULT,
  fail,
  loadDemoEnv,
  parseArgs,
  repoRoot,
  requireEnv,
} from "./demo-env.ts";
import { join } from "node:path";

const WORKSPACE_NAME = "Software Engineering Lab";

const REQUIRED_VARS = [
  "DEMO_MANAGER_EMAIL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), ["env"]);
  const envPath = typeof args.env === "string" ? args.env : null;
  const env = loadDemoEnv(envPath);
  const cfg = requireEnv(
    env,
    REQUIRED_VARS,
    envPath ?? join(repoRoot(), DEMO_ENV_FILE_DEFAULT),
  );

  const url = cfg.NEXT_PUBLIC_SUPABASE_URL;
  if (!/^https?:\/\//.test(url)) {
    fail(`NEXT_PUBLIC_SUPABASE_URL does not look like a URL: ${url}`);
  }
  const supabase = createClient(url, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve the demo manager's user id (ownership check for the delete).
  const { data: users, error: listError } =
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) fail(`Could not list auth users: ${listError.message}`);
  const manager = (users?.users ?? []).find(
    (u) => u.email?.toLowerCase() === cfg.DEMO_MANAGER_EMAIL.toLowerCase(),
  );
  if (!manager) {
    fail(
      `Demo manager ${cfg.DEMO_MANAGER_EMAIL} has no auth user in this project — ` +
        `nothing to verify ownership against, so refusing to delete anything.`,
    );
  }

  // Find the demo workspace by exact name.
  const { data: found, error: findError } = await supabase
    .from("workspaces")
    .select("id, created_by")
    .eq("name", WORKSPACE_NAME);
  if (findError) fail(`Could not look up the demo workspace: ${findError.message}`);
  if (!found || found.length === 0) {
    console.log(`[demo] No workspace named "${WORKSPACE_NAME}" — nothing to remove.`);
    return;
  }
  if (found.length > 1) {
    fail(
      `Found ${found.length} workspaces named "${WORKSPACE_NAME}". ` +
        `Ambiguous — remove the extras by hand before resetting.`,
    );
  }
  const workspace = found[0];
  if (workspace.created_by !== manager.id) {
    fail(
      `The workspace "${WORKSPACE_NAME}" is not owned by the demo manager ` +
        `(${cfg.DEMO_MANAGER_EMAIL}). Refusing to delete it — it is not the demo data.`,
    );
  }

  // Delete the workspace row; cascades remove projects, tasks, subtasks,
  // comments, activity, notifications and memberships.
  const { error: deleteError } = await supabase
    .from("workspaces")
    .delete()
    .eq("id", workspace.id);
  if (deleteError) fail(`Could not delete the demo workspace: ${deleteError.message}`);

  console.log(`
[demo] DONE — removed the demo workspace "${WORKSPACE_NAME}" (${workspace.id})
and everything under it (projects, tasks, subtasks, comments, activity,
notifications, memberships) via cascade.

  No other workspace was touched.
  The demo auth users were NOT deleted — re-run "node scripts/seed-demo.ts"
  to seed again with the same logins.
`);
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
