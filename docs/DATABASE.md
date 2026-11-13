# TaskOrbit — Database

The complete database reference, read from
`supabase/migrations/0001_init.sql` → `0008_avatar.sql`. Nothing here
is from memory: table names, columns, types, constraints, indexes,
triggers, functions and policies are copied from the migration files.
If a migration and this doc ever disagree, the migration wins.

**Status (2026-11-13):** migrations `0001`–`0006` are applied to the
test Supabase project (`taskorbit-test`, ref
`mjhkxhewcajrewicyztm`). Migrations `0007` and `0008` are **written
but NOT applied to any database**. The production Supabase project
does not exist yet.

## 1. Migration order

| # | File | Lines | Contents | Applied? |
|---|---|---|---|---|
| 1 | `0001_init.sql` | 986 | Extensions, enums, 9 tables, indexes, 26 helper/trigger functions, 27 triggers, 36 RLS policies | Yes — test project |
| 2 | `0002_rpc.sql` | 124 | `create_workspace`, `accept_invitation` | Yes — test project |
| 3 | `0003_invites_fix.sql` | 136 | `remove_workspace_member` | Yes — test project |
| 4 | `0004_notifications.sql` | 345 | `notify_user`, 5 notification functions, 4 triggers, 1 index; replaces the 0001 assign notifier | Yes — test project |
| 5 | `0005_realtime_analytics.sql` | 31 | `supabase_realtime` publication, `REPLICA IDENTITY FULL`, `tasks(status)` index | Yes — test project |
| 6 | `0006_delete_activity_fix.sql` | 124 | Replaces `log_task_activity` / `log_project_activity` (DELETE branches write NULL ids) | Yes — test project |
| 7 | `0007_ai.sql` | 691 | `ai_summaries`, `ai_usage`, `daily_job_runs` + 6 RPCs; extends `notify_user` whitelist | **No — written, not applied** |
| 8 | `0008_avatar.sql` | 91 | Public `avatars` Storage bucket + 4 storage RLS policies | **No — written, not applied** |

Rules: apply in order, never edit an applied migration in place,
never skip. Later migrations replace functions **by name** (same
name, existing triggers keep working) — `0004` replaces
`notify_on_task_assigned()`, `0006` replaces the two activity-log
functions, `0007` replaces `notify_user()`.

## 2. Enums

| Enum | Values | Defined in |
|---|---|---|
| `workspace_role` | `manager`, `developer` | 0001 |
| `project_status` | `planning`, `active`, `on_hold`, `completed`, `archived` | 0001 |
| `priority` | `low`, `medium`, `high`, `urgent` | 0001 |
| `task_status` | `todo`, `in_progress`, `in_review`, `completed` | 0001 |

## 3. Tables

### 3.1 `profiles`

One row per auth user, auto-created on signup. (0001)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | FK `auth.users(id)` ON DELETE CASCADE |
| `full_name` | text | nullable |
| `avatar_url` | text | nullable — public URL of the picture in the `avatars` bucket (0008) |
| `preferred_locale` | text NOT NULL | default `'en'` |
| `theme_preference` | text NOT NULL | default `'system'` |
| `created_at` | timestamptz NOT NULL | default `now()` |
| `updated_at` | timestamptz NOT NULL | default `now()` |

Triggers: `trg_profiles_touch` (`touch_updated_at`). No client INSERT
policy — rows are created only by `handle_new_user()` on `auth.users`.

### 3.2 `workspaces`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `name` | text NOT NULL | `char_length(btrim(name)) > 0 AND char_length(name) <= 100` |
| `slug` | text NOT NULL | UNIQUE — human-readable + 6-char random suffix, built by `create_workspace` |
| `timezone` | text NOT NULL | default `'Asia/Dhaka'` |
| `created_by` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `created_at` / `updated_at` | timestamptz NOT NULL | default `now()` |

Triggers: audit insert, `protect_created_by`, `touch_updated_at`.

### 3.3 `workspace_members`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `user_id` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `role` | `workspace_role` NOT NULL | default `'developer'` |
| `joined_at` | timestamptz NOT NULL | default `now()` |

