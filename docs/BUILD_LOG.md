# TaskOrbit — Build Log (Part 1)

Date: 2026-11-12. Repository: `~/workspace/taskorbit` (see git commit at the
end of this file). Built in one session: scaffold + 4 parallel tracks
(database, core libs + tests, auth + shell, dashboard + actions), then a
parent-agent quality gate with the three owner checks (generated types, RLS
status, DB enforcement).

## What was built

- Next.js 15.5.29 + TypeScript + Tailwind app (App Router). 16 routes — see
  `npm run build` output below.
- Supabase migrations `supabase/migrations/0001_init.sql` (986 lines: 9 tables,
  4 enums, 36 RLS policies, 25 triggers) and `0002_rpc.sql` (`create_workspace`,
  `accept_invitation`).
- Core libs: `lib/date/deadline.ts` (single deadline function),
  `lib/progress.ts`, `lib/validators.ts` (Zod), `lib/permissions.ts`,
  `lib/i18n/en.ts`, `types/database.ts` + `types/index.ts` (derived row types).
- Auth: login / signup / forgot / reset / callback / onboarding / invite flow.
- Dashboard: dashboard, projects (list/new/detail), task detail (subtask
  checklist + comment thread + activity), my-tasks, team (invite/revoke),
  settings (rename workspace).
- `supabase/seed.sql` is comments only (0 non-comment lines, verified) — no
  passwords, no demo login.
- `tests/rls/rls-tests.sql` (T01–T32) — RLS/trigger test script for a
  disposable local Supabase.

## Commands run and their real output

### Install

- `npm install` (scaffold, Next 15.5.4): `added 415 packages in 60s`, exit 0.
  (Two warnings worth noting: `next@15.5.4` had a CVE notice, and eslint 8 is
  deprecated.)
- `npm install @supabase/ssr@0.12.7`: upgraded 0.6.1 → 0.12.7 (see "Fix 2").
- `npm install next@15.5.29 eslint-config-next@15.5.29`: latest 15.5 patch;
  no vulnerability warning after the upgrade.

### Unit tests — PASS (65/65, 4 files)

```
npm run test
 ✓ tests/unit/deadline.test.ts (15 tests)
 ✓ tests/unit/progress.test.ts (7 tests)
 ✓ tests/unit/permissions.test.ts (19 tests)
 ✓ tests/unit/validators.test.ts (24 tests)
Test Files  4 passed (4)
     Tests  65 passed (65)
```

Failures found and fixed on the way (not hidden):
1. First run: all 4 files failed to load — Vitest had no `@/` alias.
   Fixed `vitest.config.ts` (added `resolve.alias`).
2. Second run: 7 deadline failures. Root cause: `getTimezoneOffsetMs`
   truncated the wall-clock to whole seconds (no milliseconds), so the
   computed cutoff was ~1 second late (18:00:00.996Z instead of
   17:59:59.999Z) — every 1-second-boundary test failed. Fixed by adding
   `fractionalSecondDigits: 3` to the formatter. One failure was a test bug:
   the `task()` helper used `??`, which turned an explicit `due_date: null`
   into the default due date; fixed the helper to respect explicit null.
   Third run: 65/65 pass.

### Typecheck — PASS

```
npm run typecheck   # tsc --noEmit — exit 0, no errors
```

Failure found and fixed on the way: the first run reported **55 errors**,
all of the form `Property 'workspace_id' does not exist on type 'never'`
on Supabase queries and `rpc` args typed as `undefined`. Root cause:
`@supabase/ssr@0.6.1` ships `.d.ts` files that import
`@supabase/supabase-js/dist/module/lib/types` — a path that **does not exist**
in supabase-js 2.119 (installed via the `^2.45.4` range), so its
`GenericSchema` import degraded and the SSR client's schema resolved to
`never`. Proved with probes: direct `createClient<Database>` (supabase-js)
typed queries correctly while `createServerClient<Database>` (ssr 0.6.1)
returned `never` for the same database type, and the standalone
`Database["public"] extends GenericSchema` check passed. Fix: upgrade
`@supabase/ssr` 0.6.1 → **0.12.7** (peer `@supabase/supabase-js ^2.114.0`,
satisfied by 2.119.0). No application code changed for this fix.
After the upgrade: `tsc --noEmit` clean, also clean on Next 15.5.29.

### Lint — PASS

```
npm run lint
✔ No ESLint warnings or errors
```
(Run twice: once on Next 15.5.7, once on 15.5.29 — clean both times.
`next lint` itself is deprecated and prints a migration notice.)

### Build — PASS

```
npm run build   # Next.js 15.5.29
✓ Compiled successfully in 25.1s
✓ Linting and checking validity of types ...
✓ Generating static pages (16/16)
Route (app)                              Size  First Load JS
┌ ƒ /                                    164 B   105 kB
├ ○ /_not-found                         126 B   102 kB
├ ƒ /auth/callback                       126 B   102 kB
├ ƒ /dashboard                           182 B   146 kB
├ ƒ /dashboard/my-tasks                  181 B   146 kB
├ ƒ /dashboard/projects                  161 B   105 kB
├ ƒ /dashboard/projects/[projectId]     2.02 kB   148 kB
├ ƒ /dashboard/projects/new             3.41 kB   138 kB
├ ƒ /dashboard/settings                 2.11 kB   111 kB
├ ƒ /dashboard/tasks/[taskId]           3.87 kB   121 kB
├ ƒ /dashboard/team                     4.15 kB   113 kB
├ ○ /forgot-password                    2.95 kB   134 kB
├ ƒ /invite/[token]                      1.91 kB   107 kB
├ ○ /login                              3.04 kB   134 kB
├ ƒ /onboarding                          1.9 kB   107 kB
├ ○ /reset-password                     73.3 kB   204 kB
└ ○ /signup                             3.55 kB   135 kB
ƒ Middleware                             95.1 kB
```
(○ static, ƒ dynamic.)

### Dev-server smoke test — PASS (with placeholder env, no real Supabase)

`npm run dev -p 3101` with `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co`:
`/` → 200, `/login` → 200, `/signup` → 200, `/forgot-password` → 200,
`/onboarding` → 307 (redirect to `/login`, correct — no session). Title
`TaskOrbit — Plan. Assign. Track. Deliver.` confirmed in the login HTML.
This proves the routes render; it does **not** prove any authenticated flow
(no database was available).

## Owner check 1 — TypeScript types from the migrations

- Attempted the real thing first:
  `npx supabase gen types typescript --local` (Supabase CLI 3.1.0, installed
  via npx):
  ```
  Warning: --local isn't needed (local is the default) ...
  Target: local stack (127.0.0.1:54322)
  docker: command not found (podman also not found) — install Docker Desktop
  or Podman and ensure it is on PATH
  ```
  So `supabase gen types` **could not run** in this environment — no Docker,
  no local stack, no remote project. This is not a pass; it is a blocked step.
- What was done instead: `types/database.ts` was written **by hand in the
  exact shape `gen types` produces** (`Database` with `Tables`/`Views`/
  `Functions`/`Enums` + the `Tables`/`TablesInsert`/`TablesUpdate`/`Enums`
  helpers), with every table, column, nullability, enum value and function
  signature copied from `0001_init.sql` / `0002_rpc.sql`. Its header says so
  and gives the exact regeneration command.
- Then all four tracks were aligned to it:
  - `types/index.ts` now **derives** every row type from `Database`
    (`Database["public"]["Tables"]["projects"]["Row"]`, etc.) — a drifted
    column/enum fails `tsc`. Two real mismatches were fixed this way:
    `Notification.body` is `NOT NULL` in the DB (was `string | null`) and
    `ActivityLog.metadata` is `NOT NULL` Json (was `| null`).
  - `lib/supabase/server.ts` and `lib/supabase/client.ts` use
    `createServerClient<Database>` / `createBrowserClient<Database>`.
  - Verified by grep: all 9 table names used in `.from("…")` calls across
    `lib/`, `app/`, `components/` match the migration table names exactly.
  - **A real bug this alignment caught:** the RPCs are declared as
    `create_workspace(p_name text)` and `accept_invitation(p_token text)`,
    but `lib/auth/actions.ts` called them with `{ name }` / `{ token }`.
    PostgREST RPC requires exact argument names, so both calls would have
    failed at runtime. Fixed to `{ p_name }` / `{ p_token }` (and the typed
    client now enforces the argument names at compile time).
- To regenerate for real after a database exists, see `docs/SETUP.md`
  section 8: `supabase gen types typescript --local > types/database.ts`.

## Owner check 2 — RLS tests: NOT RUN

- **Status: not run. Not passed, not failed — not run.**
- Why: this machine has **no Docker** (`docker: command not found`), no
  `supabase` local stack, no `psql`, no Postgres server at all. Migrations
  were **never applied to any database** in Part 1, and no live Supabase
  project was connected. The RLS test script exists
  (`tests/rls/rls-tests.sql`, T01–T32, covering every case in spec section 8)
  and its header documents the exact commands, but nothing in this log claims
  it passed.
- **Exact commands for the owner** (Docker + Supabase CLI required, from the
  repo root, disposable local Supabase only — never production):
  ```bash
  supabase start
  supabase db push
  psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
    -v ON_ERROR_STOP=1 -f tests/rls/rls-tests.sql
  ```
  Use the connection string `supabase status` prints for your machine. The
  script stops at the first failed assertion. Record the result here.

## Owner check 3 — DB enforcement (not only UI)

Confirmed by reading `supabase/migrations/0001_init.sql` (line numbers in
the file as delivered). Full list is in `docs/DECISIONS.md`; the core names:

