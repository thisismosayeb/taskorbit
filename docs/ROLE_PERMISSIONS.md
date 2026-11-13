# TaskOrbit — Role Permissions

Manager vs developer, action by action, with **where each rule is
enforced**. There are only two roles (`workspace_role` enum:
`manager`, `developer`). One manager per workspace in this version —
the creator. Developers join only through a manager's invitation.

Enforcement layers, in order of strength:

1. **RLS policy** — the database refuses the row operation.
2. **Trigger** — the database refuses the write even if the policy
   lets the attempt through (used for field-level rules inside an
   otherwise-allowed UPDATE).
3. **RPC** — the check lives inside a SECURITY DEFINER function.
4. **Server action** — `lib/actions/*` checks with
   `lib/permissions.ts` / `lib/board-permissions.ts` and returns
   `{ error }` before touching the database. This is the friendly
   error path; it is **not** the security boundary.
5. **UI** — buttons/links hidden or disabled. Never the security
   boundary; a developer calling the API directly is still blocked by
   layers 1–3.

Where a layer is listed as "—" the action is not restricted at that
layer (usually because a stronger layer already covers it, or because
the action is allowed for both roles).

## 1. Action matrix

Legend: ✅ allowed · ❌ denied · ◐ allowed with limits.

### Workspaces & membership

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| Create a workspace (becomes its manager) | ✅ | ✅ any signed-in user | RPC `create_workspace` (0002) — inserts the caller as `manager`; RLS `workspaces_insert` (`created_by = auth.uid()`) |
| View a workspace (name, members, settings) | ✅ | ✅ | RLS `workspaces_select` (`is_workspace_member(id)`) |
| Rename a workspace | ✅ | ❌ | Server action `renameWorkspace` — `canManageProjects(role)`; RLS `workspaces_update_manager` (`member_role = 'manager'`) |
| Delete a workspace | ✅ | ❌ | RLS `workspaces_delete_manager` |
| View the member roster | ✅ | ✅ | RLS `members_select` (any member) |
| Invite a developer (create invite) | ✅ | ❌ | Server action `createInvite` — `canInvite(role)`; RLS `invitations_insert_manager` |
| View pending invites | ✅ | ❌ | RLS `invitations_select_manager` |
| Revoke / re-create an invite | ✅ | ❌ | Server action (manager check); RLS `invitations_update_manager` / `invitations_delete_manager` |
| Accept an invite (join as developer) | — | ✅ the invited email only | RPC `accept_invitation` (0002) — token hash, expiry, revocation, reuse and email match all checked atomically |
| Remove a member | ✅ | ❌ | Server action `removeMember` — `isManager(role)`; RPC `remove_workspace_member` (0003) — manager-only, cannot remove self, manager never removable; trigger `prevent_last_manager_removal` is the backstop |
| Change another member's role | ❌ (no UI, no action) | ❌ | RLS `members_update_none` — updates are denied for everyone |
| Leave a workspace | ❌ (manager cannot remove self) | ❌ (no self-removal action; the RPC rejects self-removal) | RPC `remove_workspace_member` + trigger `prevent_last_manager_removal` |

### Projects

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| View projects in the workspace | ✅ | ✅ | RLS `projects_select` (any member) |
| Create a project | ✅ | ❌ | Server action `createProject` — `canManageProjects(role)`; RLS `projects_insert_manager` |
| Edit a project (name, description, status, priority, dates) | ✅ | ❌ | Server action `updateProject` — `canManageProjects(role)`; RLS `projects_update_manager` |
| Delete a project | ✅ | ❌ | Server action `deleteProject` — `canManageProjects(role)`; RLS `projects_delete_manager` |

### Tasks (top-level)

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| View tasks in the workspace | ✅ | ✅ (all tasks, not only own) | RLS `tasks_select` (any member) |
| Create a task | ✅ | ❌ | Server action `createTask` — `canManageTasks(role)`; RLS `tasks_insert` (manager branch) |
| Edit title / description / priority / dates | ✅ | ❌ | Server action `updateTask` — `canManageTasks(role)` for details; trigger `enforce_developer_task_update` raises "Developers can only change the status of their assigned tasks." |
| Change status (todo / in progress / in review / completed) | ✅ any task | ◐ own assigned tasks only | Server action — `canChangeTaskStatus(role, assigned_to, userId)` (null role can never change status, even if assignee matches — Part 2 fix); RLS `tasks_update` (`is_task_assignee`); trigger enforces the field rule |
| Complete a task with open subtasks | ❌ (blocked for everyone) | ❌ (blocked for everyone) | Trigger `block_parent_completion` — "Complete all subtasks first (X of Y done)." |
| Assign / reassign a task | ✅ any member | ❌ | Server action — `canManageTasks(role)`; trigger `cascade_task_reassign` reassigns subtasks too |
| Delete a task | ✅ | ❌ | Server action `deleteTask` — `canManageTasks(role)`; RLS `tasks_delete` (manager branch) |
| Reorder tasks within a board column (`position`) | ✅ | ❌ | Server action `reorderTasks` — `isManager(role)`; trigger rejects any developer `position` change |
| Drag a card to another column (status change) | ✅ any card | ◐ own assigned cards only | `lib/board-permissions.ts` `canDragTask` → `canChangeTaskStatus`; other cards show a lock icon + "Only the assignee can move this task."; the trigger is the backstop |

