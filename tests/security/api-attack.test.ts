/**
 * TaskOrbit Part 2 — security / API-attack tests.
 *
 * Runs against the live Supabase TEST project (taskorbit-test) ONLY, with the
 * publishable key and REAL test logins. Never run against production.
 *
 * What it does: signs in as the manager and the developer, builds throwaway
 * fixtures (second developer accounts, a second workspace, fresh tasks) via
 * the public API, then attacks the database directly with
 * @supabase/supabase-js — bypassing the UI entirely — and asserts the RLS
 * policies / triggers from supabase/migrations/0001_init.sql + 0002_rpc.sql
 * reject what the UI merely hides.
 *
 * Credentials come ONLY from .env.test.local (gitignored). No password is
 * hard-coded here. Run with `npm run test:security`. The default `npm test`
 * does NOT run this file (see vitest.config.ts).
 *
 * Every case logs its ACTUAL response (error code/message or row count) so
 * the run output is the evidence. Mutating the TEST project is expected:
 * fixture tasks / invites / a second workspace are left behind on purpose.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// .env.test.local — parsed by hand so the test never depends on Vite's
// dotenv loading. Fails loudly if the file or a key is missing.
// ---------------------------------------------------------------------------
function loadTestEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.test.local");
  if (!existsSync(envPath)) {
    throw new Error(
      "Missing .env.test.local at repo root. Copy the template from the " +
        "task brief: NEXT_PUBLIC_SUPABASE_URL, " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, TEST_MANAGER_* and " +
        "TEST_DEVELOPER_* credentials for the TEST project only.",
    );
  }
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "TEST_MANAGER_EMAIL",
    "TEST_MANAGER_PASSWORD",
    "TEST_DEVELOPER_EMAIL",
    "TEST_DEVELOPER_PASSWORD",
    "TEST_DEV2_EMAIL",
    "TEST_DEV2_PASSWORD",
    "TEST_DEV3_EMAIL",
    "TEST_DEV3_PASSWORD",
    "TEST_DEV4_EMAIL",
    "TEST_DEV4_PASSWORD",
  ]) {
    if (!env[key]) throw new Error(`.env.test.local is missing ${key}`);
  }
  return env;
}

const env = loadTestEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function authedClient(): SupabaseClient {
  // No session persistence: each client just holds its own in-memory token.
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Sign up, or sign in when the account already exists (re-runs). */
async function ensureAccount(
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = authedClient();
  const { data: signUp, error: signUpError } = await client.auth.signUp({
    email,
    password,
  });
  if (signUp.session && signUp.user) {
    return { client, userId: signUp.user.id };
  }
  if (signUpError && !/already registered/i.test(signUpError.message)) {
    throw new Error(`signUp ${email} failed: ${signUpError.message}`);
  }
  // Account exists (or email confirmation left no session): sign in.
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(
      `signIn ${email} failed: ${error?.message ?? "no user returned"}` +
        (signUpError ? ` (signUp said: ${signUpError.message})` : ""),
    );
  }
  return { client, userId: data.user.id };
}

async function signIn(
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = authedClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(`signIn ${email} failed: ${error?.message ?? "no user"}`);
  }
  return { client, userId: data.user.id };
}

function describeError(error: { code?: string; message: string } | null): string {
  if (!error) return "no error";
  return `code=${error.code ?? "?"} message="${error.message}"`;
}

function report(caseId: string, detail: string): void {
  // eslint-disable-next-line no-console
  console.log(`[CASE ${caseId}] ${detail}`);
}

// ---------------------------------------------------------------------------
// Fixtures (all in the TEST project only)
// ---------------------------------------------------------------------------
interface Fixtures {
  manager: SupabaseClient;
  managerId: string;
  dev1: SupabaseClient;
  dev1Id: string;
  dev2: SupabaseClient;
  dev2Id: string;
  dev3: SupabaseClient;
  dev3Id: string;
  dev4: SupabaseClient;
  dev4Id: string;
  ws1Id: string;
  ws2Id: string;
  projectId: string;
  taskAId: string; // top-level, assigned to dev1 (cases d–g, r, s)
  taskBId: string; // top-level, assigned to dev2 (cases h, i)
  subtaskBId: string; // subtask of task B, assignee dev2 (case j)
  parentPId: string; // fresh parent, 1 open subtask (case q)
  subtaskPId: string;
  commentId: string; // manager comment on task A, in ws1 (case n)
  dev1NotificationId: string; // notification addressed to dev1 (case s)
}

