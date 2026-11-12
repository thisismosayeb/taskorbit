# TaskOrbit Part 2 — Notifications / Realtime / Activity (Sections 4–6 + shell)

Track owner: subagent 2026-11-12. Repo `~/workspace/taskorbit`, branch `main`
(HEAD 089a21b at start; no commits made by this track).

## What was built

### Section 4 — Notifications
- **Generation in one place only: database triggers** in
  `supabase/migrations/0004_notifications.sql`. No action file owned by
  another track was edited. Rules (actor = `auth.uid()` inside the trigger;
  recipient = actor is always skipped by `notify_user()`):
  - task assigned / reassigned → new assignee (top-level tasks only;
    subtasks inherit the parent's assignee, so a parent reassignment does
    not spam one notification per subtask).
  - comment added → task assignee + task creator.
  - task / subtask completed → workspace manager(s).
  - task reopened → assignee.
  - invitation accepted → workspace manager(s) (fires on the `accepted_at`
    update inside `accept_invitation()`).
  - project status changed → members who have tasks in that project.
  - No due-soon / overdue reminders (Part 3).
  - `notify_user()` also validates the type against a whitelist, validates
    the title length, and de-dupes identical unread rows for the same entity
    created within 10 s (several triggers can fire for one user action).
- The 0001 `notify_on_task_assigned()` function is **replaced** in 0004
  (same name, so the existing trigger keeps working): the 0001 version
  notified even when the actor assigned a task to themselves and fired once
  per subtask on a cascade reassign. Both fixed.
- Index `idx_notifications_recipient_read` on
  `notifications (recipient_id, read_at, created_at desc)`.
- `lib/actions/notifications.ts` — `getUnreadCount`, `getLatestNotifications`,
  `listNotifications` (All/Unread, 20/page), `markNotificationRead`,
  `markAllNotificationsRead`. All scoped by active workspace + recipient;
  RLS (`notifications_select_own`) enforces the same bound server-side.
- `components/notifications/notification-bell.tsx` — bell + unread badge in
  the top bar, dropdown with latest 10, live count updates, "Mark all as
  read". `components/notifications/notification-item.tsx` — shared row
  (title, short body, relative time, unread dot; click marks read and
  navigates to the task/project). `components/notifications/notification-list.tsx`
  — All / Unread tabs, mark-all, pagination.
- `app/dashboard/notifications/page.tsx` — server page, `?tab=` + `?page=`.
- `lib/notifications.ts` — `getNotificationHref()` (task → task page,
  project → project page, else notifications page).

### Section 5 — Realtime
- `supabase/migrations/0005_realtime_analytics.sql` — adds `tasks`,
  `comments`, `notifications` to the `supabase_realtime` publication
  (guarded DO block: a fresh local Postgres has no such publication; the
  duplicate_object handler makes it re-runnable), `REPLICA IDENTITY FULL`
  on all three tables, and the spec index `tasks(status)`.