- **Parent completion:** trigger `trg_tasks_block_completion` →
  `block_parent_completion()` (raises
  `Complete all subtasks first (X of Y done).`); trigger
  `trg_tasks_reopen_parent` → `reopen_parent_on_subtask_change()` (reopens
  the parent to `in_progress`, clears `completed_at`); trigger
  `trg_tasks_completed_at` → `maintain_completed_at()`.
- **Developer restrictions:** RLS policy `tasks_update` (only own assigned
  tasks, or manager); trigger `trg_tasks_enforce_developer` →
  `enforce_developer_task_update()` (top-level assigned task: status only;
  subtask: title/description/due date/priority/status only; anything else
  raises); policy `tasks_insert` (developer: subtask only under own assigned
  task); policy `tasks_delete` (developer: only subtasks of own tasks);
  trigger `trg_tasks_validate` → `validate_task()` (same project, parent
  top-level, assignee must be a workspace member, assignee copied from
  parent); trigger `trg_tasks_cascade_reassign` →
  `cascade_task_reassign()`; policies `projects_*_manager` (developer project
  writes denied by RLS); policies `comments_update_author` / `comments_delete`.
- **Invitations:** `accept_invitation(p_token)` — reuse/expiry/revoke/
  wrong-email rejected atomically; only the SHA-256 hash is stored.

These triggers/policies were **not executed** anywhere (see check 2) — the
SQL was reviewed line-by-line, not run. The RLS test script asserts each of
them once a database exists.

## Hands-on E2E test against a real Supabase test project (2026-11-12)

The owner does not code, so the agent ran the whole exam workflow by hand
against a **separate test project** (never the real one): Supabase project
`taskorbit-test` (ref `mjhkxhewcajrewicyztm`, ap-southeast-1, Free plan,
email confirmation OFF), created in the browser. Migrations were applied via
the Supabase Management API (`POST /v1/projects/{ref}/database/query`,
because direct Postgres TCP from this VM is blocked by the egress proxy and
pasting ~40 KB into the SQL Editor is unreliable) — same SQL, `0001_init.sql`
then `0002_rpc.sql`, both HTTP 201. Verified after applying: **9 tables**,
**36 RLS policies**, RLS enabled on all 9 tables, both RPCs present, all key
triggers present (27 public triggers; `trg_on_auth_user_created` lives on
`auth.users`).

The app ran from `~/workspace/taskorbit` on `npm run dev` (port 3000) with
`.env.local` pointing at the test project. The cloud browser cannot reach
localhost, so the app was exposed through a localtunnel URL
(`https://lucky-parrot-7.loca.lt`; a custom proxy-aware tunnel client in
`~/workspace/e2e-tunnel/` — plain localtunnel/cloudflared cannot connect out
from this VM because direct TCP/TLS is mangled by the egress proxy). The
tunnel proved flaky (dropped connections, 502s, unhydrated pages), which
cost two failed developer-join attempts before a fresh tunnel with a deeper
connection pool worked. **The tunnel flakiness is a test-setup problem, not
an app problem** — the app's pages and JS chunks all return 200 locally, and
the manager completed the same signup through the same setup minutes
earlier.

Test accounts (test project only, password `Test1234!` for both):
manager `manager@testorbit.dev` (Test Manager), developer
`developer@testorbit.dev` (Test Developer). Workspace "Test Workspace",
project "Website Redesign" (Active, High, 2026-11-12 → 2026-11-30), task
"Design homepage" (High, due 2026-11-20).

**All 12 checklist steps passed** (browser-driven, two separate browser
profiles so the manager session could not leak into the invite):

1. Invite link opened in the developer profile. (Logged-out view shows
   "You've been invited to TaskOrbit" + "Log in or create an account first";
   the workspace name/email/role appear after sign-in.)
2. Signed up with exactly the invited email; no email confirmation needed
   (off). After joining, the role chip reads exactly "Developer".
3. Assigned task open: status changeable (To do / In progress / In review /
   Completed); title, deadline and assignee are plain read-only text — no
   edit controls for them.
