// TaskOrbit demo seed — OWNER RUNS LOCALLY ONLY.
//
// Creates the demo workspace "Software Engineering Lab" (manager + 2
// developers, 3 projects, 15 tasks, 3 subtasks, 8 comments) in a Supabase
// project, using the SERVICE-ROLE key. It is never deployed and never
// imported by the app.
//
//   node scripts/seed-demo.ts [--env .env.demo.local] [--force]
//
// Credentials come ONLY from the env file (default `.env.demo.local`,
// git-ignored) or exported process env vars — see docs/DEMO_DATA.md.
// Missing credentials = hard failure, no defaults. No password is ever
// printed.
//
// Safety:
//   - Refuses to run twice: if a workspace named "Software Engineering Lab"
//     already exists, it stops unless `--force` is given (--force deletes
//     the old demo workspace first, after verifying the demo manager owns
//     it). Other workspaces are never touched.
//   - All dates are relative to today in Asia/Dhaka, so the deadline
//     states always render correctly (see scripts/demo-plan.ts).
//   - Insert order respects the DB triggers (docs/DECISIONS.md): parents
//     are created open, subtasks are created and completed first, and only
//     then could a parent be completed. The demo parent stays in_progress
//     at 2/3 subtasks (67%); completed tasks are inserted directly with
//     status "completed", so the trigger stamps completed_at = now().
//
// Requires Node >= 22.6 (type stripping runs this .ts file directly).
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Untyped service-role client (the scripts do not import the DB types). */
type DemoClient = SupabaseClient<any, "public", any>;
import {
  buildDemoPlan,
  dueDateForOffset,
  intendedDeadlineState,
  todayInTimezone,
  type DemoAssignee,
  type DemoPlan,
} from "./demo-plan.ts";
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
const TIMEZONE = "Asia/Dhaka";

