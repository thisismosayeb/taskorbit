# TaskOrbit — Setup (Part 1)

## 1. Prerequisites

- Node.js 20+ and npm.
- A Supabase project (free tier is fine) **or** a local Supabase stack
  (needs Docker). For Part 1 delivery no database was available in the build
  environment, so the migrations were **not** applied anywhere yet — the
  steps below are what the owner must run first.

## 2. Create the Supabase project

1. https://supabase.com/dashboard → New project. Note the project URL and
   the **publishable key** (Project Settings → API).
2. In the Supabase Dashboard → SQL Editor, run the migrations **in order**:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_rpc.sql`
   
   Or with the Supabase CLI (needs Docker for local, or link a project):
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   The migrations create all 9 tables, enums, triggers, RLS policies and the
   two RPCs. `pgcrypto` is enabled by the migration itself.
3. Verify in the Dashboard → Table Editor that the tables exist and in
   Authentication → Policies that RLS is enabled on all of them.

## 3. Auth settings

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL:** `http://localhost:3000` for local dev
  (your Vercel URL in production, e.g. `https://taskorbit.vercel.app`).
- **Redirect URLs — add each of these:**
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/reset-password`
  - (production: the same two paths on your deployed domain)

Email confirmation — two supported modes:

- **ON (default):** after signup the user gets a confirmation email and must
  click it. The app shows a "Check your email" panel and the link returns via
  `/auth/callback` → `/onboarding`.
- **OFF (for a classroom demo):** Authentication → Providers → Email →
  turn off "Confirm email". Signup then creates a session immediately and the
  user goes straight to `/onboarding`. Nothing in the code needs to change;
  the signup action handles both (it checks whether a session was returned).

## 4. Environment variables

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
and `NEXT_PUBLIC_APP_URL` (matching the Site URL above). No service-role key
is used in Part 1 — do not add one.

## 5. Run locally

```bash
npm install
npm run dev     # http://localhost:3000
```

First run: sign up as the manager → Create a workspace → create a project.
Invite a developer from Dashboard → Team (copy the invite link; **no email
is sent by the app** — send the link to the developer yourself).

## 6. Run the tests

```bash
npm run test        # Vitest unit tests (deadline, progress, validators, permissions)
npm run lint
npm run typecheck
npm run build
```

## 7. Run the RLS / trigger tests (disposable local Supabase only — never production)

Requires Docker + the Supabase CLI. From the repo root:

```bash
supabase start
supabase db push        # apply 0001 + 0002 to the local database
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f tests/rls/rls-tests.sql
```

(Use the connection string `supabase status` prints for your machine; the one
above is the default local Supabase postgres URL.) The script creates six
throwaway `@testorbit.local` users, two workspaces and test data, impersonates
each user under RLS, asserts all cases from the spec section 8 (T01–T32), and
cleans up after itself. It stops at the first failed assertion. Record the
result in `docs/BUILD_LOG.md`. To run the same checks against a hosted
project instead, point the `psql` connection string at it — but only ever on
a throwaway project, never on data you care about.

## 8. Regenerate the TypeScript types

`types/database.ts` is hand-derived from the migrations (see its header —
`supabase gen types` could not run here because there is no Docker/database).
After the database exists, regenerate it for real:

```bash
supabase gen types typescript --local > types/database.ts
# or against a hosted project:
supabase gen types typescript --project-id <your-project-ref> > types/database.ts
```

Then run `npm run typecheck` — `types/index.ts` and the Supabase clients
derive everything from that file, so any drift fails the build.

## 9. Deploy to Vercel

1. Push this repo to GitHub/GitLab.
2. Vercel → Add New Project → import the repo.
3. Environment variables: the same three `NEXT_PUBLIC_*` values (with
   `NEXT_PUBLIC_APP_URL` set to the Vercel domain).
4. Update the Supabase Site URL + redirect URLs to the Vercel domain
   (step 3 above).
5. Deploy. No build settings need changing (`npm run build`).
