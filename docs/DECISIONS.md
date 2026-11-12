# TaskOrbit — Decisions (Part 1)

Fixed product rules. These are decided and must not be changed without the
owner's say-so. Implementation references are in brackets.

## Roles & workspaces

- Two roles only: `manager`, `developer` (`workspace_role` enum).
- Whoever creates a workspace becomes its manager (owner). One manager per
  workspace in this version. [`create_workspace` RPC, `supabase/migrations/0002_rpc.sql`]
- Developers join **only** through a manager's invitation. A role chosen on
  the signup form is never trusted — signup creates no workspace membership.
- A user can belong to more than one workspace (manager of one, developer in
  another) and switch between them (top-bar switcher, cookie
  `taskorbit-workspace-id` is only a preference; membership is re-checked on
  the server on every request).
- No user can see data from a workspace they are not a member of (RLS on
  every table, membership helpers `is_workspace_member` / `member_role`).

## Who can see what

- All workspace members can **view** all projects and tasks in that workspace.
- All workspace members can **comment** on any task or subtask in that workspace.
- Editing is restricted as below.

## Manager can

- Create / edit / delete projects; create / edit / delete tasks; assign or
  reassign tasks to any workspace member; change any task's status; create
  subtasks on any task; invite and revoke developers; delete any comment in
  the workspace.

## Developer can

- On a task **assigned to them**: change its **status** only
  (`todo` / `in_progress` / `in_review` / `completed`). Never title,
  description, deadline, priority or assignee.
- Create subtasks under a task assigned to them.
- On subtasks of their assigned tasks: create, edit (title, description,
  due date, priority), change status, delete.
- Comment anywhere in the workspace; edit/delete **their own** comments only.
- Cannot create/edit/delete projects, assign tasks, invite members, or touch
  another developer's tasks/subtasks.

Enforcement is in the database, not only the UI (see "Database enforcement"
below). The UI also hides/gates the controls, but a developer calling the API
directly with a forged request is still blocked by RLS + triggers.

## Subtasks

- A subtask is a row in `tasks` with `parent_task_id` set. Only **one level**
  of nesting (a subtask cannot have subtasks).
- A subtask always belongs to the **same project** as its parent.
- A subtask's `assigned_to` is **automatically the parent task's assignee**.
  If the parent is reassigned, its subtasks are reassigned too.
- A task with no assignee cannot have subtasks created by a developer (only
  the manager can add them).

## Parent completion rule

- A parent task is **never auto-completed**. Someone (assignee or manager)
  must mark it completed.
- A parent task **cannot be marked completed** while any of its subtasks is
  not completed. Message: "Complete all subtasks first (2 of 3 done)."
- If a subtask is reopened, or a new subtask is added, under a completed
  parent, the parent automatically goes back to `in_progress` and its
  `completed_at` is cleared. Logged in `activity_logs`.

## Deadlines & time

- `due_date` is a **DATE** (no time). Cutoff is **23:59:59.999 of that date in
  the workspace timezone**.
- Workspace timezone default: **`Asia/Dhaka`** (stored on the workspace).
- `completed_at` is a `timestamptz`, set by the server/database when status
  becomes `completed`, cleared when reopened. History is preserved in
  `activity_logs`.

### Deadline states — `lib/date/deadline.ts → getDeadlineState()` (single source of truth)

| State | Rule | Display |
| --- | --- | --- |
| GREEN — Completed on time | `status = completed` AND `completed_at <= cutoff` | green chip, "Completed on time", completion date |
| RED — Overdue | `status != completed` AND `now > cutoff` | red chip, "Overdue by 2 days 3 hours" |
| AMBER — Completed late | `status = completed` AND `completed_at > cutoff` | amber chip, "Completed late (1 day)" |
| NEUTRAL — On track | `status != completed` AND `now <= cutoff` | cyan/neutral chip, "Due in 3 days" / "Due today" |
| NO DEADLINE | `due_date` is null | grey chip, "No deadline" — never overdue |