Unique: `(workspace_id, user_id)`. Indexes: `user_id`, `workspace_id`.
Triggers: `set_member_audit` (sets `joined_at`), `log_member_activity`
(`member.joined`), `prevent_last_manager_removal` (BEFORE DELETE —
the last manager cannot be removed).

### 3.4 `workspace_invitations`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `invited_email` | text NOT NULL | lowercased + trimmed by trigger |
| `intended_role` | `workspace_role` NOT NULL | default `'developer'`, CHECK `intended_role = 'developer'` — only developers can be invited |
| `token_hash` | text NOT NULL | SHA-256 hex of the raw token; the raw token is never stored |
| `expires_at` | timestamptz NOT NULL | default `now() + interval '7 days'` (set by trigger when null) |
| `created_by` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `accepted_at` | timestamptz | nullable |
| `revoked_at` | timestamptz | nullable |
| `created_at` | timestamptz NOT NULL | default `now()` |

Unique index on `token_hash`. Index on `workspace_id`. Trigger:
`set_invitation_audit`.

### 3.5 `projects`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `name` | text NOT NULL | `char_length(btrim(name)) > 0 AND char_length(name) <= 200` |
| `description` | text | nullable |
| `status` | `project_status` NOT NULL | default `'planning'` |
| `priority` | `priority` NOT NULL | default `'medium'` |
| `start_date` / `due_date` | date | nullable, CHECK `due_date >= start_date` (when both set) |
| `created_by` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `created_at` / `updated_at` | timestamptz NOT NULL | default `now()` |

Index: `workspace_id`. Triggers: audit insert, protect, touch,
`log_project_activity` (INSERT/UPDATE/DELETE).

### 3.6 `tasks`

The core table. A subtask is a row with `parent_task_id` set.

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `project_id` | uuid NOT NULL | FK `projects` ON DELETE CASCADE |
| `parent_task_id` | uuid | FK `tasks` ON DELETE CASCADE, CHECK `parent_task_id <> id` |
| `title` | text NOT NULL | `char_length(btrim(title)) > 0 AND char_length(title) <= 300` |
| `description` | text | nullable |
| `assigned_to` | uuid | FK `auth.users` ON DELETE SET NULL |
| `created_by` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `status` | `task_status` NOT NULL | default `'todo'` |
| `priority` | `priority` NOT NULL | default `'medium'` |
| `start_date` / `due_date` | date | nullable, CHECK `due_date >= start_date` |
| `completed_at` | timestamptz | server-managed (see below) |
| `position` | int NOT NULL | default `0` — Kanban order within a column |
| `created_at` / `updated_at` | timestamptz NOT NULL | default `now()` |

Indexes: `project_id`, `parent_task_id`, `assigned_to`, `due_date`,
`status` (0005). `REPLICA IDENTITY FULL` (0005, for Realtime
payloads).

Triggers (BEFORE triggers fire in alphabetical order by name):

| Trigger | Function | What it does |
|---|---|---|
| `trg_tasks_audit_insert` | `set_insert_audit` | `created_at = now()`, `created_by = auth.uid()` (clients cannot set them) |
| `trg_tasks_block_completion` | `block_parent_completion` | BEFORE UPDATE OF status: a parent cannot complete while any subtask is open — raises `Complete all subtasks first (X of Y done).` |
| `trg_tasks_completed_at` | `maintain_completed_at` | `completed_at = now()` on completion, NULL otherwise; preserved if already completed |
| `trg_tasks_enforce_developer` | `enforce_developer_task_update` | Non-managers: top-level assigned task → status only; subtask → title/description/due date/priority/status only; other people's tasks → raise |
| `trg_tasks_protect_created` | `protect_created_by` | `created_by` frozen on update |
| `trg_tasks_touch` | `touch_updated_at` | `updated_at = now()`, `created_at` frozen |
| `trg_tasks_validate` | `validate_task` | Parent must be top-level + same project; no self-reference; subtask assignee copied from parent on insert; assignee must be a workspace member |
| `trg_tasks_activity` | `log_task_activity` | AFTER INSERT/UPDATE/DELETE → `activity_logs` |
| `trg_tasks_cascade_reassign` | `cascade_task_reassign` | AFTER UPDATE OF `assigned_to` on a parent: subtasks reassigned too |
| `trg_tasks_notify_assigned` | `notify_on_task_assigned` | AFTER INSERT/UPDATE OF `assigned_to`: assignment notification (function replaced in 0004) |
| `trg_tasks_notify_status` | `notify_on_task_status` | AFTER UPDATE OF status: completion → managers; reopen → assignee (0004) |
| `trg_tasks_reopen_parent` | `reopen_parent_on_subtask_change` | AFTER INSERT/UPDATE OF status on a subtask: a completed parent goes back to `in_progress` |

