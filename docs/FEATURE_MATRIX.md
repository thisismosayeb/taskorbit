# TaskOrbit — Feature Matrix

Every feature from Parts 1–4: where it lives, its status, and how it
was verified. Status meanings: **complete** = built and verified by a
real run; **partial** = built with a documented limitation;
**not done** = not built, or built but never verified end-to-end.
"Verified" here means the evidence in `docs/BUILD_LOG.md` — nothing
else counts.

## Part 1 — Foundation

| Feature | Route | Main files | Status | How it was verified |
|---|---|---|---|---|
| Sign up / log in / log out | `/signup`, `/login` | `app/(auth)/signup/page.tsx`, `app/(auth)/login/page.tsx`, `lib/auth/actions.ts` | Complete | Browser, Part 1 (12/12 exam workflow); Part 2 Step 0.1 both email-confirmation modes (OFF → `/onboarding` directly; ON → "Check your email"); Playwright 02-auth-mascot PASS |
| Forgot / reset password | `/forgot-password`, `/reset-password` | `app/(auth)/forgot-password/page.tsx`, `app/(auth)/reset-password/page.tsx` | Complete | Browser (Part 1 smoke: pages render 200). Reset **email flow itself NOT tested live** — no mailbox check; confirmation was OFF in the test project |
| Auth callback | `/auth/callback` | `app/auth/callback/route.ts` | Complete | Browser (Part 1): confirmation-ON signup returned via callback → `/onboarding` (Part 2) |
| Onboarding (create first workspace) | `/onboarding` | `app/onboarding/page.tsx`, `lib/actions/workspace.ts` | Complete | Browser (Part 1, Part 2) |
| Create workspace (manager = creator) | `/onboarding`, `/dashboard/settings` | RPC `create_workspace` (0002), `lib/actions/workspace.ts` | Complete | Browser Part 1; unit + security suites |
| Switch workspace | top bar | `lib/actions/workspace.ts` (`setActiveWorkspace`, cookie `taskorbit-workspace-id`) | Complete | Browser Part 2 (5 identically-named test workspaces switched correctly) |
| Rename workspace | `/dashboard/settings` | `lib/actions/workspace.ts` (`renameWorkspace`) | Complete | Browser Part 1 |
| Projects: create / edit / delete | `/dashboard/projects`, `/dashboard/projects/new`, `/dashboard/projects/[projectId]` | `app/dashboard/projects/*`, `lib/actions/projects.ts` | Complete | Browser Part 1 (create "Website Redesign", progress 100%); delete verified live Part 2 after the 0006 fix |
| Tasks: create / edit / delete / assign | `/dashboard/projects/[projectId]`, `/dashboard/tasks/[taskId]` | `lib/actions/tasks.ts` | Complete | Browser Part 1; status-change + assignment verified live |
| Subtasks (one level) | `/dashboard/tasks/[taskId]` | `lib/actions/tasks.ts`, trigger `validate_task` | Complete | Browser Part 1: 3 subtasks, 2 of 3 → 67%, parent blocked until all done |
| Parent-completion block | — (trigger) | `block_parent_completion` (0001) | Complete | Browser Part 1: exact toast "Complete all subtasks first (2 of 3 done)."; security suite case q; E2E |
| Parent reopen on subtask change | — (trigger) | `reopen_parent_on_subtask_change` (0001) | Complete | Unit + security suites; browser (Part 2, "Parent check" rollback) |
| Deadline states (Green/Red/Amber/Neutral/No deadline) | task rows, task page, project page | `lib/date/deadline.ts`, `lib/progress.ts` | Complete | Browser Part 1: "Completed on time", "Overdue by 12 hours", "Completed late (12 hours)"; 15 deadline unit tests |
| Progress formulas | dashboard, project page, task page | `lib/progress.ts` | Complete | Browser Part 1: 1 of 1 → 100%, 2 of 2 → 100%, 2 of 3 subtasks → 67%; unit tests (7) |
| Comments | `/dashboard/tasks/[taskId]` | `components/comments/comment-thread.tsx`, `lib/actions/comments.ts` | Complete | Browser Part 1: comment posted + visible to manager; comment live 9.77 s on staging (Part 3) |
| Invites (copy-the-link, no email) | `/dashboard/team`, `/invite/[token]` | `lib/actions/team.ts`, RPC `accept_invitation` (0002) | Complete | Browser Part 1: invite → signup with invited email → "Developer" chip; reuse → "This invitation was already used." |
| Roles & permissions (DB-enforced) | everywhere | `lib/permissions.ts`, RLS + triggers (0001) | Complete | Security suite 22 passed \| 4 skipped; browser Part 1 step 11 (developer → "Page not found" on `/dashboard/projects/new`) |
| Dashboard (KPIs, deadline radar, workload, recent activity) | `/dashboard` | `app/dashboard/page.tsx`, `components/dashboard/*` | Complete | Browser Part 2; Playwright 04-dashboard-tasks PASS; KPI links fixed in Part 3 (see below) |
| Activity log (triggers) | — | `log_*_activity` (0001, 0006) | Complete | Browser Part 1: `comment.added` + `task.completed` recorded |