4. Created 3 subtasks ("Create wireframe", "Design hero section", "Prepare
   final mockup"); progress "0 of 3 done", 0%.
5. Completed 2 subtasks → progress exactly "2 of 3 done", "67%".
6. Parent completion with 1 open subtask **blocked** with the exact toast
   "Complete all subtasks first (2 of 3 done)." — the toast is transient
   (a few seconds); for a viva demo, watch promptly. The DB trigger
   `trg_tasks_block_completion` is what enforces it server-side.
7. Completed the 3rd subtask, then the parent → green chip "Completed on
   time" + "Completed on 12 Nov 2026, before the 20 Nov 2026 deadline."
8. Comment posted: "Homepage design is ready for review." (Test Developer,
   12 Nov, 12:31).
9. Manager view: project progress "1 of 1 tasks completed", "100%";
   developer comment visible on the task page; activity log records
   "comment.added" and "task.completed".
10. Invite link reopened → after clicking "Accept invite", red alert "This
    invitation was already used." (No error on page load itself.)
11. Developer opened `/dashboard/projects/new` → "Page not found" + "This
    page doesn't exist, or you don't have access to it." No form, no project
    created.
12. Manager created "Fix footer links" due 2026-11-11 (yesterday) → red chip
    "Overdue by 12 hours"; completing it → amber chip "Completed late
    (12 hours)" + "Completed 12 hours after the 11 Nov 2026 deadline."
    (Chips include the duration; the bare words "Overdue"/"Completed late"
    appear only in the legend.) Project progress then "2 of 2 tasks
    completed, 100%".

**Minor UI friction found (not failures):** (a) after signup the form does
not redirect — a separate login is needed; (b) "Create project" stayed on
"Saving…" then the form reset with no message, though the project was
created; (c) double-clicking "Create invite" natively submitted the form
(page reload, email cleared, no invite, no error) — Enter worked; the
"Pending invitations" count still showed (0) after the invite was created;
(d) after assigning a task, the project list row still read "Unassigned"
until reload (stale list); (e) "New task" / project / "Edit" clicks
sometimes did nothing until a reload (tunnel-caused, not app-caused).

**Still NOT verified:** `tests/rls/rls-tests.sql` (T01–T32) was **not run**
— it needs psql/Docker against a local Supabase; the E2E above proves the
happy paths and the parent-completion rule at the UI level, not every RLS
policy by direct SQL. `supabase gen types` was **not run** against a real
database either; `types/database.ts` remains hand-derived. The PAT used for
the migration (`taskorbit-test-migrations`) was revoked after the test
(Supabase dashboard: "Successfully deleted access token", token list empty);
the test project itself was left in place for the owner to inspect.

## Blockers / things that could not be verified

1. RLS test script (`tests/rls/rls-tests.sql`) never run — needs Docker/psql.
   Migrations are now applied and verified on the test project (see the
   E2E section above), but the script's per-policy assertions are still
   unexecuted.
2. ~~No end-to-end run of the exam workflow~~ — DONE 2026-11-12 (see the
   E2E section above): signup → workspace → project → invite → accept →
   subtask → comment, all verified live against the test project.
3. Email confirmation flow not tested live (confirmation was OFF in the
   test project; no mailbox check).
4. `supabase gen types` not run (no Docker); `types/database.ts` is
   hand-derived — regenerate per `docs/SETUP.md` section 8 after setup.

## Known issues to fix before / during Part 2

1. **Two workspace-helper implementations.** `lib/workspace.ts` (auth track)
   and `lib/actions/workspace.ts` (dashboard track) both implement
   get-active-workspace / set-cookie / require-role logic. They use the same
   cookie (`taskorbit-workspace-id`) and the same semantics, and the build
   passes, but there should be one canonical helper. Consolidate in Part 2.
   (Same for logout: `logOut` in `lib/auth/actions.ts` and `logOutAction` in
   `lib/actions/workspace.ts`.)
2. **i18n dictionary not wired in.** `lib/i18n/en.ts` exists with all strings,
   but pages/components use inline English strings. Wire components to the
   dictionary in Part 2 before adding Bangla, or the Bangla work will miss
   strings.
3. **`/reset-password` bundle is 73.3 kB** (other auth pages are ~3 kB). It
   works, but the chunk is oddly large — investigate the import chain in
   Part 2 (likely the server-action + browser-client imports).
4. `next lint` is deprecated (prints a migration notice); move to the ESLint
   CLI (`npx @next/codemod@canary next-lint-to-eslint-cli .`) when convenient.
5. Next.js 15.5.4 originally installed showed a CVE notice; upgraded to
   15.5.29 (latest 15.5 patch at build time) — keep patching on deploy.
6. Rate limiting on auth endpoints is a best-effort in-memory guard, not a
   substitute for Supabase's own limits (documented in `docs/DECISIONS.md`).
7. `create-next-app` hung for 8+ minutes on first scaffold attempt (never
   created the directory); the repo was scaffolded manually instead
   (`package.json` + configs + `npm install`). Not a product issue, noted
   for reproducibility.

## Git

- Local repository: `~/workspace/taskorbit`, branch `main`.
- Commits: `68c8859` "TaskOrbit Part 1: database, auth, workspaces,
  projects, tasks, subtasks, comments, deadline logic"; `ee33c03` and
  `3352832` "docs: record git commit(s) in BUILD_LOG". (The commit recorded
  as HEAD in the handoff message is the authoritative one.)
- No remote is configured (no GitHub remote exists for this project yet) —
  push to a remote before deploying on Vercel (see `docs/SETUP.md` section 9).
- `.next/`, `node_modules/` and `.env.local` are gitignored and were not
  committed.

---

# TaskOrbit — Build Log (Part 2: Team Workflows)

Date: 2026-11-12. Repository: `~/workspace/taskorbit`, branch `main`.
Built by 7 parallel tracks (Step 0 fixes, Team, Board/Calendar/Search,
Notifications/Realtime/Activity, Analytics/Dashboard, Security test, i18n
wiring), then an integration pass that mounted realtime, closed the
invite-activity gap, repaired the delete FK bug, fixed the permissions
null-role bug, hardened pending states, ran the full quality gate, and
committed everything on `main` (see git log at the end of this section).

## What was built

- **Kanban board** (`/dashboard/board`): 4 columns, dnd-kit drag-and-drop
  (cross-column move + same-column reorder), optimistic moves with revert
  on server rejection, keyboard sensors + "Move to…" menu, filters by
  project/assignee/priority/mine. `lib/actions/board.ts` (`moveTask`,
  `reorderTasks`), `lib/board-permissions.ts`.
- **Calendar** (`/dashboard/calendar`): month view of tasks by due date,
  workspace-timezone day buckets. `lib/calendar.ts`, `lib/actions/calendar.ts`.
- **Search** (`components/search/search-dialog.tsx`): global search across
  projects/tasks/members in the active workspace only (RLS applies),
  mounted in the top bar. `lib/actions/search.ts`.
- **Notifications** (`/dashboard/notifications` + bell in the top bar):
  generation in DB triggers only (`0004_notifications.sql` — see
  DECISIONS.md Part 2), bell + unread badge with live count,
  All/Unread tabs, 20/page. `lib/actions/notifications.ts`.
- **Realtime** (`lib/realtime/`): shared browser client, hooks with a
  30 s polling fallback, `RealtimeProvider` mounted once in
  `app/dashboard/layout.tsx`. Task page mounts `useTaskCommentsRealtime`
  (CommentThread) + `<TaskRealtime>` (status/assignee); board mounts one
  channel per project (`BoardRealtime`); dashboard mounts a bare
  `<RecentActivity />`. Live behaviour NOT tested with a browser — manual
  two-profile steps are in
  `docs/PART2_NOTES_notifications_realtime_activity.md`.
- **Activity** (`/dashboard/activity`): filters by project/member/action,
  20/page, plain-words rendering (`lib/activity/format.ts`,
  `describeActivity`), relative + exact times in the workspace timezone.
- **Analytics** (`/dashboard/analytics`, manager only): 6 charts
  (status donut, deadline health, workload by developer, completed per
  week, priority, project progress table) + totals; aggregation
  server-side in `getAnalytics()`; developer gets
  `{ error: "Only the workspace manager can view analytics." }` and no
  data. Verified live by the integration pass (see below).
- **Team page upgrades**: members table, pending invites with re-create /
  revoke, member removal via the atomic `remove_workspace_member` RPC
  (0003), invite activity writes (`invite.created` / `invite.revoked`,
  added by the integration pass).
- **Dashboard upgrades**: deadline radar, team workload, quick actions,
  recent activity widget.
- **i18n wiring complete** (Part 1 cleanup): every component/page now
  uses `t()`; the i18n unit test fails on any used-but-absent key.
- **Step 0 fixes** (from the Part 1 known issues): workspace helpers
  consolidated (`lib/workspace.ts` deleted; `lib/actions/workspace.ts` is
  canonical, including the single `logOutAction`); `/reset-password`
  bundle is now 3.33 kB (was 73.3 kB in Part 1).

## Migrations (all applied to the test project)

| Migration | Contents | Applied |
|---|---|---|
| `0003_invites_fix.sql` | `remove_workspace_member` RPC (atomic unassign + delete + `member.removed`), invite fixes | Yes — by the coordinator, verified present with anon revoked |
| `0004_notifications.sql` | Notification triggers + `notify_user()` + `idx_notifications_recipient_read`; replaces 0001 `notify_on_task_assigned()` | Yes — by the coordinator, verified |
| `0005_realtime_analytics.sql` | `tasks`/`comments`/`notifications` in `supabase_realtime`, `REPLICA IDENTITY FULL`, `tasks(status)` index | Yes — by the coordinator, verified |
| `0006_delete_activity_fix.sql` | Repairs `log_task_activity` / `log_project_activity` DELETE branches (NULL task/project ids) | Yes — by the integration pass, HTTP 201 via the Management API; verified live by deleting the two stuck rows (see below) |

`0001_init.sql` and `0002_rpc.sql` were NOT edited. No Part 2 ZIP was built.

## Bugs found and fixed by the integration pass

1. **Delete FK bug (Part 1, verified live)** — deleting a task/project
   failed 409/23503 (`activity_logs_task_id_fkey` /
   `activity_logs_project_id_fkey`). Fixed by migration 0006 (see
   DECISIONS.md Part 2). Verified after applying: task "DELETE-TEST
   throwaway" (`35c4a17f-…`) deleted OK, project "Part2 RSC Project"
   (`f0be0456-…`) deleted OK, both confirmed gone, and `task.deleted` /
   `project.deleted` activity rows were written with NULL task/project ids.
2. **Permissions null-role bug (Part 1)** — `canChangeTaskStatus` returned
   `true` for a null role when the assignee matched (null role = not a
   member). Fixed in `lib/permissions.ts` (null/unknown role can never
   change status); new unit test added (null + undefined roles, assignee
   matching or not).
3. **Invite activity gap** — `lib/actions/team.ts` never wrote
   `activity_logs` for invite created / revoked. Fixed: `invite.created`
   (invite + re-create) and `invite.revoked` (revoke + re-create) are now
   written best-effort; `describeActivity()` + the filter dropdown cover
   both actions. Audit re-run: every DECISIONS.md event now has a write
   path.
4. **Pending-state hardening** — `ConfirmDialog.handleConfirm` and
   `Topbar.handleSwitch` / `handleLogout` now reset their pending state
   in `finally` (a rejecting action no longer sticks on "Deleting…" /
   "Logging out…"). `PendingInvitesSection.handleRecreate` was already
   hardened by the Team track (try/finally + `busyId` guard) — verified,
   not changed.
5. **WorkloadChart tooltip** — removed the `overdue` series from
   `WorkloadChartRow` and the tooltip's dead `overdue` branch (there was
   no `overdue` bar; the values are already counted in the status bars).
6. **Dev server + env** — the dev server was dead with a corrupted `.next`
   (concurrent builds); killed the strays by PID, removed `.next`, set
   `.env.local` `NEXT_PUBLIC_APP_URL` back to `http://localhost:3000`
   (it still pointed at the dead localtunnel URL), restarted exactly one
   dev server on :3000. `/login` → 200; `/dashboard`, `/dashboard/board`,
   `/dashboard/team`, `/dashboard/activity`, `/dashboard/notifications`,
   `/dashboard/calendar` → 200 as manager; task page
   `/dashboard/tasks/dec2b9e0-…` → 200 with title + comment.

## Analytics security check (the previously BLOCKED case) — VERIFIED

Minted the `@supabase/ssr` session cookie (`sb-<ref>-auth-token`, value
`base64-` + base64url(session JSON) — the `base64-` prefix is required;
a bare base64url value is silently rejected as "Auth session missing!")
plus the `taskorbit-workspace-id` cookie for "Test Workspace":

- GET `/dashboard/analytics` as developer → **200**, body contains
  "Analytics is for managers", contains NO "Workspace-wide charts for",
  NO "Website Redesign", NO "Task status", NO "Workload by developer".
- GET as manager (control) → **200**, "Workspace-wide charts for" + "Website Redesign" + "Task status" + "Workload by developer" all present.
- Direct Next-Action POST of `getAnalytics()` (action id from
  `.next/server/server-reference-manifest.json`, `4073fab1…03460e2`) as
  developer → **200**, body `1:{"error":"Only the workspace manager can
  view analytics."}`, no `workspaceName`, no project names.
- Same POST as manager → **200**, full data (`workspaceName: "Test
  Workspace"`, project "Website Redesign", totals, status, workload…).
- The skipped test's comment in `tests/security/api-attack.test.ts` was
  updated with the exact cookie format and POST steps so the case is
  runnable next time; it is still skipped in the automated runner (it
  needs a live dev server).

## Quality gate (real runs, integration pass)

- `npm run lint` — **PASS**, "✔ No ESLint warnings or errors" (exit 0;
  `next lint` deprecation notice still prints).
- `npm run typecheck` — **PASS**, `tsc --noEmit` exit 0, no errors.
- `npm run test` — **PASS, 141/141** (11 files), including the new
  null-role permissions test (20 tests) and the invite activity-format
  test (7 tests).
- `npm run test:security` — **PASS, 20 passed | 2 skipped** (cases a–s
  all pass; the 2 skipped are the analytics case — verified live above —
  and the realtime manual case, NOT TESTED). Per-case evidence is in the
  `[CASE …]` stdout lines: a–c 42501/0-rows, d–f P0001 "only change the
  status", g control status change OK, h 42501, i/j 0 rows, k/l 42501,
  m 0 rows, n 0/0/0 rows cross-workspace, o P0001 "Assignee must be a
  member…", p second accept "already used", q "Complete all subtasks
  first (0 of 1 done).", r audit columns unchanged/overwritten, s 0
  rows + unread preserved.
