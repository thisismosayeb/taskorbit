# TaskOrbit — Production Deployment (Part 4, Track D)

How the **production** deployment is built, what already exists, and the
exact steps the owner must still do. Nothing in this file is a guess: every
project id, URL and env-var name below was read from the repo or from a
live CLI call on 2026-11-12. No secrets, keys or URLs are invented here.

## 1. What exists today

| Environment | Vercel project | URL | Supabase project |
|---|---|---|---|
| **Staging** | `taskorbit1/taskorbit` — `prj_JzySXvE2ecKRlfJvdFw8CRNqSOL4` | https://taskorbit-gamma.vercel.app | TEST project `mjhkxhewcajrewicyztm` (all test data lives here) |
| **Production** | `taskorbit1/taskorbit-production` — `prj_UKmf4fLSNxjIpVbufoz5g5z1BvqP` | *none yet — never deployed* | **DOES NOT EXIST YET** (owner must create it, §3) |

Production project facts (verified 2026-11-12 via the Vercel CLI):

- Created 2026-11-12 19:24:56, team `taskorbit1`
  (`team_aApgKoUDBQackp36ey0eccX1`), owner "Taskorbit", Hobby plan.
- Framework preset Next.js; build `npm run build`; root directory `.`.
- Functions region `iad1` (us-east-1) — this is why the production
  Supabase project should also be `us-east-1` (§3): same region keeps
  database round-trips short and is part of the answer to the 4–5 s
  dashboard clicks reported on staging (the test Supabase project is not
  in us-east-1).
- Created with the Vercel CLI (`vercel link --scope taskorbit1 --yes`
  from an isolated copy), **not** from Git. There is no Git integration
  yet: pushing to `thisismosayeb/taskorbit` does **not** auto-deploy
  production. Either connect the repo in the Vercel dashboard (Project →
  Settings → Git) or deploy from the CLI (§5). Do not assume a push
  deploys anything.
- The repo's own `.vercel/project.json` still points at **staging**
  (`prj_JzySXvE2ecKRlfJvdFw8CRNqSOL4`). It was never overwritten. Any
  `vercel` command run from the repo directory acts on staging; any
  command meant for production must run from a copy linked to
  `taskorbit-production` (see §5) or pass the project explicitly.

## 2. Environment variables

### Already set on production

| Name | Environments | Type | Set |
|---|---|---|---|
| `CRON_SECRET` | Production | Secret | 2026-11-12, generated fresh with `openssl rand -hex 32` and piped straight into `vercel env add` — the value was **never printed, written to a file, or committed**. It is stored as a Vercel Secret: hidden in the dashboard and unavailable to `vercel env pull`. |

### Still to set on production (after the Supabase project exists)

Set these with the CLI from a directory linked to `taskorbit-production`
(§5), or in the Vercel dashboard → Project → Settings → Environment
Variables. Scope each one to **Production** (Preview can stay empty until
a preview workflow is wanted). Never commit values; never paste a secret
into chat, a doc, or a screenshot.

| Name | Value source | Required? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | New production Supabase project → Project Settings → API → Project URL (`https://<project-ref>.supabase.co`) | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same page → publishable key | Yes |
| `NEXT_PUBLIC_APP_URL` | The production Vercel URL (e.g. `https://taskorbit-production.vercel.app`, or the custom domain once one is added — §6). Must match the Supabase Site URL in §3 exactly, no trailing slash. | Yes |
| `GEMINI_API_KEY` | Owner's Google AI Studio key | **No — optional.** Leave unset and the app runs the no-key path: `/dashboard/ai` shows "not configured". No key has been provided as of 2026-11-12. |
| `GEMINI_MODEL` | Default is `gemini-2.5-flash` in code; set only to override it. | No |

Notes:

- **No service-role key is used anywhere in the app.** Do not add
  `SUPABASE_SERVICE_ROLE_KEY` to Vercel. All database access goes through
  the logged-in user's session (RLS) plus the SECURITY DEFINER RPCs.
- `VERCEL_OIDC_TOKEN` is managed by the CLI itself (it appears in a local
  `.env.local` after `vercel link`). Never copy it into Vercel env vars.
