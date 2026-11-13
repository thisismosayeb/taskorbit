# TaskOrbit — Demo Data (Part 4, Track E)

Seed / reset scripts for a realistic demo workspace. **Owner runs locally
only** — the scripts are never deployed and never imported by the app.

## What it creates

One workspace, **"Software Engineering Lab"** (timezone `Asia/Dhaka`,
manager is owner), with 3 demo accounts, 3 projects, 15 top-level tasks,
3 subtasks and 8 comments.

| Project | Status | Tasks | Completed | Progress |
| --- | --- | --- | --- | --- |
| Capstone: TaskOrbit MVP | active | 4 top-level | 3 | **75%** (3 of 4) |
| Lab Assignments & Reports | active | 6 top-level | 1 | 17% (1 of 6) |
| Demo & Viva Preparation | planning | 5 top-level | 0 | 0% (0 of 5) |

Progress counts top-level tasks only (subtasks excluded), per
`lib/progress.ts`. "Implement the task board" (in Capstone) has 2 of 3
subtasks done → **67%** subtask progress.

### Deadline states — all five are shown

All dates are **relative to the day you run the seed**, computed in
`Asia/Dhaka`, so the demo always looks right. "Completed" tasks are
completed at seed time (`completed_at = now()`, stamped by the
`maintain_completed_at()` trigger), so green vs amber depends only on
whether the due date is in the future or the past.

| Task | Project | Assignee | Due | State shown |
| --- | --- | --- | --- | --- |
| Design the database schema | Capstone | Dev 1 | +5 days | 🟢 Completed on time |
| Build auth & workspace onboarding | Capstone | Dev 2 | +4 days | 🟢 Completed on time |
| Implement the task board | Capstone | Dev 1 | +2 days | 🔵 Due soon (2 of 3 subtasks, 67%) |
| Write the Part 1 report | Capstone | Dev 2 | +7 days | 🟢 Completed on time |
| Submit Lab 3: ER diagram | Lab Assignments | Dev 1 | −2 days | 🔴 Overdue |
| Fix the overdue notification bug | Lab Assignments | Dev 2 | −3 days | 🟡 Completed late |
| Draft the viva presentation | Lab Assignments | Dev 1 | today | 🔵 Due today |
| Collect peer feedback on the UI | Lab Assignments | Dev 2 | — | ⚪ No deadline |
| Prepare the weekly progress report | Lab Assignments | Dev 1 | +6 days | 🔵 Due in 6 days |
| Review the Supabase RLS policies | Lab Assignments | Dev 2 | tomorrow | 🔵 Due tomorrow |
| Rehearse the live demo | Demo & Viva | Dev 1 | +10 days | 🔵 Due in 10 days |
| Record the demo video | Demo & Viva | Dev 2 | +9 days | 🔵 Due in 9 days |
| Prepare viva Q&A notes | Demo & Viva | Dev 1 | — | ⚪ No deadline |
| Fix the bell live-update bug | Demo & Viva | Dev 2 | −1 day | 🔴 Overdue |
| Write the final report (Part 4 docs) | Demo & Viva | Manager | +14 days | 🔵 Due in 14 days |

The full plan (titles, descriptions, subtasks, comments) lives in
`scripts/demo-plan.ts` — that file is the single source of truth; the seed
inserts exactly that plan.

## Setup — the env file (placeholder values only)

Create `.env.demo.local` in the repo root with **your own** values:

```env
# Demo accounts (fictional — use any emails you control; the passwords are
# yours, choose strong ones). These accounts are created in Supabase Auth.
DEMO_MANAGER_EMAIL=manager@example.com
DEMO_MANAGER_PASSWORD=choose-a-strong-password
DEMO_DEV1_EMAIL=dev1@example.com
DEMO_DEV1_PASSWORD=choose-a-strong-password
DEMO_DEV2_EMAIL=dev2@example.com
DEMO_DEV2_PASSWORD=choose-a-strong-password

# Supabase project to seed (staging or your own test project — NEVER
# production, and NEVER the project holding real users).
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

Where to find the Supabase values: Supabase dashboard → your project →
Settings → API → Project URL (`NEXT_PUBLIC_SUPABASE_URL`),
`anon public` key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`),
`service_role` key (`SUPABASE_SERVICE_ROLE_KEY`, under "Project API keys").
The service-role key bypasses RLS — it is the only key that can create
auth users and insert the workspace directly.