## Part 2 — Team workflows

| Feature | Route | Main files | Status | How it was verified |
|---|---|---|---|---|
| Kanban board (drag, keyboard Move to…, filters) | `/dashboard/board` | `app/dashboard/board/page.tsx`, `components/board/*`, `lib/actions/board.ts`, `lib/board-permissions.ts` | Complete | Browser Part 2 tests 2–5 PASS (own card moves + persists; unassigned locked; drag-to-completed rolls back; keyboard menu works); Playwright |
| Calendar (month/week/list) | `/dashboard/calendar` | `app/dashboard/calendar/page.tsx`, `lib/calendar.ts`, `lib/actions/calendar.ts` | Complete | Browser Part 2 test 6 PASS; mobile 375/390 PASS on staging |
| Global search (projects/tasks/members) | top bar (Ctrl/Cmd+K) | `components/search/search-dialog.tsx`, `lib/actions/search.ts` | Complete | Browser Part 2 test 7 PASS; cross-workspace leak check ("No matches in this workspace.") |
| Filters & sort (URL-persisted) | `/dashboard/my-tasks` | `app/dashboard/my-tasks/page.tsx`, `lib/filters.ts`, `components/tasks/task-filters.tsx` | Complete | Browser Part 2 test 8 PASS (filters persisted after refresh, identical URL) |
| Notifications (triggers only) | `/dashboard/notifications` | `lib/actions/notifications.ts`, `components/notifications/*`, 0004 | Complete (generation) | Browser Part 2 test 12 (activity) + notification rows verified in DB; duplicate-assignment bug found live and fixed (exactly one notification per assignment) |
| Bell + unread count | top bar | `components/notifications/notification-bell.tsx` | **Partial — live update broken** | Bell shows the current list on load and updates on refresh / polling. **Live update FAIL on staging (proven app bug, Part 4 item)** — see Realtime row below |
| Realtime (comments/tasks live) | task page, board | `lib/realtime/*`, `components/tasks/task-realtime.tsx`, `components/comments/comment-thread.tsx` | Complete (comments/tasks) | Comment live **9.77 s on staging** (Part 3, mode live); 13.6 s on local dev (polling) |
| Realtime (bell live) | top bar | `lib/realtime/hooks.ts` (`useNotificationsRealtime`), bell | **Not done (bug)** | FAIL on staging, 2 runs: channel live within 5 s, DB row created (54 → 60), bell never moved in ~150 s. Root cause diagnosed in Part 4 Track A (anonymous channel join — see `docs/ARCHITECTURE.md` §5); fix in working tree, **unverified** |
| Activity page (filters, 20/page) | `/dashboard/activity` | `app/dashboard/activity/page.tsx`, `lib/activity/*` | Complete | Browser Part 2 test 12 PASS (109 entries, 6 pages, correct actors/times) |
| Analytics (manager only, 6 charts) | `/dashboard/analytics` | `app/dashboard/analytics/page.tsx`, `lib/actions/analytics.ts`, `lib/analytics.ts` | Complete | Browser Part 2 test 13 PASS (37 tasks: 3 completed, 34 open; deadline health sums to 37); test 14 PASS (developer no-access); server-action POST verified both roles |
| Team page (members, pending invites, revoke/re-create, remove member) | `/dashboard/team` | `app/dashboard/team/page.tsx`, `components/team/*`, `lib/actions/team.ts`, RPC `remove_workspace_member` (0003) | Complete | Browser Part 2 test 15 PASS (remove member with 10 open tasks → all unassigned, member gone); invite pending row verified |
| Settings (rename workspace, preferences) | `/dashboard/settings` | `app/dashboard/settings/page.tsx`, `lib/actions/preferences.ts` | Complete | Browser Parts 1–3; avatar upload form added in Part 4 (see below) |