### Subtasks

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| Create a subtask | ✅ under any task | ◐ under a task assigned to them only (never under an unassigned task, never under a subtask) | Server action — `canCreateSubtask` (parent must be top-level, parent assignee must be the caller for developers); RLS `tasks_insert` (developer branch: `is_task_assignee(parent_task_id)`); trigger `validate_task` (parent top-level, same project, assignee copied from parent) |
| Edit a subtask's title / description / due date / priority | ✅ | ◐ subtasks of their own assigned tasks | Server action — `canManageSubtask`; trigger `enforce_developer_task_update` (subtask branch) |
| Change a subtask's status | ✅ | ◐ own subtasks (assignee is always the parent's) | Same as above |
| Edit a subtask's assignee / start date / position / project / parent | ✅ | ❌ | Trigger `enforce_developer_task_update` raises "Developers can only edit title, description, due date, priority and status of their subtasks." |
| Delete a subtask | ✅ | ◐ subtasks of their own assigned tasks | Server action — `canManageSubtask`; RLS `tasks_delete` (developer branch) |

### Comments

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| View comments on any task in the workspace | ✅ | ✅ | RLS `comments_select` (any member) |
| Post a comment on any task/subtask | ✅ | ✅ | RLS `comments_insert` (any member) |
| Edit a comment | ◐ own only | ◐ own only | RLS `comments_update_author` (`author_id = auth.uid()`) |
| Delete a comment | ✅ any comment | ◐ own only | Server action — `canDeleteComment(role, authorId, userId)`; RLS `comments_delete` (author **or** manager) |

### Notifications, activity, search, calendar

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| Read own notifications / mark own read / mark all own read | ✅ | ✅ | RLS `notifications_select_own` / `notifications_update_own` (`recipient_id = auth.uid()`); server actions scope to the caller |
| Read another member's notifications | ❌ | ❌ | RLS `notifications_select_own` |
| Delete a notification | ❌ | ❌ | RLS `notifications_delete_none` — no deletes in the app |
| View the workspace activity log | ✅ | ✅ | RLS `activity_select` (any member); server action `getActivity` |
| Search projects / tasks / members | ✅ | ✅ (active workspace only) | Server action `searchWorkspace` — loads only the active workspace's project ids; RLS applies to every query |
| View the calendar | ✅ | ✅ | Server action `getCalendarTasks` (workspace-scoped) |

### Analytics

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| View `/dashboard/analytics` (all six charts) | ✅ | ❌ | Server action `getAnalytics` — returns `{ error: "Only the workspace manager can view analytics." }` and **no data**; page `app/dashboard/analytics/page.tsx` checks the role again and renders the no-access page. Verified live 2026-11-12 (GET + direct server-action POST, both roles). |
| See own stats | ✅ | ✅ (on the dashboard, not analytics) | Dashboard shows the developer their own assigned / in-progress / completed / overdue counts |