> ⚠️ **The service-role key never leaves your local machine.** The env file
> is git-ignored (`.env*` in `.gitignore` — verified: `git check-ignore
> .env.demo.local` matches). Never paste it into chat, a ticket, a shared
> doc or a commit; never put it in `.env.local` (that file is loaded by the
> Next.js app). The scripts never print passwords or keys. The demo
> credentials are only for the demo accounts — do not reuse a real
> person's email or password.

The scripts also accept the same variables exported in your shell, and a
`--env <path>` flag to use a different file. Missing variables are a hard
failure: the script lists every missing name and exits 1 — there are no
fallback defaults.

## How to run

Requires **Node ≥ 22.6** (the scripts are `.ts` run directly by Node's type
stripping — no build step, no `tsx`). From the repo root:

```bash
# Seed the demo workspace (creates auth users + workspace + data)
node scripts/seed-demo.ts

# Remove everything the seed created (workspace + all its data)
node scripts/reset-demo.ts

# Seed again after a reset, or with an explicit env file
node scripts/seed-demo.ts --env /path/to/.env.demo.local

# Delete the existing demo workspace and re-seed in one step
node scripts/seed-demo.ts --force
```

(A `MODULE_TYPELESS_PACKAGE_JSON` warning from Node is expected noise —
the repo is not `"type": "module"`, and the scripts run as ES modules
anyway. Harmless.)

### Idempotency

- **Seed:** refuses to run if a workspace named "Software Engineering Lab"
  already exists ("Refusing to seed twice"). Re-run with `--force` to
  delete that workspace first (only after verifying the demo manager owns
  it) and re-seed, or run `reset-demo.ts` first. If the demo auth users
  already exist (from a previous seed), they are **reused as-is** — their
  password is the one from the first seed run, so keep using it.
- **Reset:** matches the workspace by **exact name** and verifies
  `created_by` is the demo manager from the env file; refuses otherwise.
  It deletes only that workspace row — projects, tasks, subtasks,
  comments, activity, notifications and memberships go with it via
  `ON DELETE CASCADE`. It never touches other workspaces, and it does
  **not** delete the demo auth users (so the next seed reuses them).

## What to check after seeding

1. Log in as the manager (`DEMO_MANAGER_EMAIL`) — the workspace switcher
   should show "Software Engineering Lab".
2. Dashboard / Projects: "Capstone: TaskOrbit MVP" shows **75%**;
   "Implement the task board" shows **67%** (2 of 3 subtasks).
3. Task list / board: the green / red / amber / neutral / no-deadline
   chips from the table above are all visible; "Submit Lab 3: ER diagram"
   is red (Overdue), "Fix the overdue notification bug" is amber
   (Completed late).
4. Log in as a developer (`DEMO_DEV1_EMAIL`) — they see the same workspace
   but can only change the status of their own assigned tasks.

## Verification status (2026-11-13)

- `npm run typecheck`: clean (includes `scripts/` — tsconfig already
  covers `**/*.ts`; the only tsconfig change was adding
  `allowImportingTsExtensions: true` so the scripts can import each other
  with explicit `.ts` extensions, which Node's type stripping requires).
- `npx vitest run tests/unit/demo-data.test.ts`: **14 passed / 14** —
  the plan is checked against the real `getDeadlineState()` and
  `lib/progress.ts` (all five states present; 75% and 67% exact).
- Full suite `npm test`: **251 passed / 251** (22 files).
- `npm run lint`: no warnings or errors.
- **Live seed NOT run** — no service-role key is available in this
  environment and there is no local Supabase/Docker. The scripts were
  only smoke-tested without credentials (they fail with the exact missing
  variable list, exit 1) and with a fake env file (they load it and reach
  the Supabase call). **Pending step: the owner runs
  `node scripts/seed-demo.ts` locally with a real `.env.demo.local`
  against the staging/test Supabase project and confirms the checklist
  above.**
```

## Files

| File | What it is |
| --- | --- |
| `scripts/demo-plan.ts` | The plan + timezone-relative date math (single source of truth) |
| `scripts/demo-env.ts` | Env-file parsing + required-variable checks (shared) |
| `scripts/seed-demo.ts` | Creates the demo users, workspace, projects, tasks, comments |
| `scripts/reset-demo.ts` | Deletes only the demo workspace (owner-verified, cascade) |
| `tests/unit/demo-data.test.ts` | 14 unit tests: date math, plan shape, all 5 states, 75% / 67% |
| `docs/DEMO_DATA.md` | This file |