- Staging has 8 env vars set (per `docs/BUILD_LOG.md`); the table above
  covers every variable defined in `.env.example` plus `CRON_SECRET`.
  Before the first production deploy, compare names only with staging
  (`vercel env ls` in a staging-linked copy vs a production-linked copy)
  and confirm production has the same names with production values.
- `CRON_SECRET` must be **different** from staging's. It already is: the
  production one was generated fresh on 2026-11-12 and is not the staging
  value from `.env.local`.

### Setting a variable (production, from a linked copy)

```bash
# From a directory linked to taskorbit-production (see §5):
vercel env add NEXT_PUBLIC_SUPABASE_URL production --scope taskorbit1
# The CLI prompts for the value; paste it there, never in a file or chat.
# To verify names only (values stay hidden):
vercel env ls --scope taskorbit1
```

## 3. Create the production Supabase project (OWNER — not done)

The production Supabase project does **not** exist yet. Only the owner
can create it (it lives in the owner's Supabase account). Steps:

1. https://supabase.com/dashboard → **New project**.
2. **Region: `us-east-1` (N. Virginia).** Reason: the production Vercel
   functions run in `iad1`, which is the same region; keeping the
   database next to the functions is part of fixing the 4–5 s dashboard
   clicks seen on staging.
3. Pick a strong database password and store it in the owner's password
   manager. The app never needs it; it is only for direct database
   access / the SQL editor if ever needed.
4. Note the **project ref** (the subdomain in
   `https://<project-ref>.supabase.co`) and the publishable key
   (Project Settings → API). Those two values become the Vercel env vars
   in §2.
5. **Apply ALL migrations in order** — Dashboard → SQL Editor, run each
   file's full contents, one at a time, in this exact order:
   `supabase/migrations/0001_init.sql`, `0002_rpc.sql`,
   `0003_invites_fix.sql`, `0004_notifications.sql`,
   `0005_realtime_analytics.sql`, `0006_delete_activity_fix.sql`,
   `0007_ai.sql`, `0008_avatar.sql`.
   - 0001–0006 are the Part 1–2 schema, RPCs, notifications, realtime and
     the delete-activity fix. 0007 adds the AI tables/RPCs (without it the
     cron returns 200 with `failed:1` and AI cache/usage never persist).
     0008 creates the public `avatars` Storage bucket and its RLS
     (profile pictures, Part 4) — the bucket is created by the migration
     itself, no dashboard bucket step is needed.
   - Do **not** skip or reorder. Do **not** apply them to the test project
     by mistake — check the project name/ref in the dashboard header
     before running each file.
   - Verify afterwards in Table Editor that the tables exist (`workspaces`,
     `projects`, `tasks`, `comments`, `notifications`, `activity_logs`,
     `ai_summaries`, `ai_usage`, `daily_job_runs`, `profiles`, …) and in
     Authentication → Policies that RLS is enabled on all of them.
6. **Auth URL configuration** — Dashboard → Authentication → URL
   Configuration, for the **production** project (the test project's
   settings must keep pointing at staging):
   - **Site URL:** the production URL, e.g.
     `https://taskorbit-production.vercel.app` (or the custom domain once
     added — then this must change to match it, and `NEXT_PUBLIC_APP_URL`
     must change with it).
   - **Redirect URLs — add both:**
     - `https://<production-domain>/auth/callback`
     - `https://<production-domain>/reset-password`
   - Keep the localhost entries too if local dev against production is
     ever wanted; they are harmless. Do **not** remove staging's entries
     from the *test* project.
7. **SMTP (email sending) — owner decision, not made yet.** Options:
   - **Resend (recommended):** create a Resend account, verify a sending
     domain (or use Resend's onboarding sender for testing only), copy the
     API key, then Supabase Dashboard → Authentication → Providers →
     Email → SMTP Settings → enable custom SMTP, host
     `smtp.resend.com`, port `465`, user `resend`, password = the Resend
     API key, sender email/name as verified. Then test with a signup.
   - **Another provider:** same Supabase SMTP screen with that
     provider's host/port/credentials.
   - **None (Supabase default):** signups still work but use Supabase's
     shared sender with strict rate limits — fine for a classroom demo,
     not for real users. If email confirmation is OFF (§3.8) this matters
     less, because no confirmation email is needed at all.
   - Whichever is chosen, the **app itself never sends email** — invites
     are copy-the-link only, by design. SMTP only affects Supabase auth
     emails (signup confirmation, password reset).
8. **Email confirmation ON or OFF — owner decision, not made yet.**
   Dashboard → Authentication → Providers → Email → "Confirm email":
   - **ON (default):** after signup the user gets a confirmation email
     and must click it; the app shows "Check your email" and the link
     returns via `/auth/callback` → `/onboarding`. Requires working SMTP
     (§3.7) or the Supabase default sender.
   - **OFF (classroom demo):** signup creates a session immediately and
     the user goes straight to `/onboarding`. Nothing in the code needs
     to change; the signup action handles both.
   - Pick one and record it; the viva demo should use whichever was
     rehearsed.

## 4. Security headers (DONE, Part 4 Track D)

Added to `next.config.ts` (`headers()` for every route `/(.*)`):

| Header | Value | Why |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Stops MIME-sniffing script/style confusion. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full URL only leaks to same-origin; cross-origin gets origin only. |
| `X-Frame-Options` | `SAMEORIGIN` | The app may only be framed by itself (clickjacking defence). |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self), picture-in-picture=()` | The app uses none of these browser features; everything is denied except fullscreen on its own pages. |

Deliberately **not** added: a Content-Security-Policy. Next.js inlines
scripts/styles, so a strict CSP would need `unsafe-inline` exceptions
that have to be audited per route; shipping a half-audited CSP is worse
than shipping none. Frame control is covered by `X-Frame-Options`
(SAMEORIGIN) instead of a duplicate `frame-ancestors` directive.

**Verification (real run, 2026-11-12):** the repo was copied to an
isolated directory (never `next build` in the repo while the dev server
runs on :3000), built there (`next build`, exit 0, 29 routes), served
with `next start` on port 3100, and curled:

- `GET /` → 200, all four headers present, landing headline
  "Turn Big Ideas Into" rendered.
- `GET /login` → 200 (headers present).
- `GET /dashboard` anonymous → 307 to `/login`.
- `GET /api/cron/daily` without a secret → 401.
- The isolated copy was deleted afterwards (including the `.env.local`
  the CLI link step had created there). Verification is **local only** —
  it proves the headers ship in the build; they reach users only after
  the first production deploy (§5).

## 5. First production deploy

Prerequisites: §3 done (Supabase project + migrations + auth URLs),
§2 env vars set, and the Part 4 code committed and pushed to GitHub
(the production project has no Git integration yet, so a CLI deploy
needs the code locally).

**Status 2026-11-13: this prerequisite is NOT met yet.** The Part 4
working tree (Track A bell fix, Track B avatars, Track D headers/docs,
Track E demo data, and these docs) is **not committed and not pushed**;
local commits `a38188c`, `4e03a82`, `3e4d62f` are not on GitHub, which
is still at `4978f5f0`. Do not deploy production from a dirty or
uncommitted tree — commit and push first, then deploy from the pushed
state.

**Option A — CLI deploy (works today, no Git setup needed):**

```bash
# 1. Isolated copy, so the repo's staging link is never touched:
rsync -a --exclude node_modules --exclude .next --exclude .vercel \
  --exclude .git --exclude test-results \
  ~/workspace/taskorbit/ /tmp/taskorbit-production/
ln -s ~/workspace/taskorbit/node_modules /tmp/taskorbit-production/node_modules
cd /tmp/taskorbit-production

# 2. Link once (already done 2026-11-12; repeat only if the copy is fresh):
vercel link --scope taskorbit1 --yes
# (If the project were somehow unlinked: the same command recreates the
# link; it does NOT create a second project when one is already linked
# by name — verify with: cat .vercel/project.json)

# 3. Deploy to production:
vercel deploy --prod --scope taskorbit1
```

**Option B — Git integration (recommended for later):** Vercel dashboard
→ taskorbit-production → Settings → Git → connect repository
`thisismosayeb/taskorbit`, production branch `main`. After that, every
push to `main` deploys production automatically. Until this is done,
assume a push deploys **nothing**.

**After the first deploy, verify production (§7) before announcing it.**

## 6. Domain (not set up)

No custom domain has been provided or configured. The production URL
will be the Vercel-assigned one (`https://taskorbit-production.vercel.app`
unless Vercel assigns a different suffix — read the actual URL from the
deploy output / dashboard and use exactly that).