const fx = {} as Fixtures;

beforeAll(async () => {
  const mgr = await signIn(env.TEST_MANAGER_EMAIL, env.TEST_MANAGER_PASSWORD);
  fx.manager = mgr.client;
  fx.managerId = mgr.userId;
  const d1 = await signIn(env.TEST_DEVELOPER_EMAIL, env.TEST_DEVELOPER_PASSWORD);
  fx.dev1 = d1.client;
  fx.dev1Id = d1.userId;

  // Second / third / fourth developers. Created on first run, signed into
  // on re-runs. None of them is a member of any workspace until invited.
  const d2 = await ensureAccount(env.TEST_DEV2_EMAIL, env.TEST_DEV2_PASSWORD);
  fx.dev2 = d2.client;
  fx.dev2Id = d2.userId;
  const d3 = await ensureAccount(env.TEST_DEV3_EMAIL, env.TEST_DEV3_PASSWORD);
  fx.dev3 = d3.client;
  fx.dev3Id = d3.userId;
  const d4 = await ensureAccount(env.TEST_DEV4_EMAIL, env.TEST_DEV4_PASSWORD);
  fx.dev4 = d4.client;
  fx.dev4Id = d4.userId;

  // Existing workspace + project from Part 1.
  const { data: ws1, error: wsErr } = await fx.manager
    .from("workspaces")
    .select("id")
    .eq("name", "Test Workspace")
    .single();
  if (wsErr || !ws1) throw new Error(`Test Workspace not found: ${describeError(wsErr)}`);
  fx.ws1Id = ws1.id;

  const { data: project, error: projErr } = await fx.manager
    .from("projects")
    .select("id")
    .eq("workspace_id", fx.ws1Id)
    .eq("name", "Website Redesign")
    .single();
  if (projErr || !project) {
    throw new Error(`Website Redesign project not found: ${describeError(projErr)}`);
  }
  fx.projectId = project.id;

  // Second workspace, created by the manager via the app's RPC.
  const { data: ws2Id, error: ws2Err } = await fx.manager.rpc("create_workspace", {
    p_name: "Security Test Workspace 2",
  });
  if (ws2Err || !ws2Id) {
    throw new Error(`create_workspace failed: ${describeError(ws2Err)}`);
  }
  fx.ws2Id = ws2Id as string;
  report("setup", `ws2 created: ${fx.ws2Id}`);

  // Invite helper: mirrors lib/actions/team.ts — random 32-byte hex token,
  // only its SHA-256 hex hash is stored.
  async function inviteAndAccept(
    workspaceId: string,
    email: string,
    invitee: SupabaseClient,
  ): Promise<void> {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { error: insErr } = await fx.manager.from("workspace_invitations").insert({
      workspace_id: workspaceId,
      invited_email: email,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (insErr) throw new Error(`invite ${email} failed: ${describeError(insErr)}`);
    const { error: accErr } = await invitee.rpc("accept_invitation", {
      p_token: token,
    });
    if (accErr) throw new Error(`accept_invitation ${email} failed: ${describeError(accErr)}`);
  }

  // dev2 joins ws1 (needed so the manager can assign task B to them).
  await inviteAndAccept(fx.ws1Id, env.TEST_DEV2_EMAIL, fx.dev2);
  // dev3 joins ws2 ONLY — never ws1 (needed for cross-workspace case n).
  await inviteAndAccept(fx.ws2Id, env.TEST_DEV3_EMAIL, fx.dev3);
  report("setup", "dev2 member of ws1; dev3 member of ws2 only");

  async function managerCreateTask(row: Record<string, unknown>): Promise<string> {
    const { data, error } = await fx.manager
      .from("tasks")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`fixture task insert failed: ${describeError(error)} — ${JSON.stringify(row)}`);
    }
    return data.id as string;
  }

  fx.taskAId = await managerCreateTask({
    project_id: fx.projectId,
    title: "SEC-TEST Task A (dev1)",
    assigned_to: fx.dev1Id,
    status: "todo",
  });
  fx.taskBId = await managerCreateTask({
    project_id: fx.projectId,
    title: "SEC-TEST Task B (dev2)",
    assigned_to: fx.dev2Id,
    status: "todo",
  });
  // Subtask of B; assigned_to is copied from the parent by validate_task().
  fx.subtaskBId = await managerCreateTask({
    project_id: fx.projectId,
    parent_task_id: fx.taskBId,
    title: "SEC-TEST Subtask B1 (dev2)",
    status: "todo",
  });
  fx.parentPId = await managerCreateTask({
    project_id: fx.projectId,
    title: "SEC-TEST Parent P (case q)",
    assigned_to: fx.managerId,
    status: "todo",
  });
  fx.subtaskPId = await managerCreateTask({
    project_id: fx.projectId,
    parent_task_id: fx.parentPId,
    title: "SEC-TEST Subtask P1 (open)",
    status: "todo",
  });

  const { data: comment, error: cErr } = await fx.manager
    .from("comments")
    .insert({ task_id: fx.taskAId, content: "SEC-TEST comment in ws1" })
    .select("id")
    .single();
  if (cErr || !comment) throw new Error(`fixture comment failed: ${describeError(cErr)}`);
  fx.commentId = comment.id as string;

  // The assignment of task A writes a notification for dev1 (trigger
  // notify_on_task_assigned). Control-check the fixture exists.
  const { data: notifs, error: nErr } = await fx.dev1
    .from("notifications")
    .select("id")
    .eq("recipient_id", fx.dev1Id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (nErr || !notifs || notifs.length === 0) {
    throw new Error(`no notification for dev1 found: ${describeError(nErr)}`);
  }
  fx.dev1NotificationId = notifs[0].id as string;
  report(
    "setup",
    `fixtures ready: taskA=${fx.taskAId} taskB=${fx.taskBId} subtaskB=${fx.subtaskBId} parentP=${fx.parentPId} comment=${fx.commentId} dev1Notif=${fx.dev1NotificationId}`,
  );
}, 180_000);

// ---------------------------------------------------------------------------
// Cases a–c: developer vs projects (policies projects_insert/update/delete_manager)
// ---------------------------------------------------------------------------
describe("a–c. developer cannot write projects", () => {
  it("a. developer insert project is rejected", async () => {
    const { data, error } = await fx.dev1.from("projects").insert({
      workspace_id: fx.ws1Id,
      name: "SEC-ATTACK project",
    });
    report("a", `insert project as dev → ${describeError(error)}; data=${JSON.stringify(data)}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/row-level security/i);
  });

  it("b. developer update project is rejected (0 rows)", async () => {
    const { data, error } = await fx.dev1
      .from("projects")
      .update({ name: "SEC-ATTACK renamed" })
      .eq("id", fx.projectId)
      .select("id");
    report("b", `update project as dev → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    const { data: after } = await fx.manager
      .from("projects")
      .select("name")
      .eq("id", fx.projectId)
      .single();
    expect(after?.name).toBe("Website Redesign");
  });

  it("c. developer delete project is rejected (0 rows)", async () => {
    const { data, error } = await fx.dev1
      .from("projects")
      .delete()
      .eq("id", fx.projectId)
      .select("id");
    report("c", `delete project as dev → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    const { data: after } = await fx.manager
      .from("projects")
      .select("id")
      .eq("id", fx.projectId)
      .single();
    expect(after?.id).toBe(fx.projectId);
  });
});

// ---------------------------------------------------------------------------
// Cases d–g: developer vs their OWN assigned top-level task
// (policy tasks_update lets the attempt through; trigger
// enforce_developer_task_update enforces the field rules)
// ---------------------------------------------------------------------------
describe("d–g. developer vs own assigned top-level task", () => {
  it("d. developer cannot update title of own assigned task", async () => {
    const { data, error } = await fx.dev1
      .from("tasks")
      .update({ title: "SEC-ATTACK title" })
      .eq("id", fx.taskAId)
      .select("id");
    report("d", `update own task title as dev → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
    expect(error?.message).toMatch(/only change the status/i);
    const { data: after } = await fx.manager
      .from("tasks")
      .select("title")
      .eq("id", fx.taskAId)
      .single();
    expect(after?.title).toBe("SEC-TEST Task A (dev1)");
  });

  it("e. developer cannot update due_date of own assigned task", async () => {
    const { data, error } = await fx.dev1
      .from("tasks")
      .update({ due_date: "2030-01-01" })
      .eq("id", fx.taskAId)
      .select("id");
    report("e", `update own task due_date as dev → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
    expect(error?.message).toMatch(/only change the status/i);
    const { data: after } = await fx.manager
      .from("tasks")
      .select("due_date")
      .eq("id", fx.taskAId)
      .single();
    expect(after?.due_date).toBeNull();
  });

  it("f. developer cannot update assigned_to of own assigned task", async () => {
    const { data, error } = await fx.dev1
      .from("tasks")
      .update({ assigned_to: fx.dev2Id })
      .eq("id", fx.taskAId)
      .select("id");
    report("f", `update own task assigned_to as dev → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
    expect(error?.message).toMatch(/only change the status/i);
    const { data: after } = await fx.manager
      .from("tasks")
      .select("assigned_to")
      .eq("id", fx.taskAId)
      .single();
    expect(after?.assigned_to).toBe(fx.dev1Id);
  });

  it("g. CONTROL: developer CAN update status of own assigned task", async () => {
    const { data, error } = await fx.dev1
      .from("tasks")
      .update({ status: "in_progress" })
      .eq("id", fx.taskAId)
      .select("id, status");
    report("g", `update own task status as dev → ${describeError(error)}; rows=${JSON.stringify(data)}`);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].status).toBe("in_progress");
  });
});

// ---------------------------------------------------------------------------
// Cases h–j: developer vs ANOTHER developer's task / subtask
// ---------------------------------------------------------------------------
describe("h–j. developer vs another developer's tasks", () => {
  it("h. developer cannot insert a subtask under someone else's task", async () => {
    const { data, error } = await fx.dev1.from("tasks").insert({
      project_id: fx.projectId,
      parent_task_id: fx.taskBId,
      title: "SEC-ATTACK subtask under dev2 task",
    });
    report("h", `insert subtask under dev2 task as dev1 → ${describeError(error)}; data=${JSON.stringify(data)}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/row-level security/i);
  });

  it("i. developer cannot update another developer's task (0 rows)", async () => {
    const { data, error } = await fx.dev1
      .from("tasks")
      .update({ title: "SEC-ATTACK dev2 task" })
      .eq("id", fx.taskBId)
      .select("id");
    report("i", `update dev2 task as dev1 → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    const { data: after } = await fx.manager
      .from("tasks")
      .select("title")
      .eq("id", fx.taskBId)
      .single();
    expect(after?.title).toBe("SEC-TEST Task B (dev2)");
  });

  it("j. developer cannot delete another developer's subtask (0 rows)", async () => {
    const { data, error } = await fx.dev1
      .from("tasks")
      .delete()
      .eq("id", fx.subtaskBId)
      .select("id");
    report("j", `delete dev2 subtask as dev1 → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    const { data: after } = await fx.manager
      .from("tasks")
      .select("id")
      .eq("id", fx.subtaskBId)
      .single();
    expect(after?.id).toBe(fx.subtaskBId);
  });
});

// ---------------------------------------------------------------------------
// Cases k–m: developer vs membership / invitations / own role
// ---------------------------------------------------------------------------
describe("k–m. developer cannot touch membership", () => {
  it("k. developer cannot insert into workspace_members", async () => {
    const { data, error } = await fx.dev1.from("workspace_members").insert({
      workspace_id: fx.ws1Id,
      user_id: fx.dev3Id,
      role: "developer",
    });
    report("k", `insert workspace_members as dev → ${describeError(error)}; data=${JSON.stringify(data)}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/row-level security/i);
  });

  it("l. developer cannot insert into workspace_invitations", async () => {
    const { data, error } = await fx.dev1.from("workspace_invitations").insert({
      workspace_id: fx.ws1Id,
      invited_email: "victim@example.com",
      token_hash: createHash("sha256").update("sec-attack-token").digest("hex"),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    report("l", `insert workspace_invitations as dev → ${describeError(error)}; data=${JSON.stringify(data)}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/row-level security/i);
  });

  it("m. developer cannot update own role to manager (0 rows)", async () => {
    const { data: ownRow } = await fx.manager
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", fx.ws1Id)
      .eq("user_id", fx.dev1Id)
      .single();
    expect(ownRow?.id).toBeTruthy();
    const { data, error } = await fx.dev1
      .from("workspace_members")
      .update({ role: "manager" })
      .eq("id", ownRow!.id as string)
      .select("id");
    report("m", `update own role to manager as dev → ${describeError(error)}; rows=${data?.length ?? "null"}`);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
    const { data: after } = await fx.manager
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", fx.ws1Id)
      .eq("user_id", fx.dev1Id)
      .single();
    expect(after?.role).toBe("developer");
  });
});

// ---------------------------------------------------------------------------
// Case n: cross-workspace isolation by exact UUID
// ---------------------------------------------------------------------------
describe("n. cross-workspace isolation", () => {
  it("n. user from ws2 sees 0 rows for ws1 project/task/comment by exact UUID", async () => {
    const { data: projects, error: pErr } = await fx.dev3
      .from("projects")
      .select("id")
      .eq("id", fx.projectId);
    const { data: tasks, error: tErr } = await fx.dev3
      .from("tasks")
      .select("id")
      .eq("id", fx.taskAId);
    const { data: comments, error: cErr } = await fx.dev3
      .from("comments")
      .select("id")
      .eq("id", fx.commentId);
    report(
      "n",
      `dev3 (ws2 only) select ws1 by UUID → projects=${projects?.length ?? "?"} (${describeError(pErr)}), ` +
        `tasks=${tasks?.length ?? "?"} (${describeError(tErr)}), ` +
        `comments=${comments?.length ?? "?"} (${describeError(cErr)})`,
    );
    expect(pErr).toBeNull();
    expect(tErr).toBeNull();
    expect(cErr).toBeNull();
    expect(projects).toHaveLength(0);
    expect(tasks).toHaveLength(0);
    expect(comments).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case o: manager assigns a task to a non-member
// ---------------------------------------------------------------------------
describe("o. assignee must be a workspace member", () => {
  it("o. manager cannot assign a task to a non-member (trigger error)", async () => {
    // dev3 exists in auth.users but is NOT a member of ws1.
    const { data, error } = await fx.manager.from("tasks").insert({
      project_id: fx.projectId,
      title: "SEC-ATTACK assign to non-member",
      assigned_to: fx.dev3Id,
      status: "todo",
    });
    report("o", `manager assigns task to non-member dev3 → ${describeError(error)}; data=${JSON.stringify(data)}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
    expect(error?.message).toMatch(/Assignee must be a member of the project's workspace\./);
    const { data: after } = await fx.manager
      .from("tasks")
      .select("id")
      .eq("title", "SEC-ATTACK assign to non-member");
    expect(after).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Case p: invitation token reuse
// ---------------------------------------------------------------------------
describe("p. invitation token reuse", () => {
  it("p. second accept of the same token is rejected", async () => {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { error: insErr } = await fx.manager.from("workspace_invitations").insert({
      workspace_id: fx.ws1Id,
      invited_email: env.TEST_DEV4_EMAIL,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(insErr).toBeNull();

    const { data: first, error: firstErr } = await fx.dev4.rpc("accept_invitation", {
      p_token: token,
    });
    report("p", `first accept → ${describeError(firstErr)}; workspace=${first ?? "null"}`);
    expect(firstErr).toBeNull();
    expect(first).toBe(fx.ws1Id);

    const { data: second, error: secondErr } = await fx.dev4.rpc("accept_invitation", {
      p_token: token,
    });
    report("p", `second accept → ${describeError(secondErr)}; data=${JSON.stringify(second)}`);
    expect(secondErr).not.toBeNull();
    expect(secondErr?.message).toMatch(/already used/i);
  });
});

// ---------------------------------------------------------------------------
// Case q: parent completion blocked while a subtask is open
// ---------------------------------------------------------------------------
describe("q. parent completion block", () => {
  it("q. completing a parent with an open subtask fails with the exact trigger error", async () => {
    const { data, error } = await fx.manager
      .from("tasks")
      .update({ status: "completed" })
      .eq("id", fx.parentPId)
      .select("id, status");
    report("q", `complete parent with 0/1 subtasks done → ${describeError(error)}; rows=${JSON.stringify(data)}`);
    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
    expect(error?.message).toBe("Complete all subtasks first (0 of 1 done).");
    const { data: after } = await fx.manager
      .from("tasks")
      .select("status")
      .eq("id", fx.parentPId)
      .single();
    expect(after?.status).toBe("todo");
  });
});

// ---------------------------------------------------------------------------
// Case r: audit columns cannot be set directly by a client
// ---------------------------------------------------------------------------
describe("r. audit columns are server-managed", () => {
  it("r. created_at / created_by / completed_at on update are silently ignored", async () => {
    const { data: before } = await fx.manager
      .from("tasks")
      .select("created_at, created_by, completed_at, status")
      .eq("id", fx.taskAId)
      .single();
    expect(before).toBeTruthy();

    const { data, error } = await fx.manager
      .from("tasks")
      .update({
        created_at: "2020-01-01T00:00:00.000Z",
        created_by: fx.dev2Id,
        completed_at: "2020-01-01T00:00:00.000Z",
      })
      .eq("id", fx.taskAId)
      .select("id");
    const { data: after } = await fx.manager
      .from("tasks")
      .select("created_at, created_by, completed_at")
      .eq("id", fx.taskAId)
      .single();
    report(
      "r-update",
      `manager sets audit cols → ${describeError(error)}; rows=${data?.length ?? "null"}; ` +
        `created_at before=${before?.created_at} after=${after?.created_at}; ` +
        `created_by before=${before?.created_by} after=${after?.created_by}; ` +
        `completed_at before=${before?.completed_at} after=${after?.completed_at}`,
    );
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(after?.created_at).toBe(before?.created_at);
    expect(after?.created_by).toBe(before?.created_by);
    expect(after?.completed_at).toBe(before?.completed_at);
  });

  it("r-insert. created_at / created_by on insert are silently overwritten", async () => {
    const { data, error } = await fx.manager
      .from("tasks")
      .insert({
        project_id: fx.projectId,
        title: "SEC-TEST audit insert",
        assigned_to: fx.managerId,
        status: "todo",
        created_at: "2020-01-01T00:00:00.000Z",
        created_by: fx.dev2Id,
      })
      .select("id, created_at, created_by")
      .single();
    report(
      "r-insert",
      `manager inserts with forged audit cols → ${describeError(error)}; ` +
        `created_at=${data?.created_at}; created_by=${data?.created_by} (manager=${fx.managerId})`,
    );
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data?.created_at).not.toBe("2020-01-01T00:00:00.000Z");
    expect(data?.created_by).toBe(fx.managerId);
  });
});

// ---------------------------------------------------------------------------
// Case s: notifications belong to their recipient only
// ---------------------------------------------------------------------------
describe("s. notifications are recipient-only", () => {
  it("s. another user reads 0 notifications not addressed to them, and cannot mark them read", async () => {
    const { data: others, error: selErr } = await fx.dev2
      .from("notifications")
      .select("id")
      .neq("recipient_id", fx.dev2Id);
    report(
      "s-read",
      `dev2 selects notifications where recipient != self → rows=${others?.length ?? "?"} (${describeError(selErr)})`,
    );
    expect(selErr).toBeNull();
    expect(others).toHaveLength(0);

    const { data: upd, error: updErr } = await fx.dev2
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", fx.dev1NotificationId)
      .select("id");
    report(
      "s-update",
      `dev2 marks dev1 notification read → ${describeError(updErr)}; rows=${upd?.length ?? "null"}`,
    );
    expect(updErr).toBeNull();
    expect(upd).toHaveLength(0);

    const { data: after } = await fx.dev1
      .from("notifications")
      .select("read_at")
      .eq("id", fx.dev1NotificationId)
      .single();
    expect(after?.read_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// NOT claimed: analytics server action + realtime isolation.
// ---------------------------------------------------------------------------
// Only the SERVER ACTION counts here — lib/analytics.ts is pure
// aggregation helpers over already-loaded rows (no DB access), so its
// existence does not unblock this case.
const ANALYTICS_CANDIDATES = [
  "lib/actions/analytics.ts",
  "app/dashboard/analytics/page.tsx",
];
const analyticsExists = ANALYTICS_CANDIDATES.some((p) =>
  existsSync(path.resolve(process.cwd(), p)),
);

// The server action exists NOW (it landed mid-run from the parallel
// track), but it CANNOT be verified by this runner yet, so this case is
// deliberately SKIPPED — never a pass. Two independent blockers, both
// observed live on 2026-11-12:
//  1. The action is a Next.js server action ("use server" in
//     lib/actions/analytics.ts). It can only be invoked over HTTP from the
//     dev server (Next-Action POST) or by rendering
//     /dashboard/analytics as a signed-in developer — supabase-js alone
//     cannot call it.
//  2. The dev server on :3000 cannot serve ANY route right now: every
//     request 500s with `ENOENT .next/routes-manifest.json` (plus an
//     earlier `Cannot find module './611.js'`). Three concurrent
//     `next build` processes from the parallel tracks are churning .next
//     while two dev servers share it. Deleting .next / restarting would
//     disrupt that live work, so this was left alone.
// Wave-2 re-run (when the server is healthy): sign in as developer and as
// manager, mint the @supabase/ssr session cookie
// (`sb-<project-ref>-auth-token`, value = the literal prefix "base64-" +
// base64url of the session JSON — a bare base64url value is silently
// rejected by @supabase/ssr 0.12 as "Auth session missing!") plus the
// `taskorbit-workspace-id` cookie for "Test Workspace", then GET
// /dashboard/analytics as the developer and assert the page shows
// "Analytics is for managers" and contains NO workspace chart data
// (no "Workspace-wide charts for", no project rows); as the manager the
// same page must render the charts (control). A direct Next-Action POST
// of getAnalytics() as the developer must return
// { error: "Only the workspace manager can view analytics." }.
// The action id lives in .next/server/server-reference-manifest.json
// (look up exportedName "getAnalytics", filename "lib/actions/analytics.ts");
// POST multipart/form-data to /dashboard/analytics with the
// `Next-Action: <id>` header and one field per argument ("0" = "{}").
// VERIFIED 2026-11-12 (integration): developer GET → 200 "Analytics is
// for managers", no chart data; manager GET → 200 with charts; developer
// direct POST → 200 `1:{"error":"Only the workspace manager can view
// analytics."}` with no data; manager POST → 200 with full data.
it.skip("BLOCKED-ON-ANALYTICS: developer cannot read /dashboard/analytics data via the server action", () => {
  report(
    "analytics",
    `BLOCKED — lib/actions/analytics.ts exists=${analyticsExists}, but the dev server :3000 500s on every route (corrupt .next, concurrent next builds); see the skipped test's comments for the wave-2 HTTP steps.`,
  );
});

it.skip("NOT TESTED (manual): realtime cross-workspace isolation", () => {
  // Not testable without a browser: supabase-js realtime needs a live
  // channel subscription. Manual steps for the wave-2 re-run:
  // 1. Log in as developer3@testorbit.dev (member of ws2 ONLY) in browser A
  //    and as the manager in browser B.
  // 2. In browser A, open the app and subscribe to postgres_changes on the
  //    `tasks` table (the app's realtime channel), with no workspace filter.
  // 3. In browser B, as manager of ws1 ("Test Workspace"), create a task in
  //    "Website Redesign" and change a task's status.
  // 4. Assert browser A receives NO realtime events for ws1 rows. Then
  //    repeat with a filter for ws1's project id — still no events.
  // 5. Sanity check: an event for a ws2 task DOES arrive in browser A.
  // eslint-disable-next-line no-console
  console.log(
    "[CASE realtime] NOT TESTED — no browser in this runner. Manual steps are in this test's comments.",
  );
});
