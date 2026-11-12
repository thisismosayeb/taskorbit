# TaskOrbit — Plan. Assign. Track. Deliver.

University Software Engineering Lab project. Official developers: **Mosayeb Siam**, **Nabil Zaman**, **Mamshad**.

Part 1 (this repository state): real, database-backed foundation — Supabase Auth,
workspaces, projects, tasks, subtasks, comments, deadline logic (Green / Red /
Amber / Neutral), roles (manager / developer) enforced in the database, not only
in the UI. No Kanban, calendar, notifications UI, analytics, animations, Bangla
or dark mode yet — those are Parts 2–4.

## Stack

Next.js 15 (App Router) + TypeScript, Tailwind CSS, Supabase (Auth + PostgreSQL +
RLS), Zod, React Hook Form, Vitest. Deploy target: Vercel.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL + publishable key
npm run dev                  # http://localhost:3000
```

Then follow `docs/SETUP.md` to create the Supabase project, apply the
migrations in `supabase/migrations/`, and configure auth redirect URLs.

## Scripts

| Command           | What it does                                  |
| ----------------- | --------------------------------------------- |
| `npm run dev`     | Start the dev server                          |
| `npm run build`   | Production build (also typechecks + lints)    |
| `npm run start`   | Serve the production build                    |
| `npm run lint`    | ESLint                                        |
| `npm run typecheck` | `tsc --noEmit`                              |
| `npm run test`    | Vitest unit tests (deadline, progress, validators, permissions) |

## Layout

- `app/(public)` — home page; `app/(auth)` — login / signup / forgot / reset;
  `app/auth/callback` — Supabase auth callback; `app/invite/[token]`;
  `app/onboarding`; `app/dashboard` — dashboard, projects, tasks, my-tasks,
  team, settings.
- `components/ui` — small shadcn-style primitives (button, input, card,
  badge, dialog, toast, avatar). `components/dashboard|projects|tasks|comments|team|settings`.
- `lib/supabase` — browser + server clients (`<Database>` typed);
  `lib/auth` — auth server actions; `lib/actions` — project/task/comment/
  team/workspace server actions; `lib/date/deadline.ts` — the one deadline
  function used everywhere; `lib/progress.ts`; `lib/permissions.ts`;
  `lib/validators.ts` (Zod); `lib/i18n/en.ts` — all UI strings in English.
- `types/database.ts` — Supabase `Database` type (hand-derived from the
  migrations — see its header; regenerate with `supabase gen types` once a
  database exists). `types/index.ts` — row types derived from it.
- `supabase/migrations/` — `0001_init.sql` (schema, triggers, RLS),
  `0002_rpc.sql` (`create_workspace`, `accept_invitation`).
- `tests/unit/` — Vitest tests. `tests/rls/rls-tests.sql` — RLS/trigger
  tests for a disposable local Supabase (NOT run in Part 1 — no database
  was available; see `docs/BUILD_LOG.md` for the exact commands).
- `docs/` — `SETUP.md`, `DECISIONS.md`, `BUILD_LOG.md`.

## The exam workflow (Part 1)

1. A manager signs up, creates a workspace, creates a project.
2. The manager divides it into tasks and assigns each to a developer.
3. The manager invites a developer (Team page → email → copy invite link;
   **no email is sent** — share the link yourself).
4. The developer signs up / logs in, accepts the invite, opens an assigned
   task, creates subtasks, marks them done.
5. Deadlines show Green (completed on time), Red (overdue), Amber
   (completed late) or Neutral (on track) — always with text, never color alone.
6. Every task/subtask has a comment thread. The manager monitors everything
   from the dashboard with real progress numbers.

## Docs

- `docs/SETUP.md` — Supabase setup, migrations, auth URLs, email on/off.
- `docs/DECISIONS.md` — the fixed product rules (roles, permissions,
  deadline states, progress formulas).
- `docs/BUILD_LOG.md` — what was built, the real lint/typecheck/test/build
  output, and what is still unverified (RLS tests, live Supabase run).