- `lib/realtime/client.ts` — one shared browser Supabase client.
- `lib/realtime/hooks.ts` — `useRealtimeSubscription` (generic, with the
  polling fallback) plus `useTaskCommentsRealtime`, `useNotificationsRealtime`,
  `useProjectTasksRealtime`, `useTaskRealtime`. Every channel filters to
  rows the user may see (own notifications, one task's comments, one
  project's tasks) — never a workspace-wide channel. Channels are removed
  on unmount / when the filter changes. Fallback: if a channel errors or
  does not reach SUBSCRIBED within 10 s, poll via `router.refresh()` every
  30 s + on window focus; the mode is only logged (`console.info
  "[realtime] <channel>: live|polling"`) — nothing alarming is shown.
- `components/realtime/realtime-provider.tsx` — mounted once in
  `app/dashboard/layout.tsx`; provides `{ workspaceId, userId }` context.
  It opens no channels itself.

### Section 6 — Activity
- `lib/actions/activity.ts` — `listActivity` (filters: project, member,
  action type; 20/page), `getRecentActivity` (8), `getActivityFilterOptions`.
  Rows enriched with actor profile + task title + project name.
- `lib/activity/format.ts` — `describeActivity()` turns a row into plain
  words ("Rahim completed task Design homepage"): verb phrase + object
  label + link. `ACTIVITY_ACTION_TYPES` is the filter dropdown list.
- `lib/date/relative.ts` — `formatRelativeTime()` ("5 minutes ago",
  "Yesterday", …) and `formatExactTime(iso, timezone)`.
- `app/dashboard/activity/page.tsx` — server page, GET filter form
  (`?project=&member=&action=&page=`), 20/page pagination.
- `components/activity/activity-timeline.tsx` — actor avatar/name, plain-words
  sentence, object link, relative + exact time (workspace timezone).
- `components/activity/activity-filters.tsx` — plain GET form, no JS needed.
- `components/activity/recent-activity.tsx` — **default export
  `RecentActivity`, NO required props, works standalone** (loads its own
  dashboard context), latest 8 + "View all" link. Mount with a bare
  `<RecentActivity />` on the dashboard page.

### Dashboard shell (this track)
- `components/dashboard/sidebar.tsx` — added Board `/dashboard/board`,
  Calendar `/dashboard/calendar`, Activity `/dashboard/activity`,
  Analytics `/dashboard/analytics`, Notifications `/dashboard/notifications`;
  existing links kept. (Board / Calendar / Analytics pages landed from
  their tracks while this track was running, so the links now resolve.)
- `components/dashboard/topbar.tsx` — notification bell mounted, and the
  search dialog mounted too: `components/search/search-dialog.tsx` did not
  exist when this track started, but landed from the search track during
  the session, so `<SearchDialog />` (default export, no required props)
  is now mounted in the top bar next to the bell. Topbar now takes `userId`,
  `initialUnreadCount`, `initialNotifications` props.
- `app/dashboard/layout.tsx` — mounts `<RealtimeProvider>` and fetches the
  bell's initial unread count + latest 10.

### Indexes — where they landed
- `notifications(recipient_id, read_at[, created_at desc])` → 0004.
- `activity_logs(workspace_id, created_at desc)` → **already exists in 0001**
  as `idx_activity_logs_workspace_created`; not duplicated.
- `tasks(status)` → 0005.

## Decisions
- Notification generation stays in triggers (not in `lib/actions/*`) because
  the same event can be produced by a server action, the REST API, or a
  future client — triggers are the only place that cannot be bypassed, and
  the task scope forbade editing the action files other tracks own.
- Assignment notifications for subtasks are suppressed: a subtask's
  `assigned_to` is always copied from its parent, so notifying per subtask
  on a cascade reassign would be noise; the parent's notification covers it.
- The bell counts unread via a server action (`getUnreadCount`) rather than
  trusting the dropdown list: the list is capped at 10, the count is exact.
- Activity object links use the stored `task_id`/`project_id`; deleted
  objects get no link (their rows are cascade-deleted with the object
  anyway — see the open bug below).

## Verification (real runs)
- `npm run test` — **135/135 pass** (10 files), including 14 new tests:
  `tests/unit/relative-time.test.ts` (8) and `tests/unit/activity-format.test.ts` (6).
  (96/96 at the first run; other tracks have added tests since.)
- `npm run typecheck` (`tsc --noEmit`) — clean (re-run after mounting
  SearchDialog).
- `npm run lint` — **clean** ("No ESLint warnings or errors").
- `npm run build` — **PASS, but only via an isolated copy.** The first
  `next build` in the repo compiled successfully (3.3 min) then failed in
  "Collecting page data" with `Cannot find module
  '.next/server/middleware-manifest.json'` — the running dev server on
  :3000 shares the repo's `.next` directory and was recompiling into it at
  the same time. A clean build of an exact copy (source copied to
  `/home/hatch/.build-check-taskorbit`, `node_modules` symlinked, own
  `.next`) then passed fully: **21 routes**, including
  `/dashboard/activity` and `/dashboard/notifications`. The copy was
  deleted afterwards. Do not run `next build` in the repo while the dev
  server is running — the two fight over `.next`.
- Dev server smoke check (curl, after the build): `/login` → **200**,
  `/dashboard/activity` → **307**, `/dashboard/notifications` → **307**
  (redirect to `/login`, correct — logged out). Note: during the in-repo
  build the dev server temporarily returned 500 on every route (including
  pre-existing `/` and `/login`); it recovered on its own once the build
  finished and now serves 200/307 again. No new dev server was started.
- **Migrations NOT applied to any database** (no PAT available yet) —
  validated by careful reading only. `types/database.ts` was NOT regenerated
  (no schema change to table shapes; only new triggers/functions/indexes and
  a publication change, so the generated types are unaffected).
- Realtime live behaviour **NOT TESTED** (no browser) — see "How the parent
  should test realtime" below.

## Audit: does every DECISIONS.md event write an activity row?
Checked `supabase/migrations/0001_init.sql` triggers + `lib/actions/*.ts`:

| Event | Writes a row? | Where |
|---|---|---|
| project created / updated / deleted | YES | `log_project_activity` trigger |
| task created | YES | `log_task_activity` trigger (INSERT) |
| task assigned / reassigned | YES | `log_task_activity` trigger (assignee change) |
| task status changed | YES | `log_task_activity` trigger |
| task completed | YES | `log_task_activity` trigger |
| task reopened | YES | `log_task_activity` trigger |
| subtask created | YES (as `task.created`) | `log_task_activity` trigger fires on the subtask row; the action is `task.created`, not a separate `subtask.created` — the row is there, with the subtask's own `task_id`. |
| comment added | YES | `log_comment_activity` trigger |
| member joined | YES | `log_member_activity` trigger (fires on the `workspace_members` insert inside `accept_invitation()`) |
| **invite created** | **NO — GAP** | `inviteDeveloper()` in `lib/actions/team.ts` inserts into `workspace_invitations` and never writes `activity_logs`; there is no trigger on `workspace_invitations` for insert. |
| **invite revoked** | **NO — GAP** | `revokeInvitation()` in `lib/actions/team.ts` updates `revoked_at` and never writes `activity_logs`; no trigger covers it. (Also `recreateInvitation()` revokes the old invite the same way.) |

## INTEGRATION NOTES (for the parent / other tracks)
1. **Activity gaps — invite created/revoked (DECISIONS.md lists them as
   audited events).** `lib/actions/team.ts` is owned by another track, so
   this track did not edit it. Fix options: (a) the team track adds an
   `activity_logs` insert (action `invite.created` /
   `invite.revoked`, metadata `{invited_email, invitation_id}`) in
   `inviteDeveloper()` / `revokeInvitation()` / `recreateInvitation()`; or
   (b) a new migration adds `AFTER INSERT` / `AFTER UPDATE OF revoked_at`
   triggers on `workspace_invitations` writing the same rows. Either way,
   `lib/activity/format.ts` will need `invite.created` / `invite.revoked`
   cases added to `describeActivity()` (and `ACTIVITY_ACTION_TYPES`).
   Until then the filter dropdown lists only the actions that exist.
2. **Search dialog — DONE, no longer an integration note.**
   `components/search/search-dialog.tsx` landed from the search track
   during this session and `<SearchDialog />` is now mounted in the top
   bar (default export, no required props).
3. **Board / Calendar / Analytics sidebar links now resolve** — those
   pages landed from their tracks during this session.
4. **Task-page realtime mount (task page is another track's file — do NOT
   edit `app/dashboard/tasks/[taskId]/page.tsx` or
   `components/comments/comment-thread.tsx` from this track).** Exact
   instructions for the integration step:
   - In `components/comments/comment-thread.tsx` (client component), at the
     top of the component body (after the existing `useState` lines, before
     `handlePost`), add:
     ```tsx
     import { useRouter } from "next/navigation"; // already imported there
     import { useTaskCommentsRealtime } from "@/lib/realtime/hooks";
     // ...
     const router = useRouter(); // already exists in CommentThread
     useTaskCommentsRealtime(taskId, () => router.refresh());
     ```
     That re-renders the thread from the server whenever a comment on this
     task is inserted, edited or deleted by anyone. (The component already
     calls `router.refresh()` after its own post/edit/delete, so its own
     actions refresh twice at most — harmless.)
   - In `app/dashboard/tasks/[taskId]/page.tsx` (server component) the
     status/assignee live update needs a client wrapper because the page
     itself is a server component. Add a tiny client component, e.g.
     `components/tasks/task-realtime.tsx`:
     ```tsx
     "use client";
     import { useRouter } from "next/navigation";
     import { useTaskRealtime } from "@/lib/realtime/hooks";
     export function TaskRealtime({ taskId }: { taskId: string }) {
       const router = useRouter();
       useTaskRealtime(taskId, () => router.refresh());
       return null;
     }
     ```
     Then in `page.tsx`, inside the returned JSX (e.g. right after the
     opening `<div className="space-y-6">`), add:
     ```tsx
     <TaskRealtime taskId={task.id} />
     ```
   - Board page (other track): in the board client component, call
     `useProjectTasksRealtime(projectId, () => router.refresh())`.
   - Dashboard home: mount the widget with a bare `<RecentActivity />`
     (default import from `@/components/activity/recent-activity`).
5. **Open bug found while auditing (Part 1, NOT this track's scope — do not
   fix by editing 0001).** Deleting a task or project fails at the database:
   `log_task_activity` / `log_project_activity` (0001) insert an
   `activity_logs` row on DELETE with `task_id` / `project_id` = the
   just-deleted id, but `activity_logs.task_id` / `project_id` are foreign
   keys to `tasks` / `projects` — so the insert violates the FK and the
   whole DELETE is rolled back. **Verified live against the test project
   2026-11-12** (manager session via REST): creating a throwaway task
   succeeded, deleting it returned
   `23503 insert or update on table "activity_logs" violates foreign key
   constraint "activity_logs_task_id_fkey"` — `Key (task_id)=(...) is not
   present in table "tasks"`. Consequence: `deleteTask` / `deleteProject`
   in the UI can never succeed, and a "task deleted / project deleted"
   activity row can never exist. The throwaway task ("DELETE-TEST
   throwaway", id `35c4a17f-73cb-4665-9a78-8a211c8fffed`, project Website
   Redesign) is still in the test project because it cannot be deleted
   until this is fixed. Fix options for the parent: a new migration that
   either makes the DELETE branch insert the row with `task_id`/`project_id`
   NULL (keeping the title in metadata) or drops the FK columns'
   constraints — do NOT edit `0001_init.sql` (it is already applied to the
   test project; a repair migration is the honest fix).

## How the parent should test realtime (cross-workspace live isolation)
This track could not test it (no browser). Do this with two browser
profiles (manager + developer, as in the Part 1 E2E):
1. Manager opens a task page; developer (separate profile) posts a comment
   on the same task → the manager's comment list updates without reload.
2. Developer changes the task status on their own screen → the manager's
   task page status chip updates without reload.
3. Manager assigns a task to the developer → the developer's bell badge
   increments without reload.
4. **Isolation:** open two workspaces (or two users who share no workspace)
   and repeat step 1–3 — no update must appear in the other workspace's
   pages, and the bell must never increment for another workspace's events.
   Also check the browser console: each subscription should log
   `[realtime] taskorbit-...: live`; if it logs `polling`, realtime did not
   connect (check the Supabase project's Realtime settings / publication)
   and the 30 s poll is covering for it.
5. After the migrations are applied (PAT), also verify in the database that
   `supabase_realtime` lists `tasks`, `comments`, `notifications`
   (`select * from pg_publication_tables where pubname='supabase_realtime';`)
   and that a comment insert produces a notification for the assignee +
   creator (not the commenter).