### 3.7 `comments`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `task_id` | uuid NOT NULL | FK `tasks` ON DELETE CASCADE |
| `author_id` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `content` | text NOT NULL | `char_length(btrim(content)) BETWEEN 1 AND 2000` |
| `created_at` / `updated_at` | timestamptz NOT NULL | default `now()` |

Index: `task_id`. `REPLICA IDENTITY FULL` (0005). Triggers: audit
insert (`author_id = auth.uid()`), touch, `log_comment_activity`
(`comment.added`), `notify_on_comment_added` (0004 — assignee +
creator, never the actor).

### 3.8 `activity_logs`

Write-mostly; never edited by clients.

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `project_id` | uuid | FK `projects` ON DELETE CASCADE |
| `task_id` | uuid | FK `tasks` ON DELETE CASCADE |
| `actor_id` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `action` | text NOT NULL | e.g. `task.created`, `task.status_changed`, `task.completed`, `task.reopened`, `task.assigned`, `task.reassigned`, `task.deleted`, `comment.added`, `project.created/updated/deleted`, `member.joined`, `member.removed`, `workspace.created`, `invitation.accepted`, `invite.created`, `invite.revoked` |
| `metadata` | jsonb NOT NULL | default `'{}'` |
| `created_at` | timestamptz NOT NULL | default `now()` |

Indexes: `(workspace_id, created_at DESC)`, `task_id`. The DELETE
branches of the log functions write `project_id` / `task_id` as NULL
(0006 fix) — the FK would otherwise point at a just-deleted row and
the whole DELETE would fail with 23503 (the Part 1 bug that made
task/project delete impossible).

### 3.9 `notifications`

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `recipient_id` | uuid NOT NULL | FK `auth.users` ON DELETE CASCADE |
| `actor_id` | uuid | FK `auth.users` ON DELETE SET NULL |
| `type` | text NOT NULL | Whitelist enforced by `notify_user()` (see §4) |
| `title` | text NOT NULL | 1–200 chars, enforced by `notify_user()` |
| `body` | text NOT NULL | default `''` |
| `entity_type` | text | `'task'` / `'project'` / `'workspace'` — no FK (see `docs/ERD.md`) |
| `entity_id` | uuid | the referenced row's id |
| `read_at` | timestamptz | nullable — NULL means unread |
| `created_at` | timestamptz NOT NULL | default `now()` |

Indexes: `(recipient_id, created_at DESC)` (0001),
`(recipient_id, read_at, created_at DESC)` (0004).
`REPLICA IDENTITY FULL` (0005). Written only by triggers / the cron
RPCs — never by server actions.

### 3.10 `ai_summaries` (0007 — NOT APPLIED)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `project_id` | uuid | FK `projects` ON DELETE CASCADE |
| `user_id` | uuid | FK `auth.users` ON DELETE CASCADE |
| `summary_type` | text NOT NULL | `daily_brief`, `project_summary`, `my_focus`, `deadline_risk`, `standup`, `next_actions` |
| `locale` | text NOT NULL | default `'en'` |
| `summary_date` | date NOT NULL | the workspace-local date the summary is for |
| `content` | jsonb NOT NULL | the validated JSON the model returned |
| `model` | text NOT NULL | default `''` |
| `input_digest` | text NOT NULL | SHA-256 hex of the canonical input JSON |
| `generated_by` | uuid | FK `auth.users` ON DELETE SET NULL |
| `generated_at` | timestamptz NOT NULL | default `now()` |
| `expires_at` | timestamptz NOT NULL | default `now() + interval '7 days'` |

Unique index `uq_ai_summaries_scope` on
`(workspace_id, coalesce(project_id, zero-uuid), coalesce(user_id,
zero-uuid), summary_type, locale, summary_date)` — NULLs never
conflict in a plain UNIQUE constraint, so the coalesce makes the
scope rule real. Index: `(workspace_id, summary_date)`. No prompts,
emails, keys or auth data are stored.