## Part 3 — Design, motion, dark mode, Bangla & AI

| Feature | Route | Main files | Status | How it was verified |
|---|---|---|---|---|
| Step 0.3 — `/dashboard/tasks` + KPI links | `/dashboard/tasks` | `app/dashboard/tasks/page.tsx`, `components/tasks/task-filters.tsx` | Complete | Playwright + staging re-tests 4/4 PASS (KPI links, "My tasks only" default ON, liquid progress); anonymous GET → 307 to `/login` |
| Brand & logo | all pages | `public/brand/*`, `components/brand/logo.tsx`, `app/globals.css`, `tailwind.config.ts` | Complete | Playwright 01-landing PASS (logo/favicon/OG 200). **Note:** the 4 binary brand files are NOT on GitHub (text snapshot only) |
| Landing + public pages | `/`, `/about`, `/developers`, `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt` | `components/landing/*`, `app/page.tsx`, `app/about/*`, `app/developers/*`, `app/privacy/*`, `app/terms/*`, `app/sitemap.ts`, `app/robots.ts` | Complete | Playwright: sections/CTAs/mobile menu/skip link/focus/overflow 375 px PASS; exact headline "Turn Big Ideas Into" in served HTML |
| Auth redesign + Orbit mascot | `/login`, `/signup` | `components/auth/orbit-mascot.tsx`, `components/auth/auth-form.tsx` | Complete | Playwright 02-auth-mascot PASS (idle/look/shy + error/success states) |
| Dashboard polish + Liquid Progress | `/dashboard`, project/task pages | `components/motion/liquid-progress.tsx`, `components/motion/skeletons.tsx`, `components/motion/wave-loader.tsx` | Complete | Live % verified: "Part2 Test Project" 0 of 1 → 0%, "Website Redesign" 3 of 68 → 4%, task 3 of 3 → 100%; unit tests in `tests/unit/liquid-progress.test.ts` |
| Motion (GSAP) | `/` landing | `components/landing/landing-page.tsx` (GSAP + ScrollTrigger) | Complete | Playwright: reduced-motion computed duration 0.01 ms; hero/reveal animations observed. **GSAP is used only on the landing page** |
| Dark / Light / System theme | all pages | `components/theme/*`, `lib/actions/preferences.ts`, `lib/theme/*` | Complete | Playwright 03-theme-locale PASS (theme cycle + refresh; survives re-login after the Part 3 fix — the bug was real and is fixed); contrast measured, all AA PASS |
| English / Bangla | all pages | `lib/i18n/bn.ts`, `lib/i18n/dictionary.ts`, `lib/i18n/format.ts`, `components/i18n/*` | Complete | Parity **1060/1060 keys**, none missing/extra (unit test). Language EN→Bangla on landing/auth + refresh PASS. Known gaps: server-action error strings stay English; counts use Latin digits in Bangla; first-load SSR flash English→Bangla |
| TaskOrbit AI — 6 features | `/dashboard/ai` | `lib/ai/*`, `lib/actions/ai.ts`, `components/ai/*`, `app/dashboard/ai/page.tsx` | **Partial — no-key path only** | No-key path verified live: `/dashboard/ai` shows "not configured"; manager control POST → `{"ok":false,"error":"TaskOrbit AI is not configured yet.","notConfigured":true}`; developer POST → role-gate error. **AI with a key: NOT TESTED (no key provided).** Cache/usage need migration 0007 — **not applied**, so nothing is cached or logged |
| Daily scheduler (Vercel Cron) | `GET /api/cron/daily` | `app/api/cron/daily/route.ts`, `vercel.json`, `lib/ai/cron-*` | **Partial — route works, reminders cannot run** | Cron auth verified live: no secret → 401, wrong secret → 401, with secret → 200. Body on both runs: `reminders.failed: 1` = missing 0007 RPC. **No real reminder has ever been sent; no real brief has ever been generated** (no key + no migration) |
| Accessibility & performance | all pages | skip link, focus rings, aria labels, `globals.css` reduced-motion | Partial | Lighthouse (mobile, local dev, 2026-11-12): `/` 57/96/100/92, `/dashboard` 54/96/96/66. Width sweep 320–1920: 0 px overflow except board scroll. **Performance 57/54 is not a strength; re-measure on staging/production** |

## Part 4 — Production, final QA & docs (in progress, 2026-11-13)