### AI

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| `daily_brief`, `project_summary` | ✅ | ❌ | Server action `generateAiFeature` — `canGenerateFeature` (`MANAGER_ONLY_FEATURES`); verified live 2026-11-12: developer direct POST → 200 `{"ok":false,"error":"Only the workspace manager can use this AI feature."}` |
| `my_focus`, `deadline_risk`, `standup`, `next_actions` | ✅ | ✅ (scoped: `my_focus`/`standup` input is the caller's own tasks) | Same server action; `save_ai_summary` RPC: a developer may only save a `my_focus` summary for themselves |
| Use AI at all when no key is configured | — (not-configured state for everyone) | — | `isAiConfigured()` — returns `{ ok: false, notConfigured: true }`. **No key exists; this is the current state for both roles.** |

### Profile & preferences

| Action | Manager | Developer | Enforced by |
|---|---|---|---|
| Read a co-member's profile (name, picture) | ✅ | ✅ | RLS `profiles_select` (`shares_workspace_with(id)`) |
| Edit own profile (name, picture, locale, theme) | ✅ own row | ✅ own row | RLS `profiles_update_own` (`id = auth.uid()`); `saveAvatarUrl` also validates the URL server-side (same project + `avatars` bucket + own folder) |
| Edit another member's profile | ❌ | ❌ | RLS `profiles_update_own` |
| Upload a profile picture | ✅ own folder | ✅ own folder | Storage RLS `avatars_insert_own` (first path segment = own user id, extension + 2 MB checks) + client validation (`lib/avatar.ts`) + server URL check. **Requires migration 0008 — NOT applied; uploads cannot work yet.** |

### Demo data (not an app feature)

| Action | Who | Enforced by |
|---|---|---|
| `node scripts/seed-demo.ts` / `reset-demo.ts` | The owner, locally only | Not part of the app. Reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.demo.local` (never from the app or Vercel). Seed refuses to run twice without `--force`; reset deletes only the demo workspace (exact-name + manager-ownership check). **Never run against a real database yet.** |

## 2. The helpers (single source of truth in code)

`lib/permissions.ts` — pure functions, unit-tested
(`tests/unit/permissions.test.ts`, 20 tests):

- `isManager(role)` — `role === "manager"`.
- `canManageProjects(role)` / `canManageTasks(role)` /
  `canInvite(role)` — manager only.
- `canDeleteComment(role, authorId, userId)` — manager, or the author.
- `canChangeTaskStatus(role, assignedTo, userId)` — manager, or a
  developer whose id matches the assignee. A null/unknown role returns
  false even when the assignee matches (Part 2 null-role fix).
- `canEditTaskDetails(role, ...)` — manager only, always.
- `canManageSubtask(role, parentAssignedTo, userId, isOwnSubtask)` —
  manager, or a developer on their own parent's subtask. Same
  null-role guard (Part 3 fix).
- `canCreateSubtask(role, parentTask, userId)` — never under a
  subtask; manager anywhere; developer only under their own assigned
  task.

`lib/board-permissions.ts` — `canDragTask` (manager, or assignee;
null role never), `canReorderTasks` (manager only),
`dragDisabledReason` (user-facing lock text).

Every one of these helpers is **advisory**: the database (RLS +
triggers) enforces the same rule independently. If a helper and the
database ever disagree, the database wins and the user gets the
database's error.

## 3. What is NOT restricted (deliberately)

- **Viewing is open inside a workspace.** Both roles see all projects,
  all tasks (including other developers'), all comments, the full
  activity log, and co-members' profiles. There is no "only my tasks"
  visibility rule — the "My tasks only" toggle on `/dashboard/tasks`
  is a filter, not a permission.
- **Commenting is open.** Any member can comment on any task or
  subtask in the workspace.
- **One manager per workspace.** There is no "promote a developer to
  manager" action and no role-change policy (`members_update_none`).
  If the workspace needs a second manager, that is a product decision
  not yet made — do not work around it by hand-editing
  `workspace_members` in the dashboard.
- **No workspace deletion by developers, no self-removal at all.**
  The manager cannot remove themselves either
  (`remove_workspace_member` rejects it; the last-manager trigger is
  the backstop).

## 4. How the rules were verified

- **Unit:** `tests/unit/permissions.test.ts` (20 tests, incl. null /
  undefined / unknown `"admin"` roles) and
  `tests/unit/board-permissions.test.ts`. Last full run: **251/251
  unit tests passing** (22 files, 2026-11-13).
- **Security suite:** `npm run test:security` — **22 passed | 4
  skipped** (26). The per-case evidence is in the `[CASE …]` stdout
  lines in `docs/BUILD_LOG.md` (Part 2: cases a–s — 42501 denials,
  0-row reads, P0001 trigger raises, cross-workspace 0/0/0, second
  invite accept "already used", parent-completion block; Part 3: AI
  role gate live, AI bundle scan — 63 client JS files, no GEMINI/key
  hits).
- **Live browser (Part 1, 12/12 steps):** developer could change an
  assigned task's status but title/deadline/assignee were read-only
  text; parent completion with 1 open subtask blocked with the exact
  toast; invite reuse rejected; developer at
  `/dashboard/projects/new` got "Page not found".
- **Live browser (Part 2):** board drag rules (own card moves,
  unassigned card locked, drag-to-completed rolled back with the
  subtask message), search returned "No matches in this workspace."
  for cross-workspace data, developer analytics page showed the
  no-access page, member removal unassigned 10 open tasks.
- **Live (Part 3):** developer GET `/dashboard/analytics` → 200
  "Analytics is for managers", no chart data; direct server-action
  POST as developer → `{"error":"Only the workspace manager can view
  analytics."}`; AI role gate verified the same way.

## 5. NOT verified

- `tests/rls/rls-tests.sql` (T01–T32) — the per-policy SQL assertion
  suite — has **never been run** (needs Docker/psql). It is the only
  check that would prove every policy in `docs/DATABASE.md` §5
  directly.
- AI RLS (workspace B reading workspace A's `ai_summaries`) — **NOT
  TESTED**; the table does not exist until migration 0007 is applied.
- Avatar storage RLS — **NOT TESTED** end-to-end; migration 0008 is
  not applied and the E2E spec (`tests/e2e/09-avatar.spec.ts`) has
  not been run green.