const REQUIRED_VARS = [
  "DEMO_MANAGER_EMAIL",
  "DEMO_MANAGER_PASSWORD",
  "DEMO_DEV1_EMAIL",
  "DEMO_DEV1_PASSWORD",
  "DEMO_DEV2_EMAIL",
  "DEMO_DEV2_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

// Fictional demo display names (no real people). Shown in the UI as the
// profile full_name of each demo account.
const DISPLAY_NAMES: Record<DemoAssignee, string> = {
  manager: "Rahim Uddin",
  dev1: "Nusrat Jahan",
  dev2: "Tanvir Ahmed",
};

function slugFor(name: string): string {
  // Mirrors the create_workspace RPC: slugified name + short random suffix.
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "workspace"}-${randomBytes(3).toString("hex")}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), ["env", "force"]);
  const envPath = typeof args.env === "string" ? args.env : null;
  const env = loadDemoEnv(envPath);
  const cfg = requireEnv(
    env,
    REQUIRED_VARS,
    envPath ?? join(repoRoot(), DEMO_ENV_FILE_DEFAULT),
  );
  const force = args.force === true;

  const url = cfg.NEXT_PUBLIC_SUPABASE_URL;
  if (!/^https?:\/\//.test(url)) {
    fail(`NEXT_PUBLIC_SUPABASE_URL does not look like a URL: ${url}`);
  }
  const supabase = createClient(url, cfg.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const now = new Date();
  const today = todayInTimezone(TIMEZONE, now);
  console.log(`[demo] today in ${TIMEZONE}: ${today}`);
  console.log(`[demo] project: ${url}`);

  // -- 1. Demo users (create, or reuse the ones from a previous seed run).
  const userIds = await ensureUsers(supabase, cfg);

  // -- 2. Existing demo workspace? Refuse unless --force.
  const { data: existing, error: findError } = await supabase
    .from("workspaces")
    .select("id, created_by")
    .eq("name", WORKSPACE_NAME);
  if (findError) fail(`Could not check for an existing demo workspace: ${findError.message}`);
  if (existing && existing.length > 0) {
    if (existing.length > 1) {
      fail(
        `Found ${existing.length} workspaces named "${WORKSPACE_NAME}". ` +
          `Ambiguous — remove the extras by hand before seeding.`,
      );
    }
    if (!force) {
      fail(
        `Demo workspace "${WORKSPACE_NAME}" already exists (id ${existing[0].id}).\n` +
          `Refusing to seed twice. Run "node scripts/reset-demo.ts" first, ` +
          `or re-run with --force to delete it and re-seed.`,
      );
    }
    if (existing[0].created_by !== userIds.manager) {
      fail(
        `The existing workspace "${WORKSPACE_NAME}" is not owned by the demo ` +
          `manager (${cfg.DEMO_MANAGER_EMAIL}). Refusing to delete it — remove it by hand.`,
      );
    }
    console.log(`[demo] --force: deleting existing demo workspace ${existing[0].id} ...`);
    const { error: delError } = await supabase
      .from("workspaces")
      .delete()
      .eq("id", existing[0].id);
    if (delError) fail(`Could not delete the existing demo workspace: ${delError.message}`);
  }

  // -- 3. Workspace + members.
  const plan: DemoPlan = buildDemoPlan(now);
  const { data: workspace, error: wsError } = await supabase
    .from("workspaces")
    .insert({
      name: plan.workspace.name,
      slug: slugFor(plan.workspace.name),
      timezone: plan.workspace.timezone,
      created_by: userIds.manager,
    })
    .select("id")
    .single();
  if (wsError || !workspace) {
    fail(`Could not create the demo workspace: ${wsError?.message ?? "no row returned"}`);
  }
  const workspaceId = workspace.id as string;
  console.log(`[demo] workspace created: ${workspaceId}`);

  const members = [
    { workspace_id: workspaceId, user_id: userIds.manager, role: "manager" },
    { workspace_id: workspaceId, user_id: userIds.dev1, role: "developer" },
    { workspace_id: workspaceId, user_id: userIds.dev2, role: "developer" },
  ];
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert(members);
  if (memberError) fail(`Could not add workspace members: ${memberError.message}`);

  // -- 4. Projects, tasks, subtasks, comments.
  let taskCount = 0;
  let subtaskCount = 0;
  let commentCount = 0;
  const stateSummary: string[] = [];

  for (const project of plan.projects) {
    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        name: project.name,
        description: project.description,
        status: project.status,
        priority: project.priority,
        start_date: today,
        due_date: dueDateForOffset(project.dueOffsetDays, TIMEZONE, now),
        created_by: userIds.manager,
      })
      .select("id")
      .single();
    if (projectError || !projectRow) {
      fail(`Could not create project "${project.name}": ${projectError?.message ?? "no row returned"}`);
    }
    const projectId = projectRow.id as string;
    let position = 0;

    for (const task of project.tasks) {
      // Parent first, in its final NON-completed state if it has subtasks
      // (the demo parent stays in_progress at 2/3). Top-level tasks with
      // no subtasks are inserted directly with their final status — the
      // maintain_completed_at() trigger stamps completed_at = now(), which
      // is what makes green (due in the future) vs amber (due in the past)
      // correct.
      const { data: taskRow, error: taskError } = await supabase
        .from("tasks")
        .insert({
          project_id: projectId,
          title: task.title,
          description: task.description,
          assigned_to: userIds[task.assignee],
          created_by: userIds.manager,
          status: task.status,
          priority: task.priority,
          due_date: dueDateForOffset(task.dueOffsetDays, TIMEZONE, now),
          position: position++,
        })
        .select("id")
        .single();
      if (taskError || !taskRow) {
        fail(`Could not create task "${task.title}": ${taskError?.message ?? "no row returned"}`);
      }
      const taskId = taskRow.id as string;
      taskCount++;
      stateSummary.push(
        `  ${task.status === "completed" ? "✓" : "•"} ${task.title} — ${intendedDeadlineState(task)}`,
      );

      // Subtasks second: the trigger copies assigned_to from the parent,
      // so it is deliberately NOT set here. Completed subtasks are
      // inserted completed; the parent is never completed while any
      // subtask is open (block_parent_completion trigger).
      for (const subtask of task.subtasks ?? []) {
        const { data: subRow, error: subError } = await supabase
          .from("tasks")
          .insert({
            project_id: projectId,
            parent_task_id: taskId,
            title: subtask.title,
            description: subtask.description,
            created_by: userIds.manager,
            status: subtask.status,
            priority: subtask.priority,
            due_date: dueDateForOffset(subtask.dueOffsetDays, TIMEZONE, now),
            position: position++,
          })
          .select("id")
          .single();
        if (subError || !subRow) {
          fail(`Could not create subtask "${subtask.title}": ${subError?.message ?? "no row returned"}`);
        }
        subtaskCount++;
      }

      commentCount += await addComments(
        supabase,
        taskId,
        (task.comments ?? []).map((c) => ({
          author_id: userIds[c.author],
          content: c.content,
        })),
      );
    }
    console.log(`[demo] project created: ${project.name} (${project.tasks.length} tasks)`);
  }

  console.log(`
[demo] DONE — demo data seeded.
  Workspace : ${WORKSPACE_NAME} (${workspaceId})
  Manager   : ${cfg.DEMO_MANAGER_EMAIL} (${DISPLAY_NAMES.manager})
  Developer : ${cfg.DEMO_DEV1_EMAIL} (${DISPLAY_NAMES.dev1})
  Developer : ${cfg.DEMO_DEV2_EMAIL} (${DISPLAY_NAMES.dev2})
  Projects  : ${plan.projects.length}
  Tasks     : ${taskCount} top-level + ${subtaskCount} subtasks
  Comments  : ${commentCount}

  Deadline states in the demo (relative to today, ${today} ${TIMEZONE}):
${stateSummary.join("\n")}

  Highlights to show in the demo:
  - "Capstone: TaskOrbit MVP" is at 75% (3 of 4 top-level tasks completed).
  - "Implement the task board" is at 67% (2 of 3 subtasks completed).
  - Green / red / amber / neutral / no-deadline are all present above.

  Log in with the emails above and the passwords from ${envPath ?? DEMO_ENV_FILE_DEFAULT}.
  To remove everything again: node scripts/reset-demo.ts
`);
}