### 3.11 `ai_usage` (0007 — NOT APPLIED)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `actor_id` | uuid | FK `auth.users` ON DELETE SET NULL |
| `feature` | text NOT NULL | one of the six AI features |
| `request_date` | date NOT NULL | workspace-local date |
| `status` | text NOT NULL | `ok`, `error`, `limit`, `cached` |
| `estimated_tokens` | int NOT NULL | default `0` — chars/4 estimate, not a metered count |
| `created_at` | timestamptz NOT NULL | default `now()` |

Indexes: `(workspace_id, request_date)`, `(actor_id, created_at)`.
Counts and statuses only — no prompts, replies, secrets or keys.

### 3.12 `daily_job_runs` (0007 — NOT APPLIED)

| Column | Type | Constraints / default |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `workspace_id` | uuid NOT NULL | FK `workspaces` ON DELETE CASCADE |
| `job` | text NOT NULL | `daily_reminders` or `daily_brief` |
| `local_date` | date NOT NULL | workspace-local date |
| `result` | jsonb NOT NULL | default `'{}'` — counts from the run |
| `created_at` | timestamptz NOT NULL | default `now()` |

Unique: `(workspace_id, job, local_date)` — the idempotency ledger:
a second cron run the same day finds the row and does nothing extra.

### 3.13 Storage: `avatars` bucket (0008 — NOT APPLIED)

`storage.buckets` row: `id = 'avatars'`, `name = 'avatars'`,
`public = true`. Objects live at
`<user-id>/avatar-<timestamp>.<ext>` in `storage.objects`. The bucket
is public for reads (pictures render in server components without
signed URLs); writes are restricted by the four storage policies in
§6.4. `profiles.avatar_url` stores the public URL — there is no FK
between `profiles` and `storage.objects`.

## 4. Functions

All SECURITY DEFINER functions set `search_path = ''` and
schema-qualify every reference. EXECUTE is revoked from `public` and
granted only to the roles listed (see §5 for the `anon` exceptions).

### 4.1 Membership helpers (0001)

| Function | Returns | Purpose |
|---|---|---|
| `is_workspace_member(p_workspace_id)` | boolean | `auth.uid()` has a row in `workspace_members` |
| `member_role(p_workspace_id)` | `workspace_role` | the caller's role, or NULL |
| `project_workspace_id(p_project_id)` | uuid | the workspace of a project |
| `task_workspace_id(p_task_id)` | uuid | the workspace of a task (via its project) |
| `is_task_assignee(p_task_id, p_user_id)` | boolean | the task itself, or its parent, is assigned to the user |
| `shares_workspace_with(p_user_id)` | boolean | caller shares at least one workspace with the user |
| `sha256_hex(p_input)` | text | SHA-256 hex (pgcrypto, `extensions` schema); used for invitation tokens |

### 4.2 Audit / maintenance triggers (0001)

`set_insert_audit` (created_at/created_by),
`set_comment_audit`, `set_invitation_audit` (lowercases email, sets
7-day expiry), `set_member_audit`, `touch_updated_at`,
`protect_created_by`, `handle_new_user` (trigger on `auth.users` —
creates the `profiles` row from signup metadata).

### 4.3 Task rules (0001)

`validate_task`, `maintain_completed_at`,
`block_parent_completion`, `enforce_developer_task_update`,
`cascade_task_reassign`, `reopen_parent_on_subtask_change`,
`prevent_last_manager_removal` — see the trigger table in §3.6.

### 4.4 Activity + notifications (0001, 0004, 0006)

`log_project_activity`, `log_task_activity` (0001, DELETE branches
replaced in 0006), `log_comment_activity`, `log_member_activity`,
`notify_on_task_assigned` (0001, replaced in 0004 — top-level tasks
only, skips self-assignment, no per-subtask spam),
`notify_on_comment_added`, `notify_on_task_status`,
`notify_on_invite_accepted`, `notify_on_project_status`,
`actor_display_name`.