Always text, not only color. A legend is shown on task pages
(`DEADLINE_LEGEND`). Subtasks use exactly the same function.

## Progress formulas — `lib/progress.ts`

- **Project progress** = completed **top-level** tasks ÷ all top-level tasks × 100
  (subtasks are not counted, to avoid double counting).
- **Task (subtask) progress** = completed subtasks ÷ all subtasks of that task × 100.
- Total is 0 → **0%** with a note ("No tasks yet" / "No subtasks"), never 100%.
- Display is rounded (2 of 3 → **67%**); the exact value (66.67) is kept for
  calculations. Example: 3 of 4 tasks → 75%; a task with 2 of 3 subtasks → 67%.

## Database enforcement (triggers / policies — the owner's check #3)

All in `supabase/migrations/0001_init.sql`. These run in the database, so they
apply no matter which client calls Supabase:

**Parent completion — blocked in the database:**
- Trigger `trg_tasks_block_completion` → function `block_parent_completion()`:
  on UPDATE of `status` to `completed`, counts the parent's subtasks; raises
  `Complete all subtasks first (X of Y done).` if any subtask is open.
- Trigger `trg_tasks_reopen_parent` → function `reopen_parent_on_subtask_change()`:
  inserting a subtask, or reopening one, under a completed parent sets the
  parent back to `in_progress` (its `completed_at` is cleared by
  `maintain_completed_at()`).
- Trigger `trg_tasks_completed_at` → `maintain_completed_at()`: sets
  `completed_at = now()` on completion, `NULL` otherwise; clients cannot set it
  (also enforced by `protect_created_by()` / `set_insert_audit()`).

**Developer edit restrictions — blocked in the database:**
- Policy `tasks_update` (RLS): a developer may UPDATE only tasks where
  `is_task_assignee(id, auth.uid())` — i.e. their own assigned tasks/subtasks
  — or any task if they are the manager.
- Trigger `trg_tasks_enforce_developer` → function `enforce_developer_task_update()`:
  for non-managers, on a top-level assigned task only `status` may change
  (title/description/priority/dates/assignee/project/parent/position changes
  raise `Developers can only change the status of their assigned tasks.`);
  on a subtask only title/description/due date/priority/status may change;
  touching any other developer's task raises `You do not have permission to
  edit this task.`
- Policy `tasks_insert`: a developer may INSERT only a subtask under a task
  assigned to them (`is_task_assignee(parent_task_id, auth.uid())`); managers
  may insert anything. (A developer therefore cannot create a subtask under
  an unassigned task, someone else's task, or a subtask — the last two are
  also blocked by the next trigger.)
- Policy `tasks_delete`: a developer may DELETE only subtasks of their own
  assigned tasks; managers may delete anything.
- Trigger `trg_tasks_validate` → `validate_task()`: subtask must have the
  same `project_id` as its parent; parent must itself be top-level
  (`A subtask cannot have subtasks.`); no self-reference; subtask
  `assigned_to` is copied from the parent on insert; `assigned_to` must be a
  member of the project's workspace (`Assignee must be a member of the
  project's workspace.`).
- Trigger `trg_tasks_cascade_reassign` → `cascade_task_reassign()`: reassigning
  a parent reassigns its subtasks.
- Policies `projects_insert_manager` / `projects_update_manager` /
  `projects_delete_manager`: only the workspace manager can create/edit/delete
  projects — a developer's project write is denied by RLS even with the exact
  UUIDs.
- Policies `comments_update_author` / `comments_delete`: only the author (or
  the manager, for delete) may change a comment.
- `accept_invitation(p_token)` (`0002_rpc.sql`): token reuse, expiry, revoke
  and wrong-email are all rejected inside the atomic RPC; the raw token is
  never stored, only its SHA-256 hash.

## Invitations

- Manager enters a developer's email (Team page) → server generates a random
  32-byte token, stores **only its SHA-256 hash** (`token_hash`), expiry 7 days.
- The app shows a **"Copy invite link"** button and states honestly:
  "Email was not sent — share this link with your developer." Email sending
  can come later. Manager can see pending invites and revoke / re-create them.