- `npm run build` — **PASS, in an isolated copy** (`/tmp/taskorbit-build-check`,
  source copied excluding `node_modules`/`.next`, `node_modules`
  symlinked; copy deleted afterwards). Compiled in 36.8 s, 21 routes,
  all static pages generated. `/reset-password` is now 3.33 kB.
  (Not run in the repo while the dev server was running — the two fight
  over `.next`, as in Part 2's notes.)

## E2E / browser tests — RUN 2026-11-12 (all times Asia/Dhaka)

Two profiles (manager `manager@testorbit.dev`, developer
`developer@testorbit.dev`, both `Test1234!`) against the dev server via a
localtunnel URL (red-wombat-100 → died 15:43 → plastic-fox-52, same
`NEXT_PUBLIC_APP_URL` updated, dev restarted). Tunnel flakiness is a
standing condition of these runs: pages render server HTML but JS chunks
sometimes fail to load, so clicks fall back to native form GETs and
buttons do nothing until a reload — a failed attempt with that symptom
is a tunnel artifact, NOT an app failure.

Step-0 fixes: 0.1 signup redirect OFF — PASS (manager2@testorbit.dev
landed on `/onboarding` directly, 13:49); 0.1 signup ON — PASS (fresh
manager3@testorbit.dev, 16:00: "Check your email" / "You're almost in."
/ "We sent a confirmation link…", no redirect; email confirmation was
toggled ON in the Supabase dashboard for the test and back OFF
afterwards, verified both ways). 0.2 forms/"Saving…" — PASS (project
create resets + redirects; task/subtask/comment pending states reset,
items appear without manual reload). 0.3/0.4 invite — PASS (one click
creates once loaded; pending row for `part2dev@testorbit.dev`, "Created
12 Nov 2026", "Expires 19 Nov 2026", Copy link / Re-create / Revoke,
invite link + "Email was not sent" note; invite left pending). 0.5
persistent inline error — PASS (completing "Parent check" with subtask
"Child check" open shows inline "Complete all subtasks first (0 of 1
done)." next to the status control, still visible after 15 s; status
stayed To do).

Board (tests 2–5) — ALL PASS: developer drags own "Parent check" To do
→ In Progress, persists after reload; unassigned "Fix footer links" is
locked ("Only the assignee can move this task.", no drag handle, no Move
to…); dragging "Parent check" to Completed rolls back to In Progress
with the subtask message; keyboard "Move to…" menu works and persists.
"Parent check" left back in To do.

Test 6 calendar — PASS: month/week/list all work; "Due today check"
(due 12 Nov) on Thu 12 Nov ("Today"), "Parent check" on Fri 20 Nov;
clicking opens the task page. Minor: "+1 more" on day 20 didn't visibly
expand (list view confirms Parent check is the 4th task that day).

Test 7 search — PASS: Ctrl/Cmd+K finds project "Website Redesign",
task "Design homepage", member "Test Manager"; "Security" returns "No
matches in this workspace." — nothing leaks from "Security Test
Workspace 2".

Test 8 filters/sort — PASS: on `/dashboard/my-tasks`, status=To do +
sort=priority persisted after refresh with identical URL
(`?status=todo&priority=all&due_from=&due_to=&sort=priority`), list
22 → 8 tasks.

Test 9 bell live — FAIL in this environment (see the realtime section
below for the full evidence): three 8-minute watches (14:53, 15:28,
15:39) never moved the badge, even after the resync fix; the v3
hydration pre-check then proved the dashboard's client JS intermittently
does not run through the tunnel at all (bell dropdown would not open on
the first loaded page; after reloads it showed the current list,
30 unread incl. "Realtime retest 2"). Code (hooks, mounts, filters,
publication, RLS) verified correct by inspection; duplicate
notifications FIXED and verified (exactly one per assignment).

Test 10 comment live — PASS on re-test: comment "Realtime comment test
2 — …" posted 15:27:33 appeared on the manager's open task page ~15 s
later, WITHOUT reload; count 2 → 3. (First run 15:05 FAIL — same
environmental pattern as test 9.) Live-vs-polling mode could NOT be read
(the browser has no DevTools; `data-realtime-mode` is unreadable there).

Test 11 mark read — FAIL as observed, same environmental cause as test
9: manager's bell showed 20 unread; clicking a notification 3× never
marked it read (20 → 20, no navigation); "Mark all as read" 2× changed
nothing (20 → 20); the header bell dropdown never opened in 4 attempts
(a pure client interaction — the click handler never fired). The
mark-read code reads correctly (`NotificationItem.handleClick` →
`markNotificationRead` → RLS-scoped update; `markAllNotificationsRead`
→ workspace-scoped update). Must be re-verified on a stable deploy.

Test 12 activity — PASS: `/dashboard/activity` shows 109 entries, page
1 of 6; newest events correct with actors/times, e.g. "Test Manager
created task 'Realtime retest 2'" 15:41, "'Realtime retest'" 15:28,
"Test Developer commented on task 'Due today check'" 15:27 / 15:06 /
15:05, "Test Manager assigned task 'Fix footer links'" 14:53.

Test 13 analytics — PASS: "Workspace-wide charts for Test Workspace ·
2 projects · 37 tasks · times in Asia/Dhaka." Task status: 37 total — 3
completed, 34 open. Deadline health: 1 overdue · 2 completed late · 1
completed on time · 13 on track · 20 with no deadline (sums to 37).
Workload: Test Developer 16 open (1 overdue); Completed per week: 3 in
week of 9 Nov. Priority: Low ~1, Medium ~31, High 4, Urgent 1 (sums to
37). Project progress: Part2 Test Project 0% (0/1), Website Redesign 8%
(3/36), 1 overdue. No overall completion-rate percentage is printed
(derived 3/37 ≈ 8.1%).

Test 14 developer analytics — PASS: `/dashboard/analytics` as the
developer shows "Analytics is for managers" / "Only the workspace
manager can see workspace-wide analytics. Your own stats — assigned, in
progress, completed and overdue tasks — are on your dashboard." plus a
"Back to my dashboard" button. (Sidebar still lists the Analytics link;
it leads to this page.)

Test 15 remove developer — PASS: removed the developer shown as
"Member" with 10 open tasks (developer2 — NOT Test Developer). The
confirmation dialog stated "Remove this member? Their 10 open tasks
will become unassigned." All 5 "SEC-TEST Task B (dev2)" tasks now show
Unassigned (task detail: Assignee Unassigned, activity "Test Manager —
task.reassigned — 12 Nov 2026, 15:55"); member gone from the Team page
(3 remain); Test Developer's assignments unaffected. Note: the Team page
counts include subtasks (top-level + subtasks) while Analytics counts
top-level only — that is why Test Developer showed 19 open / 6
completed on Team but 16 open on Analytics; not a bug.

Test 16 mobile 375 px — BLOCKED / NOT RUN: the cloud browser window
cannot be resized to 375 px (stuck at 1293 px; DevTools shortcuts dead,
edge drag refused, zoom keys no effect). Desktop checks at 1293 px are
all usable (board columns + horizontal scroll, calendar list readable
with filters visible, bell dropdown fits, search dialog opens and
searches) — but the 375 px layout remains unverified; check on a real
phone.

Realtime cross-workspace isolation — PASS: manager in "Security Test
Workspace 2" (first of five identically named workspaces) showed 0
unread before and 0 unread after a fresh reload, dropdown "No
notifications yet.", while the developer's comment in "Test Workspace"
(16:21, "Isolation check comment 2…") produced a notification in
workspace A (manager's "Test Workspace" bell 22 unread; newest is 'New
comment on "Due today check"'). First attempt was inconclusive (tunnel
died 16:06 before the after-check); the retry at 16:20–16:30 completed
end to end.

## Known issues before Part 3

1. `tests/rls/rls-tests.sql` (T01–T32) still NOT run — needs Docker/psql
   against a local Supabase.
2. `supabase gen types` still NOT run against a real database;
   `types/database.ts` is hand-derived (no schema change to table shapes
   in Part 2, so it is unaffected).
3. `canManageSubtask` in `lib/permissions.ts` has the same null-role
   pattern as the fixed `canChangeTaskStatus` (a null role with a matching
   assignee returns true). DB triggers still block the actual write, but
   the helper should be fixed the same way.
4. Dashboard KPI cards do not link anywhere (no `/dashboard/tasks`
   route) — documented limitation, owner's call. Two manager KPI links
   are workarounds (Completed tasks → `/dashboard/analytics`, Overdue →
   `#deadline-radar` anchor).
5. Email confirmation flow — now tested live BOTH ways (2026-11-12):
   OFF (manager2 signup → `/onboarding`) and ON (manager3 signup →
   "Check your email" screen); setting toggled back OFF afterwards.
6. The analytics + realtime cases in `tests/security/api-attack.test.ts`
   are still `it.skip` in the automated runner (analytics verified
   manually 2026-11-12; realtime manual: comment live PASS, bell live
   FAIL-in-environment, cross-workspace isolation PASS). The
   `data-realtime-mode` diagnostic attributes were added but could never
   be read in this browser (no DevTools) — live-vs-polling mode remains
   unverified.
9. Tests 9 (bell live) and 11 (mark notifications read) FAIL in the
   tunnel environment: the dashboard's client JS intermittently does not
   run through the tunnel (dropdowns and clicks do nothing until a
   reload), so the bell subscription/polling and the mark-read handlers
   never fire on those loads. The code paths are verified correct by
   inspection and the same components work when the page loads fully
   (dropdown opens with the current list; comment channel delivered
   live). RE-VERIFY both on a stable deploy (Vercel) before calling
   them app bugs.
10. Test 16 (375 px mobile) was never run — the cloud browser cannot be
    resized to 375 px. Check the board, calendar list view,
    notifications dropdown and search dialog on a real phone.
11. The five duplicate "Security Test Workspace 2" workspaces (created
    06:42–07:17 UTC, 2026-11-12, all with manager + developer3) are test
    fixtures; harmless, but the workspace switcher shows five identical
    names.
12. `manager3@testorbit.dev` was created by the ON-mode signup test and
    never confirmed — it has no workspace. Harmless test data.
13. The pending invitation for `part2dev@testorbit.dev` (created
    12 Nov 2026, expires 19 Nov 2026) was left pending on purpose.
7. `next lint` is deprecated (prints a migration notice); move to the
   ESLint CLI when convenient (Part 1 known issue, unchanged).
8. Rate limiting on auth endpoints is still a best-effort in-memory guard
   (Part 1 known issue, unchanged).

## Git (Part 2)

- Local repository: `~/workspace/taskorbit`, branch `main`.
- Part 2 commit: `e1c7e3c` "TaskOrbit Part 2: team workflows — kanban,
  calendar, search, notifications, realtime, activity, analytics"
  (115 files changed, +11652/−1065). The hash was recorded in this log
  by a small follow-up commit.
- Realtime/notification fixes + final E2E report: `946527c` "TaskOrbit
  Part 2: realtime/notification fixes + final E2E report" (5 files,
  +489/−49), recorded in this log by a small follow-up commit.