**`notify_user()`** (0004, whitelist extended in 0007) is the single
insert path for notifications. It skips null recipients and
recipient == actor, validates the type against the whitelist and the
title length (1–200), and de-dupes identical unread rows for the same
entity created within 10 s. Valid types after 0007:
`task_assigned`, `task_reassigned`, `task_completed`, `task_reopened`,
`comment_added`, `invite_accepted`, `project_status_changed`,
`task_due_soon`, `task_overdue`.

### 4.5 RPCs (0002, 0003, 0007)

| Function | What it does |
|---|---|
| `create_workspace(p_name)` | Validates the name, builds a unique slug, inserts the workspace + the creator as `manager` + a `workspace.created` activity row. Returns the workspace id. |
| `accept_invitation(p_token)` | Hashes the token, checks not-revoked / not-used / not-expired, checks the logged-in user's verified email matches `invited_email`, inserts the member as `developer` (on conflict do nothing), atomically marks `accepted_at` (only the first concurrent caller wins), logs `invitation.accepted`. Returns the workspace id. |
| `remove_workspace_member(p_workspace_id, p_user_id)` | Manager-only, atomic: unassigns the target's OPEN tasks in the workspace (completed tasks stay assigned), deletes the membership, logs `member.removed`. The manager cannot remove themselves; the manager can never be removed (the trigger is the backstop). Returns the count of unassigned open tasks. |
| `run_daily_reminders(p_workspace_id, p_local_date)` | Idempotent via `daily_job_runs`: due-soon (top-level, due today/tomorrow, not completed, has assignee → assignee) + overdue (top-level, past due, not completed → assignee + managers, once per task ever). Returns counts. |
| `run_daily_reminders_all()` | Fans out to every workspace on its own local date (from the workspace timezone). |
| `get_daily_brief_input(p_workspace_id)` | Minimal brief input only: workspace, active projects, tasks (titles/statuses/dates/assignee first names), last 10 comments (200 chars), 24 h activity count, today's cached digest, today's workspace usage count. |
| `cron_write_allowed(p_workspace_id)` | True when today's `daily_reminders` job has already run for the workspace — the gate that lets the session-less cron route write. |
| `save_ai_summary(...)` | Upserts an `ai_summaries` row (7-day expiry). Signed-in caller must be a member and may only save another user's `my_focus` if manager; session-less caller may only save a `daily_brief` after `cron_write_allowed`. |
| `log_ai_usage(...)` | Inserts an `ai_usage` row. Same caller rules (session-less: `daily_brief` only, after the reminders job). |

## 5. Row Level Security — all policies

RLS is enabled on every table. There are **no unconditional
policies**. General shape: members read; managers write; developers
write only their own assigned work; authors own their comments;
recipients own their notifications; AI tables have read policies only
— writes go through the RPCs.

### 5.1 `profiles` (0001)

| Policy | Operation | Rule |
|---|---|---|
| `profiles_select` | SELECT | own row, or `shares_workspace_with(id)` |
| `profiles_insert_none` | INSERT | `false` — clients can never insert (trigger only) |
| `profiles_update_own` | UPDATE | `id = auth.uid()` |
| `profiles_delete_none` | DELETE | `false` |

### 5.2 `workspaces` (0001)

| Policy | Operation | Rule |
|---|---|---|
| `workspaces_select` | SELECT | `is_workspace_member(id)` |
| `workspaces_insert` | INSERT | `created_by = auth.uid()` |
| `workspaces_update_manager` | UPDATE | `member_role(id) = 'manager'` |
| `workspaces_delete_manager` | DELETE | `member_role(id) = 'manager'` |

### 5.3 `workspace_members` (0001)

| Policy | Operation | Rule |
|---|---|---|
| `members_select` | SELECT | `is_workspace_member(workspace_id)` |
| `members_insert_manager` | INSERT | `member_role(workspace_id) = 'manager'` |
| `members_update_none` | UPDATE | `false` — roles are never changed in place |
| `members_delete_manager` | DELETE | `member_role(workspace_id) = 'manager'` |

### 5.4 `workspace_invitations` (0001) — managers only, all four ops

`invitations_select_manager`, `invitations_insert_manager`,
`invitations_update_manager`, `invitations_delete_manager` — all
require `member_role(workspace_id) = 'manager'`. (Deliberately no
policy change in 0003: the Part 1 "pending invitations stuck at 0"
report was investigated live and the data layer was correct — the bug
was a stale client render, fixed in the component.)