- `/invite/[token]`: not logged in → sign up / log in first, then return;
  wrong email / expired / revoked / used token → clear error page, no data leak.

## Auth & sessions

- Supabase Auth with the official `@supabase/ssr` pattern (server client,
  browser client, middleware session refresh). Server identifies the user with
  `supabase.auth.getUser()` (verified), never with client-sent IDs or roles.
- No localStorage database, no fake sessions, no hard-coded accounts.
- Login / signup / forgot-password / invite-accept have a best-effort
  in-memory per-IP attempt guard (5–10 per 10 min) in `lib/auth/actions.ts` —
  this is not a substitute for Supabase's own rate limits.
- No `SUPABASE_SERVICE_ROLE_KEY` is used in Part 1.

## UI / i18n

- Light theme only for now. Brand tokens: Indigo `#6658F5`, Cyan `#16C8E8`,
  Mint `#2DD4BF`, Coral `#FF7D70`, background `#F7F9FE`, surface `#FFFFFF`,
  text `#182039`, muted `#7C87A0`. Fonts: Space Grotesk (headings), Inter (body).
- Manager accent indigo, developer accent mint — plus a visible text role chip
  ("Manager" / "Developer"), never color alone.
- All UI text lives in `lib/i18n/en.ts` so Bangla can be added in Part 3
  without rewriting components. (Note: Part 1 pages originally used inline
  English strings; wiring every component to the dictionary was a Part 2
  cleanup — done in Part 2, see below.)

## Part 2 decisions (team workflows)

### Notifications — generated in database triggers only

- Notification generation lives in `supabase/migrations/0004_notifications.sql`
  (triggers), never in `lib/actions/*`: the same event can be produced by
  a server action, the REST API, or a future client, and triggers are the
  only place that cannot be bypassed.
- `notify_user()` skips the actor, validates the type against a whitelist
  and the title length, and de-dupes identical unread rows for the same
  entity created within 10 s (several triggers can fire for one user action).
- Assignment notifications fire for top-level tasks only; a parent
  reassignment does not spam one notification per subtask.
- Comment added → task assignee + task creator. Task/subtask completed →
  workspace manager(s). Task reopened → assignee. Invitation accepted →
  workspace manager(s). Project status changed → members with tasks in
  that project. No due-soon / overdue reminders (Part 3).
- The 0001 `notify_on_task_assigned()` is replaced in 0004 (same name, so
  the existing trigger keeps working): the 0001 version notified even when
  the actor assigned a task to themselves and fired once per subtask on a
  cascade reassign. Both fixed.
- Bell unread count comes from the `getUnreadCount` server action (exact),
  not from the dropdown list (capped at 10).

### Realtime — publication + polling fallback

- `supabase/migrations/0005_realtime_analytics.sql` adds `tasks`,
  `comments`, `notifications` to the `supabase_realtime` publication and
  sets `REPLICA IDENTITY FULL` on all three; also adds the `tasks(status)`
  index.
- One shared browser client (`lib/realtime/client.ts`); `RealtimeProvider`
  is mounted once in `app/dashboard/layout.tsx` and opens no channels
  itself.
- Every hook subscribes to ONE table with a row filter scoped to data the
  user may see (own notifications, one task's comments, one project's
  tasks, one task) — never a workspace-wide channel. Channels are removed
  on unmount / when the filter changes.
- If a channel errors or does not reach SUBSCRIBED within 10 s, the hook
  falls back to polling (`router.refresh()` every 30 s + on window focus).
  The mode is only logged (`[realtime] <channel>: live|polling`) — the UI
  never shows anything alarming about it.
- Mounts: `CommentThread` calls `useTaskCommentsRealtime(taskId, () =>
  router.refresh())`; the task page mounts `<TaskRealtime taskId>` (client
  wrapper around `useTaskRealtime`); the board mounts one channel per
  project shown (`BoardRealtime`); the dashboard mounts a bare
  `<RecentActivity />`. Live behaviour was NOT tested with a browser in
  Part 2 (see BUILD_LOG); the manual two-profile steps are in
  `docs/PART2_NOTES_notifications_realtime_activity.md`.