If a custom domain is bought later: Vercel dashboard → Project →
Settings → Domains → add it, follow the DNS instructions, then update
**both** `NEXT_PUBLIC_APP_URL` (Vercel env var, Production) **and** the
Supabase Site URL + redirect URLs (§3.6) to the custom domain, and
redeploy. Until both are updated together, login redirects will break.

## 7. How to verify production

Run these against the **production** URL (not staging) after the first
deploy, and again after any re-deploy:

```bash
BASE=https://<production-domain>
curl -s -I $BASE/ | grep -iE "x-content-type-options|referrer-policy|x-frame-options|permissions-policy"
# Expect all four headers (values as in §4).
curl -s -o /dev/null -w "landing %{http_code}\n" $BASE/
curl -s -o /dev/null -w "login %{http_code}\n" $BASE/login
curl -s -o /dev/null -w "dashboard-anon %{http_code} -> %{redirect_url}\n" $BASE/dashboard
# Expect: landing 200, login 200, dashboard-anon 307 to /login.
curl -s -o /dev/null -w "cron-no-secret %{http_code}\n" $BASE/api/cron/daily
# Expect: 401.
```

Then in a browser: sign up as a manager (or log in), create a workspace,
create a project and a task, invite a developer with the copy-link flow,
and confirm the dashboard loads without the 4–5 s delays seen on
staging. Re-run the Part 3 §11 checks that matter on a fresh deploy:
theme survives re-login, Bangla choice survives login, `/dashboard/tasks`
and KPI links, mobile 375 px. The bell-live bug: the root cause was
diagnosed in Part 4 (channels join anonymously before the session
loads — see `docs/ARCHITECTURE.md` §5) and a fix is in the working
tree, but it is **unverified on staging and not committed** — do not
treat the first production deploy as the bell fix, and re-run the
bell-live check (Step 0.2) on staging first.