| Feature | Route | Main files | Status | How it was verified |
|---|---|---|---|---|
| Step 0 — bell fix + dashboard slowness | top bar, `/dashboard` | `lib/realtime/client.ts` (`ensureRealtimeAuth`), `lib/realtime/hooks.ts`, `lib/actions/workspace.ts` (memoised `getDashboardContext`) | **Partial — diagnosed, fix unverified** | Root cause found (anonymous join before session loads — see `docs/ARCHITECTURE.md` §5). Fix code in the working tree, unit-tested (`tests/unit/realtime-auth.test.ts`), **NOT verified live on staging, NOT committed**. Slowness: no proven fix yet; production in us-east-1 is the plan, not a result |
| Profile pictures | `/dashboard/settings` | `components/settings/avatar-upload-form.tsx`, `lib/actions/avatar.ts`, `lib/avatar.ts`, `components/ui/avatar.tsx`, 0008 | **Partial — code complete, cannot run** | Unit 13/13 avatar tests; full suite 251/251; typecheck + lint clean; dev server healthy. **E2E `tests/e2e/09-avatar.spec.ts` (3 tests) parses but was NOT run green — migration 0008 is not applied, so the bucket does not exist** |
| Security headers | all routes | `next.config.ts` | Complete (locally) | Isolated build + `next start`: `/` 200 with all 4 headers, `/login` 200, `/dashboard` anon → 307, cron no-secret → 401. **Locally verified only — headers reach users after the first production deploy** |
| Production prep docs | — | `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md` | Complete | Written from live CLI output (project ids, region, env-var state); reviewed in this pass — see the notes in each doc |
| Demo data scripts | — (local only) | `scripts/seed-demo.ts`, `scripts/reset-demo.ts`, `scripts/demo-plan.ts`, `scripts/demo-env.ts`, `docs/DEMO_DATA.md` | **Partial — never run against a real DB** | Unit 14/14 (date math, plan shape, all five states, 75% / 67%); typecheck + lint clean; smoke-tested with no credentials (clean missing-variable error) and a fake env file. **Seed never run against a real database — no service-role key exists here** |
| CI (GitHub Actions with real RLS tests) | — | (another track) | **Not done** | No workflow file exists in this repo yet. The RLS test script (`tests/rls/rls-tests.sql`, T01–T32) has never been run anywhere |
| E2E Journeys A–H | — | (another track) | **Not done** | No journey specs exist yet. The Part 3 Playwright suite (8 spec files, 22/25) is the closest coverage |
| Production deployment | — | Vercel project `taskorbit1/taskorbit-production` | **Not done** | Project created 2026-11-12, **never deployed**, only `CRON_SECRET` set, no Git integration, no custom domain. Production Supabase **does not exist** |
| English docs (§5) | — | This file + `README.md`, `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `docs/ERD.md`, `docs/DATABASE.md`, `docs/ROLE_PERMISSIONS.md`, `docs/ANIMATION_GUIDE.md`, `docs/AI_SETUP.md` (+ reviewed `docs/DEPLOYMENT.md`, `docs/OPERATIONS.md`) | Complete (this pass) | Written from the actual code and migrations; every NOT DONE / NOT TESTED claim above is repeated in the relevant doc |
| Bangla guides | — | (another track) | **Not done by this track** | Not written here; do not claim they exist |

## Cross-cutting test summary (real runs only)

| Suite | Result | When / where |
|---|---|---|
| Unit (`npm run test`) | **251/251** (22 files) | 2026-11-13, local |
| Security (`npm run test:security`) | **22 passed \| 4 skipped** (26) | Part 3, local + live probes |
| E2E Playwright, local dev | **22 passed / 3 failed** (25) | Part 3 Track D; the 3 failures were staging-blocked + 2 real app bugs, both fixed and re-tested PASS |
| E2E on staging (Step 0.2) | Bell **FAIL (proven bug)**; comment live **PASS 9.77 s**; mark-read **PASS**; `/dashboard/tasks` 4/4; responsive 4/4; mobile 375/390 PASS | 2026-11-12 ~21:09, https://taskorbit-gamma.vercel.app |
| RLS tests (`tests/rls/rls-tests.sql`, T01–T32) | **NOT RUN** | Needs Docker/psql — neither exists here |
| `supabase gen types` | **NOT RUN** | Needs Docker/local stack |
| Lighthouse (mobile, local dev) | `/` 57/96/100/92; `/dashboard` 54/96/96/66 | 2026-11-12, Lighthouse 12.8.0 |
| Build (`npm run build`, isolated copy) | PASS, 29 routes | Part 3 + Part 4 Track D (headers) |