### Activity — every event has a write path

- `invite.created` / `invite.revoked` are written by `lib/actions/team.ts`
  (`logInviteActivity`, best-effort insert into `activity_logs` with
  metadata `{invited_email, invitation_id}`; RLS policy
  `activity_insert` allows it for the acting manager). The invite itself
  is the source of truth — a failed activity insert must not fail the
  invite action, so failures are logged server-side, not thrown. There is
  no trigger on `workspace_invitations`.
- `lib/activity/format.ts` renders both new actions and the filter
  dropdown lists them. Audit (all DECISIONS.md events now covered):
  project/task/comment/member events → 0001 triggers; `workspace.created`
  / `invitation.accepted` → 0002 RPCs; `member.removed` → 0003 RPC;
  `invite.created` / `invite.revoked` → `lib/actions/team.ts`.
- Subtasks are logged as `task.created` (the trigger fires on the subtask
  row); there is no separate `subtask.created` action.

### Analytics — manager only, aggregated server-side

- `getAnalytics()` in `lib/actions/analytics.ts` enforces the role on the
  server: a developer calling it directly gets
  `{ error: "Only the workspace manager can view analytics." }` and no
  data. The page at `app/dashboard/analytics/page.tsx` checks the role
  again before rendering and shows the No-access page instead of charts.
- All aggregation happens on the server (`lib/analytics.ts` pure helpers
  over already-loaded rows); only the columns the six charts need are
  loaded, and rows are never sent to the browser in bulk.
- Verified live 2026-11-12 (integration): developer GET
  `/dashboard/analytics` → 200 "Analytics is for managers", no chart
  data; manager GET → 200 with charts; developer direct Next-Action POST
  → `{"error":"Only the workspace manager can view analytics."}` with no
  data; manager POST → full data. Cookie minting detail for future
  re-runs: the `@supabase/ssr` session cookie value is the literal
  prefix `base64-` + base64url(session JSON); a bare base64url value is
  silently rejected ("Auth session missing!").

### Member removal — RPC semantics

- `remove_workspace_member` (`supabase/migrations/0003_invites_fix.sql`)
  is atomic: it unassigns the member's open tasks, deletes the membership
  and logs `member.removed` in one transaction, and creates no
  notification. The manager cannot remove themselves; the workspace
  manager can never be removed.

### Delete-trigger repair (migration 0006)

- Part 1 bug, verified live: deleting a task or project failed with
  409/23503 because `log_task_activity` / `log_project_activity` (0001)
  inserted an `activity_logs` row on DELETE whose `task_id` / `project_id`
  was the just-deleted id, violating the FKs.
  `supabase/migrations/0006_delete_activity_fix.sql` replaces both
  functions in place (same names, existing triggers keep working): the
  DELETE branches now log with `task_id` / `project_id` NULL, keeping
  `workspace_id` + the title/name in metadata. 0001 is NOT edited.
  Verified live: the two stuck throwaway rows ("DELETE-TEST throwaway"
  task, "Part2 RSC Project" project) deleted successfully after applying,
  with `task.deleted` / `project.deleted` rows written.

### KPI-link limitation (unchanged from Part 1)

- The dashboard KPI cards do not link anywhere: there is no
  `/dashboard/tasks` route. This stays a documented limitation for the
  owner to decide; no such route was created in Part 2.

### i18n wiring complete (Part 1 cleanup, done in Part 2)

- Every component/page now reads its strings through `t()` from
  `lib/i18n/en.ts`; a missing key returns the key itself and the i18n unit
  test fails on any key used in code but absent from the dictionary.
- Workspace helpers consolidated: `lib/workspace.ts` deleted;
  `lib/actions/workspace.ts` is the single canonical helper
  (`getDashboardContext` / `getCurrentUser` / `setActiveWorkspace` /
  `logOutAction`).