## 8. Cron verification

`vercel.json` already schedules `0 2 * * *` → `/api/cron/daily`
(02:00 UTC = 08:00 Dhaka, daily). Vercel Cron is enabled per project;
after the first **production** deploy:

1. Vercel dashboard → taskorbit-production → Cron Jobs: confirm the
   `daily` job is listed and enabled (it is created from `vercel.json`
   at deploy time).
2. Test the route manually (does **not** wait for 02:00):
   ```bash
   # With the production secret (from the Vercel dashboard or the
   # owner's secret store — never print it):
   curl -s -H "Authorization: Bearer <production-CRON_SECRET>" \
     https://<production-domain>/api/cron/daily
   # Expect 200 with a JSON body. While migration 0007 is unapplied it
   # returns 200 with failed:1; after §3.5 it should report reminders
   # processed and no failures.
   curl -s -o /dev/null -w "cron-no-secret %{http_code}\n" \
     https://<production-domain>/api/cron/daily
   # Expect: 401.
   ```
3. Next morning, check Vercel → Cron Jobs → run history, and Supabase →
   Table Editor → `daily_job_runs` for a row from that night.

## 9. Owner checklist — everything still pending (2026-11-13)

- [ ] Commit + push the Part 4 working tree (local commits `a38188c`,
      `4e03a82`, `3e4d62f` are not on GitHub; repo still at `4978f5f0`).
- [ ] Create the production Supabase project, region **us-east-1** (§3.1–3.4).
- [ ] Apply migrations **0001–0008 in order** via the SQL editor (§3.5).
- [ ] Set Site URL + `/auth/callback` + `/reset-password` redirect URLs
      on the **production** Supabase project (§3.6).
- [ ] Choose SMTP: Resend / another provider / none (§3.7).
- [ ] Choose email confirmation ON or OFF (§3.8).
- [ ] Provide a Gemini API key, or confirm AI stays unconfigured (§2).
- [ ] Provide `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_APP_URL` values
      so they can be set as production env vars (§2).
- [ ] Decide: first deploy via CLI (§5 Option A) or connect GitHub for
      auto-deploy (§5 Option B).
- [ ] Provide a custom domain, or confirm the Vercel-assigned URL is the
      production URL (§6).
- [ ] After deploy: run the §7 verification and the §8 cron check.