### 5.5 `projects` (0001) — members read, manager writes

`projects_select` (`is_workspace_member(workspace_id)`),
`projects_insert_manager`, `projects_update_manager`,
`projects_delete_manager` (all `member_role = 'manager'`).

### 5.6 `tasks` (0001)

| Policy | Operation | Rule |
|---|---|---|
| `tasks_select` | SELECT | member of the task's workspace |
| `tasks_insert` | INSERT | manager, **or** a subtask under a task assigned to the caller (`is_task_assignee(parent_task_id, auth.uid())`) |
| `tasks_update` | UPDATE | manager, **or** `is_task_assignee(id, auth.uid())` (the trigger then enforces which fields) |
| `tasks_delete` | DELETE | manager, **or** a subtask of a task assigned to the caller |

### 5.7 `comments` (0001)

| Policy | Operation | Rule |
|---|---|---|
| `comments_select` | SELECT | member of the task's workspace |
| `comments_insert` | INSERT | member of the task's workspace |
| `comments_update_author` | UPDATE | `author_id = auth.uid()` |
| `comments_delete` | DELETE | author, **or** workspace manager |

### 5.8 `activity_logs` (0001)

| Policy | Operation | Rule |
|---|---|---|
| `activity_select` | SELECT | member of the workspace |
| `activity_insert` | INSERT | `actor_id = auth.uid()` and member (used by triggers + `lib/actions/team.ts`) |
| `activity_update_none` / `activity_delete_none` | UPDATE / DELETE | `false` |

### 5.9 `notifications` (0001)

| Policy | Operation | Rule |
|---|---|---|
| `notifications_select_own` | SELECT | `recipient_id = auth.uid()` |
| `notifications_insert` | INSERT | `actor_id = auth.uid()` and member (used by triggers) |
| `notifications_update_own` | UPDATE | `recipient_id = auth.uid()` (mark read) |
| `notifications_delete_none` | DELETE | `false` — no deletes in the app |

### 5.10 AI tables (0007 — NOT APPLIED)

| Policy | Operation | Rule |
|---|---|---|
| `ai_summaries_select` | SELECT | member, **and** (`user_id` is NULL **or** own **or** manager) — a `my_focus` summary is personal |
| `ai_usage_select` | SELECT | member, **and** (`actor_id` is NULL **or** own **or** manager) |
| `daily_job_runs_select` | SELECT | member (rows are counts only) |

**No INSERT / UPDATE / DELETE policies exist on any of the three
tables.** Direct writes are denied for every role, including
authenticated users — the RPCs in §4.5 are the only write path.

### 5.11 What `anon` can execute — and why it is safe

Most SECURITY DEFINER functions are granted only to `authenticated`
+ `service_role`. The exceptions exist because the cron route calls
Supabase with the publishable key and **no JWT**:

| Function | Granted to `anon` | Why it is safe by construction |
|---|---|---|
| `run_daily_reminders`, `run_daily_reminders_all` | `anon` | Only writes legitimate reminders (tasks genuinely due today/tomorrow or overdue), only to the assignee and managers, only once per workspace per local date. The worst an unauthenticated caller can do is trigger one day's legitimate reminders early. |
| `get_daily_brief_input` | `anon` | Returns only data every workspace member can already see; the caller must know the workspace UUID (128-bit, unguessable). The intended caller is the cron route, itself protected by `CRON_SECRET`. |
| `save_ai_summary`, `log_ai_usage` | `anon` | The functions enforce the rule themselves: with no session they accept ONLY a `daily_brief` written after today's reminders job has run for that workspace (`cron_write_allowed`). |
| `cron_write_allowed` | `anon` | Returns a boolean; writes nothing. |

Note (verified 2026-11-12 on the test project): `revoke execute
... from public` alone does **not** remove `anon`'s EXECUTE — anon
holds an explicit grant — so the migrations revoke from `anon`
explicitly as well (0003, 0004, 0007).

## 6. Storage RLS (0008 — NOT APPLIED)

Policies on `storage.objects` for bucket `avatars`:

| Policy | Operation | Rule |
|---|---|---|
| `avatars_select_public` | SELECT | `bucket_id = 'avatars'` — to `anon` and `authenticated` (public bucket) |
| `avatars_insert_own` | INSERT | `bucket_id = 'avatars'` **and** first path segment = `auth.uid()` **and** extension in `png/jpg/jpeg/webp/gif` **and** size ≤ 2 MB (2,097,152 bytes, from object metadata) |
| `avatars_update_own` | UPDATE | same own-folder + extension + size checks |
| `avatars_delete_own` | DELETE | own folder only |

Layer 1 (client validation, `lib/avatar.ts`) and layer 3 (server
action URL validation, `lib/actions/avatar.ts`) enforce the same
rules; the storage policy is defence-in-depth. The extension/size
checks in the policy read the object's metadata, which may not be
populated yet at insert time (`coalesce(..., 0)`), so layers 1 and 3
are the primary enforcement.

## 7. Realtime publication (0005)

`alter publication supabase_realtime add table public.tasks,
public.comments, public.notifications` — with `REPLICA IDENTITY FULL`
on all three so UPDATE/DELETE payloads carry the old row too. The
migration is guarded by a DO block because a fresh local Postgres has
no `supabase_realtime` publication while a hosted project does, and
re-runs are tolerated (`duplicate_object` handler). Subscriptions are
still RLS-respecting: a client only receives rows its SELECT policies
allow.

## 8. How to apply and recover

### Apply

Hosted (the used path — SQL Editor, one file at a time, in order
`0001` → `0008`), or with the Management API + a project-scoped PAT
(revoke the PAT immediately afterwards), or locally with
`supabase db push` if you have Docker. Full steps:
`docs/SETUP.md` §4.

### Verify after applying

- 12 tables exist; RLS enabled on all of them (see the queries in
  `docs/SETUP.md` §4).
- 36 RLS policies on the 9 core tables, 3 read policies on the AI
  tables, 4 storage policies on `storage.objects`.
- The 6 AI RPCs exist (0007) and the `avatars` bucket exists, public
  (0008).
- Idempotency check for the cron (0007's own verification block):
  run `select public.run_daily_reminders('<workspace-uuid>',
  current_date);` twice — the second run must return
  `already_run = true`, and `daily_job_runs` must hold exactly 1 row
  for that workspace + job + date, with no extra notifications.

### Recover

- **A migration fails halfway:** fix the cause and re-run the same
  file. 0005 and 0008 are written idempotent-safe (`IF NOT EXISTS`,
  `ON CONFLICT DO NOTHING`, `DROP POLICY IF EXISTS`); 0001–0004 and
  0006–0007 are **not** fully idempotent — re-running them against a
  partially-applied state can fail on `create type` / `create table`
  (already exists). If that happens, drop the partially-created
  objects for that migration only (never the whole database on a
  project with data) and re-run, or restore from backup.
- **Wrong project:** migrations are not reversible by a script. If a
  file was applied to the wrong project, apply the correct project's
  migrations to the right project and treat the wrong one as
  contaminated test data — do not try to "un-apply" by hand-editing
  policies in the dashboard.
- **A trigger blocks a legitimate write** (e.g. "Complete all
  subtasks first"): that is the rule working, not a failure — the
  message is the fix. Do not disable the trigger; fix the data.
- **RLS 42501 errors in the app logs:** usually a missed migration or
  a hand-edited policy. Compare the live policies against this doc
  (Supabase Dashboard → Authentication → Policies) and re-apply the
  missing migration.
- **Backups:** the free tier has no point-in-time recovery. Before the
  viva (and after any big data entry) export tables as CSV from the
  Table Editor, or `pg_dump` against the connection string. Keep the
  exports in the owner's files, not in the repo. See
  `docs/OPERATIONS.md` §4.

### What is NOT verified

- `tests/rls/rls-tests.sql` (T01–T32) has **never been run** — it
  needs Docker/psql. It is the per-policy assertion suite for this
  whole document; until it runs, the policies are verified by code
  review + live browser tests only.
- `supabase gen types` has **never been run** against a real database;
  `types/database.ts` is hand-derived (it does include the 0007
  tables/RPCs, aligned by hand).
- Migrations 0007 and 0008 have **never been applied**, so everything
  in §3.10–§3.13, §5.10 and §6 exists only as SQL in the repo, not as
  a running database.