async function addComments(
  supabase: DemoClient,
  taskId: string,
  comments: { author_id: string; content: string }[],
): Promise<number> {
  if (comments.length === 0) return 0;
  const { error } = await supabase.from("comments").insert(
    comments.map((c) => ({ task_id: taskId, author_id: c.author_id, content: c.content })),
  );
  if (error) fail(`Could not add comments on task ${taskId}: ${error.message}`);
  return comments.length;
}

async function ensureUsers(
  supabase: DemoClient,
  cfg: Record<string, string>,
): Promise<Record<DemoAssignee, string>> {
  const specs: { key: DemoAssignee; email: string; password: string }[] = [
    { key: "manager", email: cfg.DEMO_MANAGER_EMAIL, password: cfg.DEMO_MANAGER_PASSWORD },
    { key: "dev1", email: cfg.DEMO_DEV1_EMAIL, password: cfg.DEMO_DEV1_PASSWORD },
    { key: "dev2", email: cfg.DEMO_DEV2_EMAIL, password: cfg.DEMO_DEV2_PASSWORD },
  ];
  const ids = {} as Record<DemoAssignee, string>;
  for (const spec of specs) {
    ids[spec.key] = await ensureUser(supabase, spec.email, spec.password, DISPLAY_NAMES[spec.key]);
  }
  return ids;
}

async function findUserByEmail(
  supabase: DemoClient,
  email: string,
): Promise<string | null> {
  // Small demo scale: one page of users is enough. (listUsers is
  // paginated; a production-size directory would need a loop.)
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) fail(`Could not list auth users: ${error.message}`);
  const found = (data?.users ?? []).find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  return found ? found.id : null;
}

async function ensureUser(
  supabase: DemoClient,
  email: string,
  password: string,
  fullName: string,
): Promise<string> {
  const existing = await findUserByEmail(supabase, email);
  if (existing) {
    console.log(
      `[demo] reusing existing auth user ${email} (password unchanged — ` +
        `use the password from the first seed run).`,
    );
    return existing;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    fail(`Could not create auth user ${email}: ${error?.message ?? "no user returned"}`);
  }
  console.log(`[demo] auth user created: ${email}`);
  return data.user.id;
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