- No remote is configured (no GitHub remote exists for this project yet).
- `.next/`, `node_modules/` and `.env.local` are gitignored and were not
  committed. No Part 2 ZIP was built.

## Realtime / notification fixes after live browser E2E (2026-11-12, uncommitted)

Live browser E2E (two profiles, tunnel https://mighty-frog-89.loca.lt)
found three defects. Fixes below are in the working tree, NOT committed.

### Defects found live (all times Asia/Dhaka)

1. Test 9 FAIL — manager assigned "Fix footer links" to Test Developer at
   14:53 while the developer's dashboard was open and watched for 8 min;
   the bell stayed at 26 unread. A fresh load afterwards showed 28 unread.
   The assignment created TWO notifications 1 s apart in the live DB:
   "Task assigned to you" 14:53:23 (DB trigger, 0004) and "New task
   assigned" 14:53:24 (app-side insert in `lib/actions/tasks.ts`).
2. Test 10 FAIL — developer posted a comment on "Due today check" at
   15:05:37 while the manager's task page was open and watched for 8 min;
   the comment never appeared (stayed "Comments (0)").
3. DB side verified FINE in the Supabase dashboard 15:03–15:08:
   publication `supabase_realtime` includes tasks, comments, notifications
   (all ON, Insert/Update/Delete); Realtime service enabled; public channel
   access ON.

### Fix 1 — duplicate assignment notification (certain)

- `lib/actions/tasks.ts`: deleted `insertAssignmentNotification()` and both
  call sites (`createTask`, `updateTask`). The trigger
  `trg_tasks_notify_assigned` (`AFTER INSERT OR UPDATE OF assigned_to`,
  0001; function replaced in 0004) is the single source — verified it fires
  on INSERT (create with assignee) as well as on reassign, and
  `notify_user()` already skips recipient == actor and de-dupes identical
  unread rows within 10 s. No other file inserts into `notifications`
  (grep verified; `lib/actions/notifications.ts` only reads/updates).
  No migration added; the trigger is unchanged. No pre-existing duplicate
  rows were deleted (the two 14:53 rows stay in the test DB).

### Fix 2 — bell never resyncs from a server refresh (certain)

- `components/notifications/notification-bell.tsx`: `unreadCount`/`items`
  lived in `useState(initial...)` with no effect syncing prop changes, so
  a `router.refresh()` (the polling fallback's 30 s / window-focus refresh)
  could never move the badge — this alone explains test 9's frozen bell
  even if polling was running. Added a `useEffect` syncing both from
  `initialUnreadCount` / `initialNotifications` when those props change.
  It only runs when the props change, so live increments from the realtime
  callback are untouched between refreshes.

### Fix 3 — realtime mode diagnostic (no visible UI change)

- `components/notifications/notification-bell.tsx`: captures the mode
  returned by `useNotificationsRealtime` and puts
  `data-realtime-mode={mode}` (+ `data-realtime-channel="notifications"`)
  on the bell's root element.
- `components/tasks/task-realtime.tsx`: now renders a hidden
  `<span data-realtime-mode data-realtime-channel="task">` instead of
  `null`.
- `components/comments/comment-thread.tsx`: also exposes the comments
  channel mode on its root (`data-realtime-channel="comments"`) — added
  because test 10's failure is the comments channel, which neither of the
  two named spots covers. Console.info logging unchanged.
- Subscription logic, polling timers, channel names/filters NOT changed:
  reviewed `lib/realtime/hooks.ts`, `lib/realtime/client.ts`, all mounts
  and the layout wiring (`ctx.user.id` flows to the bell; filters are
  scoped to the user's own rows / one task / one project) and found no
  concrete bug in them on inspection — channel names, filters, RLS scope
  and the 10 s connect timeout + 30 s polling fallback are all correct as
  written. The mode attribute is what discriminates live vs polling vs
  never-connected in the re-test.

### Quality gate (real runs, 2026-11-12)

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run lint`: clean ("No ESLint warnings or errors").
- `npm test`: 141/141 passed (11 files), unchanged.
- `next build`: PASS in an isolated copy only (`~/.build-check-rtfix`,
  node_modules symlinked, own .next, copy deleted afterwards) — compiled
  in 43 s, 21 routes. Never run in the repo while the dev server runs.
- No unit test added for the bell resync: the repo's Vitest runs in a
  `node` environment with no jsdom / @testing-library / react-test-renderer
  installed, so a client component's `useEffect` resync cannot be rendered
  in a test without adding DOM test infrastructure (not done unprompted).
  The live browser re-test is the verification path for that behaviour.
- Dev server on :3000 was NOT restarted; `/login` still 200 locally
  after the changes (dev picks up the edits on the next request).
- Working tree after the fixes: 4 files modified, +33/−38, uncommitted
  (the incidental `tsconfig.tsbuildinfo` change from the typecheck run was
  reverted).

### Live browser re-test — RESULTS (2026-11-12, all times Asia/Dhaka)

1. Test 9 (bell live) — FAIL in this environment, three watches:
   - 14:53: manager assigned "Fix footer links" to the developer; bell
     stayed at 26 unread for 8 min; fresh load showed 28.
   - 15:28 (after Fix 1 + Fix 2): manager created "Realtime retest"
     assigned to the developer at 15:28:46; bell stayed at 28 for 8 min;
     fresh loads showed 29 — and exactly ONE notification (duplicate
     fixed). The watched tab's dropdown still showed the stale list.
   - 15:39 (v3, hydration pre-check): the bell dropdown would NOT open
     on the first fully-loaded dashboard (button stayed collapsed after
     clicks + 15 s wait); after reloads the page loaded blank, then the
     dropdown opened and showed the CURRENT list — 30 unread, newest
     "Realtime retest 2" (created 15:41:04). This proves the dashboard's
     client JS intermittently never runs through the tunnel, which is
     the most likely cause of the frozen bell in all three watches —
     not a defect found in the app code. The realtime Inspector in the
     Supabase dashboard cannot list other clients' channels, so no
     server-side connection evidence was obtainable; the
     `data-realtime-mode` attribute could never be read in this browser
     (no DevTools). Verdict: NOT PROVEN either way — re-verify on a
     stable deploy (Vercel).
2. Test 10 (comment live) — PASS on re-test: comment "Realtime comment
   test 2 — please confirm you can see this without reloading." posted
   15:27:33 appeared on the manager's open task page ~15 s later, WITHOUT
   reload; count 2 → 3. (First run 15:05 FAIL — same environmental
   pattern as test 9.) Live-vs-polling mode unverified (attribute
   unreadable in this browser).
3. Test 11 (mark read) — FAIL as observed, same environmental cause:
   the manager's bell showed 20 unread; clicking a notification 3× never
   marked it read (20 → 20, no navigation); "Mark all as read" 2× changed
   nothing; the bell dropdown never opened in 4 attempts. The code reads
   correctly; re-verify on a stable deploy.
4. Cross-workspace isolation — PASS (retry 16:20–16:30): workspace B
   0 → 0 unread across the developer's comment in workspace A; the
   notification exists in A only. First attempt inconclusive (tunnel
   died 16:06).

### Final state of this changeset

- Files: `lib/actions/tasks.ts`, `components/notifications/notification-bell.tsx`,
  `components/tasks/task-realtime.tsx`, `components/comments/comment-thread.tsx`,
  `docs/BUILD_LOG.md` — committed as `946527c` (see "Git (Part 2)" below).
- `npm run typecheck` / `npm run lint` / `npm test` (141/141) / `next build`
  (isolated copy, 21 routes) were re-run after these fixes — see the
  "Quality gate" in the Part 2 final report section below; all clean.

## Part 2 — final report (§12, 2026-11-12)

Per-item status against the Part 2 spec ("PART 2 OF 4: TEAM WORKFLOWS").
DONE = built + verified (unit/security gate and/or live browser test).
PARTIAL = built with a documented limitation. NOT DONE = not built.

### Step 0 fixes (8 Part 1 issues) — all DONE

- 0.1 Signup redirect: DONE. OFF mode PASS live (manager2 → `/onboarding`
  directly); ON mode PASS live (manager3 → "Check your email" screen).
  Code: `app/signup/page.tsx`, `lib/auth/*`.
- 0.2 Forms stuck on "Saving…": DONE, PASS live (project/task/subtask/
  comment pending states reset and items appear without reload).
  Root cause was missing try/catch around server-action awaits.
- 0.3 Invite double-click creating duplicates: DONE, PASS live (one
  click creates once loaded).
- 0.4 Invite row rendering / stale state: DONE, PASS live (pending row
  shows created/expiry dates, Copy link / Re-create / Revoke).
  Root cause was a stale client render.
- 0.5 Parent-completion error only a transient toast: DONE, PASS live
  (persistent inline "Complete all subtasks first (0 of 1 done)." next
  to the status control).
- 0.6 Canonical workspace helper: DONE (`lib/actions/workspace.ts`;
  `lib/workspace.ts` deleted).
- 0.7 i18n: DONE (~562 keys in `lib/i18n/en.ts`, `t()` helper, 69 files,
  missing-key test).
- 0.8 `/reset-password` bundle: DONE (73.3 kB in Part 1 → 3.33 kB;
  verified in the build output, `/reset-password` 3.33 kB).

### Sections 1–7 and 9 — all DONE

- §1 Kanban board — DONE: `app/dashboard/board/page.tsx`,
  `components/board/*`, drag + keyboard "Move to…", lock for unassigned,
  rollback on subtask rule. Browser tests 2–5 PASS.
- §2 Calendar — DONE: `app/dashboard/calendar/page.tsx`, month/week/list.
  Browser test 6 PASS.
- §3 Search & filters — DONE: `components/search/search-dialog.tsx`,
  `app/dashboard/my-tasks/page.tsx` (URL-persisted filters/sort).
  Browser tests 7, 8 PASS.
- §4 Notifications — DONE: `components/notifications/*`,
  `lib/actions/notifications.ts`, `app/dashboard/notifications/page.tsx`.
  Bell live test 9 FAIL-in-environment (see below); mark-read test 11
  FAIL-in-environment; isolation PASS.
- §5 Realtime — DONE: `lib/realtime/*`, `components/tasks/task-realtime.tsx`,
  `components/comments/comment-thread.tsx`, `components/notifications/*`.
  Comment live test 10 PASS on re-test; bell live test 9 unproven.
- §6 Activity — DONE: `app/dashboard/activity/page.tsx`,
  `lib/activity/*`. Browser test 12 PASS.
- §7 Analytics — DONE: `app/dashboard/analytics/page.tsx`,
  `lib/actions/analytics.ts`. Browser test 13 PASS (numbers recorded
  above); developer no-access test 14 PASS.
- §9 Dashboard + team page upgrades — DONE: `app/dashboard/page.tsx`,
  `app/dashboard/team/page.tsx`. Test 15 PASS.

### Section 8 — PARTIAL

- Dashboard upgrades DONE except: two manager KPI links are workarounds
  (Completed tasks → `/dashboard/analytics`, Overdue → `#deadline-radar`
  anchor) because there is no workspace-wide filtered task-list route.
  A `/dashboard/tasks` route was NOT built — owner decision pending.

### Browser tests — final scoreboard

| Test | Result |
|---|---|
| 0.1 signup OFF | PASS |
| 0.1 signup ON | PASS |
| 0.2 forms | PASS |
| 0.3/0.4 invite | PASS |
| 0.5 inline error | PASS |
| 2–5 board | PASS |
| 6 calendar | PASS |
| 7 search | PASS |
| 8 filters/sort | PASS |
| 9 bell live | FAIL (environment — see below) |
| 10 comment live | PASS (re-test; first run FAIL) |
| 11 mark read | FAIL (environment — see below) |
| 12 activity | PASS |
| 13 analytics | PASS |
| 14 developer no-access | PASS |
| 15 remove developer | PASS |
| 16 mobile 375 px | NOT TESTED (blocked — window cannot be resized) |
| Isolation | PASS |

Tests 9 and 11 are reported as FAIL-as-observed with the evidence that
the cause is the test environment, not a proven app defect: the v3
hydration pre-check showed the dashboard's client JS intermittently does
not run at all through the tunnel (dropdowns and clicks do nothing until
a reload), and the code paths read correctly on inspection. Re-verify
both on a stable deploy (Vercel) before calling them app bugs. Test 16
was never run for a different environmental reason (no 375 px viewport).

### Security results

- `npm run test:security` — 20 passed | 2 skipped (analytics case
  verified live above; realtime manual case — see the browser table).
  Pre- and post-migration runs identical. Per-case evidence in the
  `[CASE …]` stdout lines (see "Quality gate" above).
- Live security evidence: search returns "No matches in this workspace."
  for cross-workspace data (test 7); developer at
  `/dashboard/analytics` gets the no-access page (test 14); realtime
  isolation PASS (workspace B 0 → 0 while workspace A received the
  notification).
- NOT RUN: `tests/rls/rls-tests.sql` (T01–T32) — needs Docker/psql.
  `supabase gen types` NOT run — `types/database.ts` hand-derived.

### Bugs fixed in Part 2

- Project AND task delete broken (activity-trigger FK 23503) → migration
  `0006_delete_activity_fix.sql`.
- `canChangeTaskStatus` null-role bug → fixed in `lib/permissions.ts`.
- Missing invite created/revoked activity writes → added.
- Form pending-state root cause (no try/catch around server-action
  awaits) → fixed.
- Duplicate assignment notification (Part 1 leftover
  `insertAssignmentNotification()` in `lib/actions/tasks.ts`) → deleted;
  the 0004 trigger is the single source. Verified live: exactly one
  notification per assignment.
- Bell never resyncing from a server refresh (state without a sync
  effect) → `useEffect` added in `notification-bell.tsx` (no unit test:
  no jsdom in the repo; live re-test is the verification path).

### Bugs / issues still open

- `canManageSubtask` same null-role pattern as the fixed
  `canChangeTaskStatus` (DB still blocks the write).
- Tests 9 and 11 unproven in this environment (re-verify on Vercel).
- Test 16 (375 px) never run.
- KPI links partial (no `/dashboard/tasks` route).
- `next lint` deprecation; in-memory auth rate-limit guard.

### Quality gate (real runs, 2026-11-12, after the realtime fixes)

- `npm run typecheck` (`tsc --noEmit`): clean.
- `npm run lint`: clean ("No ESLint warnings or errors").
- `npm test`: 141/141 passed (11 files).
- `npm run test:security`: 20 passed | 2 skipped.
- `next build`: PASS in an isolated copy (21 routes). Never run in the
  repo while the dev server runs.

### Migrations applied to the test project (all via the Management API)

`0001_init.sql`, `0002_rpc.sql`, `0003_invites_fix.sql`
(`remove_workspace_member` RPC), `0004_notifications.sql` (notification
triggers + `idx_notifications_recipient_read`),
`0005_realtime_analytics.sql` (tasks/comments/notifications in
`supabase_realtime`, REPLICA IDENTITY FULL, `idx_tasks_status`),
`0006_delete_activity_fix.sql` (activity-trigger FK fix). All Part 2
PATs revoked after use; no PAT is currently active.

### Owner to-dos (do not act unprompted)

1. Re-verify tests 9 (bell live) and 11 (mark read) on a stable deploy
   (Vercel) — if they fail there too, they are real app bugs.
2. Decide whether to build a `/dashboard/tasks` route for the two KPI
   links (Section 8 partial).
3. Decide whether to check the 375 px mobile layout on a real phone
   (test 16 never run).
4. Push to a git remote before the Vercel deploy (no remote configured).
5. Set up the real (non-test) Supabase project per `docs/SETUP.md`
   (create project, apply migrations 0001–0006, set Site URL + redirect
   URLs, add the 3 `NEXT_PUBLIC_*` env vars).
6. Part 3 spec will come from the user separately — do not build Part 3/4
   features (animated landing page, GSAP, dark mode, Bangla, mascot
   auth pages, AI/Gemini, long Bangla docs) before then.

## Part 3 — Track D (Step 0.3, canManageSubtask fix, unit + security tests, Playwright E2E, Lighthouse) — 2026-11-12, uncommitted

### Step 0.3 — /dashboard/tasks + KPI links (DONE)
- New `app/dashboard/tasks/page.tsx`: workspace-wide task list modelled on
  `app/dashboard/my-tasks/page.tsx`, reusing shared `lib/filters.ts`
  (mine + resolveMine). Manager sees all; developer sees all with "My tasks
  only" default ON (`?mine=0` turns it off). Same filters/sort/pagination
  (20/page). Tasks loaded only through the workspace's project IDs.
- `components/tasks/task-filters.tsx`: optional `showMine` + `mine` props
  ("My tasks only" checkbox; hidden `mine=0` input after the checkbox so an
  unchecked box still submits `mine=0`).
- `app/dashboard/page.tsx`: manager KPI "Completed tasks" href
  `/dashboard/analytics` → `/dashboard/tasks?status=completed`; "Overdue
  tasks" href `#deadline-radar` → `/dashboard/tasks?overdue=1` (links only).
- `components/dashboard/sidebar.tsx`: "All Tasks" nav entry after "My Tasks".
- i18n keys in both `lib/i18n/en.ts` and `lib/i18n/bn.ts`: `nav.allTasks`,
  `allTasks.*`, `filters.mineOnly` (parity test passes).
- Anonymous GET `/dashboard/tasks` → 307 to `/login`; route in build output
  (199 B, 183 kB first load).

### canManageSubtask null-role fix (DONE)
- `lib/permissions.ts`: `if (role !== "developer") return false;` after the
  manager check, mirroring the Part 2 `canChangeTaskStatus` fix. DB triggers
  still block the write; the helper now matches.
- `tests/unit/permissions.test.ts`: null, undefined, `isOwnSubtask=false`,
  null parent, unknown `"admin"` role all return false.

### Unit tests — +23 (224/224, 20 files)
- Already covered by Track C (checked first, not duplicated): most of
  ai-schemas, ai-limits, cron-select, cron-auth, locale-format. Added only
  the gaps: `ai-schemas` next_actions + project_summary validity and
  `filterReferences`/`collectReferencedIds`; `ai-limits` stableStringify
  (arrays/nested/null/undefined), zero-limit allows nothing, in-memory
  hourly fallback window (blocked 11th call still blocked at +12s/+59min,
  allowed at +61min); `cron-select` in_progress/in_review in due-soon/
  overdue, addDays year boundary, Dhaka-midnight due-soon selection;
  `cron-auth` lowercase `bearer`, extra whitespace, empty token rejected,
  secret value case-sensitive; `locale-format` formatMonthYearLocale/
  formatDayMonthLocale en/bn, timezone-respecting day/month,
  formatNumberLocale 0/3.5/1234567 (bn South-Asian grouping).

### Security tests — 22 passed | 4 skipped (26), with fresh isolated build
- ai-bundle case ran for real: 63 client JS files scanned,
  GEMINI/key hits: none. One lowercase "Gemini" display string exists in one
  chunk ("has not added a Gemini API key yet", EN + BN) — user-facing i18n,
  not a secret/env name/key.
- AI role gate VERIFIED LIVE (not via the skipped runner test): developer
  direct server-action POST of `generateAiFeature("daily_brief")` against a
  production copy → 200 `{"ok":false,"error":"Only the workspace manager can
  use this AI feature."}`; manager control POST → 200
  `{"ok":false,"error":"TaskOrbit AI is not configured yet.",
  "notConfigured":true}`. Role gate runs before config/DB, so unapplied
  migration 0007 does not block this case. (Dev-server :3000 POST 404s —
  dev action IDs differ; use the production copy's manifest action id.
  The request body must be built with client-side `encodeReply` from
  react-server-dom-webpack; hand-built FormData 500s.)
- AI RLS (workspace B reads workspace A's ai_summaries): NOT TESTED — the
  ai_summaries table does not exist until migration 0007 is applied.

### Playwright E2E — 22 passed / 3 failed (25 tests)
Suite in `tests/e2e/` (8 spec files) + `playwright.config.ts`, base URL
`http://127.0.0.1:3000`, workers 1. global-setup mints manager/developer
sessions via Supabase Auth REST (no form login) — the login action has an
in-memory per-IP guard of 5 attempts / 10 min; only 4 form logins per full
run remain (mascot bad+good 2, language login-transition 1, theme re-login 1).
- P: landing (sections/CTAs/mobile menu/skip link/focus/overflow 375px),
  logo/favicon/OG 200, mascot idle/look/shy + error/success, theme cycle
  Light→Dark→System on landing/auth/dashboard + refresh, language EN→Bangla
  on landing/auth + refresh (form values kept on switch), liquid progress,
  reduced motion, AI not-configured, AI with key NOT TESTED (no key),
  cron 401/200/duplicate, responsive widths incl. 320px, /dashboard/tasks +
  KPI links, developer "My tasks only" default ON.
- F (3): theme survives re-login — REAL APP BUG (Track B area): after a
  real form login `<html>` class is `light` though the `taskorbit-theme`
  cookie is "dark" and the profile is dark; a full reload fixes it. The
  login redirect is client-side RSC navigation, so the root layout (with
  `ThemeProvider defaultTheme`) is not re-rendered. F: language
  dashboard-after-login — REAL APP BUG (Track B area):
  `lib/auth/actions.ts` `syncPreferenceCookies` unconditionally overwrites
  the `taskorbit-locale` cookie from `profiles.preferred_locale` ("en") at
  login, discarding the explicit pre-login Bangla choice; the dashboard
  renders English even after reload. F: tunnel test — ENVIRONMENTAL:
  localtunnel.me rejects all assignments (403 in tunnel client log);
  tunnel client dead, `tunnel-url.txt` stale. Staging on Vercel still
  BLOCKED (no Vercel/GitHub connected).
- Bell live: 48 → 49 in 20.7 s, `data-realtime-mode` polling→polling
  (30 s polling fallback; Realtime never connected in this environment).
  Comment live: 13.6 s, connecting→polling.
- Cron: no secret → 401, wrong secret → 401; with secret → 200 both runs,
  identical body
  `{"ok":true,"reminders":{"workspaces":0,"alreadyRun":0,"dueSoon":0,
  "overdue":0,"failed":1},"briefs":{"generated":0,"cached":0,"skipped":0,
  "failed":0}}` — `failed:1` is the missing 0007 reminders RPC; no
  duplicates possible while it does not exist.
- Liquid progress (live, measured): project "Part2 Test Project" 0 of 1 →
  0%; "Website Redesign" 3 of 68 → 4%; task "Design homepage" subtasks
  3 of 3 → 100%.

### Lighthouse (mobile, Lighthouse 12.8.0, Playwright Chromium, 2026-11-12)
- `/`: Performance 57, Accessibility 96, Best Practices 100, SEO 92.
- `/dashboard` (minted manager session via --extra-headers): Performance 54,
  Accessibility 96, Best Practices 96, SEO 66 (SEO low is expected for an
  authenticated page).
- Two environment fixes needed: `npx lighthouse` (no version) fails with
  "notarget"; pin `lighthouse@12.8.0`. chrome-launcher must be given
  `--headless=new` in --chrome-flags or Chrome exits "Missing X server"
  (plus `--no-sandbox --disable-gpu --disable-dev-shm-usage`).

### Quality gate (real runs, 2026-11-12)
- `npm run typecheck` clean; `npm run lint` clean ("No ESLint warnings or
  errors"); `npm test` 224/224 (20 files); `npm run test:security`
  22 passed | 4 skipped (26).
- `npm run build` in a fresh isolated copy (tar --no-same-owner both sides,
  node_modules symlinked): exit 0, "Compiled successfully in 60s",
  "Generating static pages (29/29)" — 29 routes (28 + /dashboard/tasks).
  Isolated copy deleted afterwards.

### Track D notes for the coordinator
- `.env.local` still has only 4 lines; no `GEMINI_API_KEY`. Migration 0007
  still WRITTEN but NOT APPLIED (no PAT active).
- The two Track B bugs above are the only real app defects found; both
  need a Track B fix, not Track D work.
- `tests/e2e/.auth/` session files are gitignored; test passwords come from
  shell env only, never written to a file.
- Dev server on :3000 left running. The :3100 production copy used for the
  AI role-gate probe was stopped and its isolated build copy deleted.

## Part 3 — Final §12 report (coordinator integration) — 2026-11-12

Consolidates Tracks A/B/C/D plus the coordinator's integration fixes. All
work uncommitted at the time of writing; commit follows this report.

Committed 2026-11-12 as `130982e` (Part 3 main commit). Docs follow-up
commit to follow with this note.

### (1) Step 0 + §1–§10 status

| Item | Status | Evidence / files |
|---|---|---|
| Step 0.1 Staging deploy (Vercel) | NOT DONE — blocked, then unblocked late | Vercel connected; GitHub App installed on user-created private repo `thisismosayeb/taskorbit` (verified empty). Push + Vercel deploy happen after the commit (see (8)). No staging URL yet. |
| Step 0.2 Re-tests on staging (bell, mark-read, comment delay + mode, mobile) | NOT DONE (staging) | No staging URL yet. The same checks ran against the local dev server in Track D: bell 48 → 49 in 20.7 s, `data-realtime-mode` polling→polling (Realtime never connected in this environment — the Supabase Realtime wss is blocked by the VM proxy; the 30 s polling fallback works). Mark one/all read PASS. Comment live 13.6 s, connecting→polling. Mobile 375/390 PASS via Playwright. Re-run on staging once deployed. |
| Step 0.3 `/dashboard/tasks` + KPI links | DONE | `app/dashboard/tasks/page.tsx`, KPI hrefs in `app/dashboard/page.tsx`, "All Tasks" nav in `components/dashboard/sidebar.tsx`, `components/tasks/task-filters.tsx` (My-tasks-only checkbox). Verified live via Playwright (§11.1 below). |
| §1 Brand & logo | DONE | `public/brand/` (taskorbit-icon.svg, wordmark light/dark SVGs, favicon.svg, icon-512 PNG, og-image.png, favicon.ico — real ICO, 1,312 B), `public/favicon.ico`, `components/brand/logo.tsx`, tokens in `app/globals.css` + `tailwind.config.ts`. |
| §2 Landing + public pages | DONE | `components/landing/` (landing-page, public-header, public-footer), `app/page.tsx`, `app/about/`, `app/developers/`, `app/privacy/`, `app/terms/`, `app/sitemap.ts`, `app/robots.ts`. Exact headline/sub-text verified in served HTML. |
| §3 Auth redesign + mascot | DONE | `components/auth/orbit-mascot.tsx`, `components/auth/auth-form.tsx` (split-screen, mascot moods). Auth logic untouched. Mascot states verified live via Playwright (§11.4). |
| §4 Dashboard polish + Liquid Progress | DONE | `components/motion/liquid-progress.tsx` (clampProgress exported), `wave-loader.tsx`, `skeletons.tsx`; role accents in `components/dashboard/*`. Live % verified (§11.7). |
| §5 Motion (GSAP) | DONE | GSAP + ScrollTrigger; `prefers-reduced-motion` verified live (§11.8: computed duration 0.01 ms). |
| §6 Dark/Light/System | DONE (+ 2 bugs found & fixed, see (5)) | `components/theme/theme-provider.tsx`, `theme-switcher.tsx`, `lib/actions/preferences.ts`, `lib/theme/contrast.ts`, `lib/theme/chart-colors.ts`. Contrast measured, all AA PASS (§11.5). |
| §7 English/Bangla | DONE (+ 1 bug found & fixed, see (5)) | `lib/i18n/bn.ts`, `dictionary.ts`, `server.ts`, `format.ts`, `components/i18n/*`; parity 1060/1060 keys, none missing/extra. |
| §8 TaskOrbit AI (Gemini) | DONE (no-key path) | `lib/ai/*`, `lib/actions/ai.ts`, `components/ai/*`, `app/dashboard/ai/page.tsx`, `app/api/cron/daily/route.ts`. Model `gemini-2.5-flash` (default, overridable via `GEMINI_MODEL`). No key provided — "not configured" state verified live (§11.9); AI-with-key NOT TESTED (§11.10). |
| §9 Daily scheduler (Vercel Cron) | DONE (route + config) | `vercel.json` (`0 2 * * *` → `/api/cron/daily`), `lib/ai/cron-auth.ts`, `lib/ai/cron-select.ts`. Cron auth 401/200 verified live (§11.11). Reminders RPCs depend on migration 0007 (not applied) — see (7). |
| §10 Accessibility & performance | DONE (measured) | Skip link, focus rings, aria-labels verified live; width sweep 320–1920 no horizontal overflow except board scroll (§11.12). Lighthouse measured (§4). |

### (2) Browser tests (§11) — Playwright, base URL http://127.0.0.1:3000 (dev server)

Full suite (Track D): 22 passed / 3 failed (25 tests). The 3 failures were:
(1) staging-only (no Vercel/GitHub at the time), (2) theme re-login, (3) language
dashboard-after-login. (2) and (3) were REAL APP BUGS (Track B area) — fixed
by the coordinator (see (5)). Re-test of the 03 spec after the fix:
- language EN→Bangla, form values kept, refresh: PASS (3/4 in the file).
- theme survives re-login: PASS (verified 2026-11-12, clean re-run after the
  rate-limiter window cleared: 1 passed in 22.5 s). The earlier failures were
  (a) the two real app bugs in (5), since fixed, and (b) test-environment
  timing: the switcher click raced hydration on the slow dev server (fixed
  test-side, `tests/e2e/helpers.ts`), and the coordinator's own probes then
  consumed the login rate limiter (5 form logins / 10 min / IP — the last
  failed run was a 90 ms POST = limiter rejection, not an app failure).
- All other §11 items: landing PASS; logo/favicon/OG PASS (200); mascot
  PASS; theme cycle + refresh PASS; language landing/auth PASS; liquid
  progress PASS (Part2 Test Project 0 of 1 → 0%; Website Redesign 3 of 68
  → 4%; task "Design homepage" 3 of 3 → 100%); reduced motion PASS;
  AI without key PASS ("TaskOrbit AI is not configured yet"); AI with key
  NOT TESTED (no key); cron PASS with caveat (failed:1 = missing 0007 RPC);
  320px + width sweep PASS; /dashboard/tasks + KPI links PASS (anonymous
  GET → 307 to /login; manager/developer views, KPI links, "My tasks only"
  default ON all PASS). Bell live: 48 → 49 in 20.7 s, mode polling→polling
  (Realtime never connected here — wss blocked by the VM proxy).

### (3) Security results (real responses)

- `npm run test:security`: 22 passed | 4 skipped (26), with a fresh isolated
  build — the ai-bundle case ran for real: 63 client JS files scanned,
  GEMINI/key hits: none (one lowercase "Gemini" display string only, the
  user-facing i18n "has not added a Gemini API key yet").
- AI role gate VERIFIED LIVE: developer direct server-action POST of
  `generateAiFeature("daily_brief")` against a production copy → 200
  `{"ok":false,"error":"Only the workspace manager can use this AI feature."}`;
  manager control POST → 200
  `{"ok":false,"error":"TaskOrbit AI is not configured yet.","notConfigured":true}`.
  Role gate runs before config/DB, so unapplied migration 0007 does not block it.
- AI RLS (workspace B reads workspace A's `ai_summaries`): NOT TESTED — the
  table does not exist until migration 0007 is applied.
- Cron auth: no secret → 401, wrong secret → 401 (asserted in Playwright);
  with secret → 200, identical body on both runs (no duplicates possible
  while the 0007 RPC does not exist).
- `tests/rls/rls-tests.sql` and `supabase gen types`: NOT RUN (no Docker) —
  recorded honestly, as in Part 2.

### (4) Lighthouse (mobile, Lighthouse 12.8.0, Playwright Chromium, 2026-11-12)

- `/`: Performance 57, Accessibility 96, Best Practices 100, SEO 92.
- `/dashboard` (minted manager session): Performance 54, Accessibility 96,
  Best Practices 96, SEO 66 (SEO low is expected for an authenticated page).

### (5) Bugs fixed and open

Fixed during Part 3 (coordinator integration, after Track D's report):
1. Theme did not survive a real form login (Track B area). Root cause: the
   login redirect was a client-side RSC navigation, so the root layout
   (ThemeProvider `defaultTheme`) never re-rendered. Fix: `logIn` in
   `lib/auth/actions.ts` now RETURNS `{ redirectTo }` (mirroring the
   established `signUp` pattern) instead of throwing `redirect()`; the login
   page hard-navigates with `window.location.assign(result.redirectTo)`.
   The signup page changed the same way (`router.push` → `window.location.assign`;
   now-unused `useRouter` import removed). Also fixed a latent wrong default:
   `logIn` briefly used `safeNextPath` (default `/onboarding`) — login must
   default to `/dashboard`, not onboarding; corrected inline. Files:
   `lib/auth/actions.ts`, `app/(auth)/login/page.tsx`,
   `app/(auth)/signup/page.tsx`.
2. Login discarded the pre-login Bangla choice (Track B area). Root cause:
   `syncPreferenceCookies` unconditionally overwrote the `taskorbit-locale`
   cookie from `profiles.preferred_locale`. Fix: an existing cookie wins and
   is adopted into the profile (update via `profiles_update_own` policy);
   the profile is only used when no cookie exists (fresh device). Same rule
   for the theme cookie. File: `lib/auth/actions.ts`.
3. Playwright `setTheme`/`setLanguage` helpers raced hydration after a
   fresh login (the switcher click landed before React attached the handler;
   the menu never opened). Fix is test-side only: `loginAs` now waits for
   `load` after the URL match, and both switcher helpers retry the click
   once if the menu does not appear within 5 s. File: `tests/e2e/helpers.ts`.
   (The app itself is not at fault — a real user clicking before hydration
   would simply click again — but the test must not depend on that timing.)

Open / known issues:
- Realtime never connects in this environment (Supabase wss blocked by the
  VM proxy); bell/comment work via the 30 s polling fallback. Re-verify on
  staging (Vercel) in Step 0.2.
- Migration 0007 not applied (see (7)): AI cache/usage/cron-reminder
  features degrade gracefully (in-memory limiter fallback; cron returns 200
  with `failed:1`) but do not run for real until it is applied.
- AI with a Gemini key: NOT TESTED (no key provided).
- Lighthouse Performance 57/54 (mobile, dev server) — staging numbers may
  differ; re-measure on Vercel.

### (6) Quality gate (real runs, 2026-11-12, after the coordinator fixes)

- `npm run typecheck`: clean (no output).
- `npm run lint`: "✔ No ESLint warnings or errors".
- `npm test`: 224 passed (224), 20 files.
- `npm run test:security`: 22 passed | 4 skipped (26).
- `npm run build` in a fresh isolated copy (tar `--no-same-owner` both
  sides, node_modules symlinked): exit 0, "✓ Compiled successfully in
  11.0s", "Generating static pages (29/29)" — 29 routes (28 + /dashboard/tasks).
  Isolated copy deleted afterwards. Re-run by the coordinator after the
  login/theme/locale fixes (the pre-fix run by Track D had the same result).

### (7) Migrations

- `supabase/migrations/0007_ai.sql`: WRITTEN, NOT APPLIED (no PAT active;
  direct Postgres TCP blocked). Creates `ai_summaries`, `ai_usage`,
  `daily_job_runs` with RLS (reads for members; writes only via SECURITY
  DEFINER functions), re-creates `notify_user()` with the whitelist extended
  by `task_due_soon` / `task_overdue`, and adds `run_daily_reminders`,
  `run_daily_reminders_all`, `get_daily_brief_input`, `save_ai_summary`,
  `log_ai_usage`, `cron_write_allowed`. Apply via a project-scoped PAT (use
  only for migrations, revoke immediately after) or the Supabase dashboard
  SQL editor before the AI cache/usage/cron-reminder features can run.
- Migrations 0001–0006: applied to the test project in Parts 1–2 (unchanged).

### (8) Staging URL + owner to-dos

- Staging URL: NONE yet. Vercel is connected; GitHub App is installed on
  the user-created private repo `thisismosayeb/taskorbit` (verified empty,
  409 "Git Repository is empty"). Next: commit, push the text snapshot via
  `github push-files` (220 files; the 4 binary files — `public/favicon.ico`,
  `public/brand/favicon-32.png`, `public/brand/og-image.png`,
  `public/brand/taskorbit-icon-512.png` — cannot travel through the
  snapshot push and must be uploaded separately, e.g. via the GitHub web
  UI), create the Vercel project from the repo, set env vars
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_APP_URL`, plus `CRON_SECRET` from `.env.local` — never print
  or commit it), deploy, then run Step 0.2 re-tests on staging.
- Supabase Auth URL Configuration (Site URL = Vercel URL; add
  `<vercel-url>/auth/callback` and `<vercel-url>/reset-password` to Redirect
  URLs, keep localhost) needs the Supabase dashboard — a browser task the
  coordinator cannot do; flag to the parent agent.
- Gemini API key: NOT provided. AI built the no-key path; test 10 stays NOT
  TESTED unless the owner provides one. Owner note: the free Gemini tier
  may use submitted data to improve Google's products; use a paid tier for
  real data.
- Apply migration 0007 (above) before AI cache/usage/cron reminders run
  for real.
- Close the old localtunnel link only after staging works (the tunnel is
  currently dead anyway — localtunnel.me rejects all assignments, 403).

### (9) Known issues before Part 4

- See (5) open issues. In addition: `server-action` validation error
  strings stay English (import-time English schemas); `t()` interpolates
  counts with Latin digits in Bangla (`"1টি টাস্ক"`); on first load in
  Bangla, client components SSR-render in English and flip in one effect
  tick; `components/ui/avatar.tsx` fallback ("User") still renders English
  in server trees (Track B notes). None blocks Part 3.
