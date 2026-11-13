# TaskOrbit — Operations (Part 4, Track D)

Day-to-day running of the **production** deployment: keeping the free
Supabase project alive before the viva, reading logs, rotating keys,
backups, and what to do when something breaks. Staging
(`taskorbit1/taskorbit`, https://taskorbit-gamma.vercel.app, test Supabase
project `mjhkxhewcajrewicyztm`) is the place to try risky things first;
production is not.

## 1. The daily/weekly routine

### Before the viva (critical): keep the Supabase project active

Supabase **pauses free-tier projects after 7 days without activity**.
A paused project makes the app fail (logins and all data calls error)
until it is restored — and restoring takes minutes you do not want to
spend in front of examiners.

- **At least once a week, and the day before the viva:** open the
  production Supabase dashboard → check the project shows **Active**
  (not "Paused"). Then open the production URL, log in, and click around
  the dashboard — that activity itself counts.
- **If it is paused:** Supabase dashboard → the project banner →
  **Restore / Resume project**. Wait for the restore to finish (a few
  minutes), then open the production URL and log in to confirm it works.
  Do this **the day before** the viva at the latest, never the morning of
  it.
- **If the project was deleted for inactivity:** Supabase deletes paused
  free projects after a longer idle period (90 days). Before the viva
  this is not a risk if the weekly check above is done; after the viva,
  export the data (§4) so nothing is lost either way.

### Weekly (5 minutes)

1. Open the production URL; log in as a manager; dashboard loads, tasks
   visible. (Catches a paused database, an expired Vercel deployment, or
   a broken env var in one move.)
2. Vercel dashboard → taskorbit-production → Deployments: the latest
   deployment is **Ready** (not Failed/Error).
3. Vercel dashboard → Cron Jobs: the `daily` job ran last night
   (§3 below).
4. Supabase dashboard → Table Editor → `daily_job_runs`: a row from
   last night exists with no failures.

## 2. Reading logs

### Vercel (app + cron)

- **Deployments → a deployment → Runtime Logs:** every server log line
  from the running app. Filter by function (`/api/cron/daily`,
  `/dashboard/...`). The cron route logs `[cron/daily] ...` lines;
  failures there mean the reminders/AI brief did not run.
- **Cron Jobs → a job → run history:** each scheduled run, its status
  and duration. A missed run (no entry at 02:00 UTC) usually means the
  deployment that carried `vercel.json` was superseded or the job was
  disabled — redeploy and check the job is listed and enabled.
- **Analytics / Speed Insights (if enabled):** only page-load timings;
  not needed for correctness.

### Supabase

- **Dashboard → Logs → Postgres / Auth / API:** database errors, failed
  logins, RLS denials. A sudden run of `42501` (insufficient privilege)
  on a table usually means a migration was missed or a policy was edited.
- **Table Editor → `daily_job_runs`:** one row per cron run (after
  migration 0007 is applied). **Auth → Users:** who signed up, and
  whether confirmation emails were delivered (see §5).
- **API → Logs:** REST calls from the browser client; useful to tell an
  app bug (request never sent) from a database bug (request sent, RLS
  denied).

### In the browser (for a user-reported problem)

Open DevTools → Console + Network on the failing page. Note the exact
URL, the failing request's status code, and any console error text —
that is what a fix needs. Do not paste full cookies or tokens anywhere
when sharing a screenshot.

## 3. Cron — what "working" looks like

- Schedule: `0 2 * * *` → `GET /api/cron/daily` (02:00 UTC, 08:00 Dhaka).
- Auth: the route returns **401** without the exact
  `Authorization: Bearer <CRON_SECRET>` header, where `CRON_SECRET` is
  the production secret stored on 2026-11-12 (§2 of DEPLOYMENT.md). A
  401 on a manual test is **correct behaviour**, not a bug.
- Success: 200 with a JSON body reporting reminders sent and the daily
  brief. While migration 0007 is unapplied it returns 200 with
  `failed:1` — that is the honest "database part not installed yet"
  state, not a cron failure.
- If the manual `curl` with the secret (see DEPLOYMENT.md §8) fails:
  1. Check `vercel env ls` in a production-linked copy — `CRON_SECRET`
     must be listed for Production.
  2. Check the deployment carrying `vercel.json` is the current
     production deployment (Cron Jobs tab lists the job).
  3. Check Vercel Runtime Logs for `[cron/daily]` errors and Supabase
     `daily_job_runs` for the run record.

## 4. Backups and export

Supabase free tier does **not** include point-in-time recovery, so the
backup is yours to do:

- **Before the viva (and after any big data entry):** Supabase dashboard
  → Database → Backups (daily automatic backups exist on paid plans
  only; on free, use the SQL editor or `pg_dump` against the connection
  string) — or simply export each table: Table Editor → a table → the
  three-dot menu → Export as CSV. Keep the CSVs in the owner's files,
  not in the repo.
- **Code:** the repo is the backup of the app. Push every change to
  `thisismosayeb/taskorbit` on GitHub; a production redeploy from the
  repo is always possible (§5 of DEPLOYMENT.md).
- **Secrets:** `CRON_SECRET` (production) lives only in Vercel (Secret
  type). It cannot be read back. If it is ever lost or leaked, rotate it
  (§5) — do not go looking for a copy in chat, docs or `.env` files,
  because there is deliberately none.

## 5. Rotating keys and secrets

### CRON_SECRET (production)

If it leaks, or once a year as hygiene:

```bash
# From a directory linked to taskorbit-production:
vercel env rm CRON_SECRET production --scope taskorbit1   # confirm "y"
openssl rand -hex 32 | vercel env add CRON_SECRET production --scope taskorbit1
# The piped value is never printed. Then redeploy so the new value is live:
vercel deploy --prod --scope taskorbit1
# Staging's CRON_SECRET is a different value — rotating production does
# not affect staging, and vice versa.
```

### Supabase keys

- **Publishable key:** it is public by design (it ships in the browser
  bundle). Rotating it is not a security fix; RLS is the protection. If
  it must change, generate the new key in Supabase → Project Settings →
  API, update the Vercel env var, redeploy, **and** update `.env.local`
  for local dev.
- **Database password:** Supabase → Project Settings → Database →
  Reset database password. The app does not use it, so no redeploy is
  needed — but any saved connection strings (e.g. for `pg_dump`) must be
  updated.
- **Gemini API key:** if one is ever added and leaks, revoke it in Google
  AI Studio, create a new one, update the Vercel env var, redeploy.

### Vercel access

If the owner's Vercel login is ever compromised: change the Vercel
password, revoke sessions in Vercel → Settings → Security, and re-check
that the `taskorbit-production` project's env vars and deployments are
unchanged.

## 6. What to do if something breaks

Work through these in order; stop at the first one that fixes it.

| Symptom | Most likely cause | Fix |
|---|---|---|
| Production URL shows Vercel "Deployment not found" / 404 | No production deployment yet, or the latest deploy failed | Vercel → Deployments; redeploy from a production-linked copy (`vercel deploy --prod`). |
| Every page errors / login fails with a Supabase error | Supabase project **paused** (free tier, 7 days idle) | Restore it in the Supabase dashboard (§1), then re-test login. |
| Login redirects loop or lands on staging | `NEXT_PUBLIC_APP_URL` or Supabase Site URL points at the wrong domain | Make both the production domain (§3.6 of DEPLOYMENT.md), redeploy. |
| Signup works but no confirmation email arrives | SMTP not configured, or email confirmation ON with the default sender rate-limited | Check Supabase → Auth → Logs; set up Resend SMTP (DEPLOYMENT.md §3.7) or turn confirmation OFF for the demo (§3.8). |
| Cron runs but `failed:1` every night | Migration 0007 not applied | Apply 0007 (and confirm 0008) via the SQL editor, then re-run the cron manually. **Status 2026-11-13: 0007 is still not applied anywhere, so `failed:1` is the current expected state, not a new failure.** |
| Cron returns 401 on a manual test | Wrong secret, or testing the wrong environment's secret | Use the **production** secret; staging's is different. If lost, rotate (§5). |
| Profile pictures fail to upload | Migration 0008 not applied (no `avatars` bucket) | Apply 0008 via the SQL editor. Uploads are limited to 2 MB, png/jpg/jpeg/webp/gif — a bigger or other-type file is rejected by design. **Status 2026-11-13: 0008 is still not applied anywhere; the upload flow has never run green end-to-end.** |
| Dashboard is slow (multi-second clicks) | Database region far from Vercel functions, or cold functions on Hobby | Production was built for this: Supabase in `us-east-1` next to Vercel `iad1`. If slowness persists on production, it is a query/index problem, not geography — note the exact slow page and escalate to the build team. |
| A page shows the old design after a deploy | Browser cache or the deploy didn't go through | Hard-refresh (Ctrl+Shift+R). Then check Vercel → Deployments: the latest deployment time should be after your change. |
| Bell does not update live | Known Part 3 bug — root cause diagnosed in Part 4 (channels join anonymously before the session loads, so the server silently drops the rows; see `docs/ARCHITECTURE.md` §5). A fix (`ensureRealtimeAuth`) is in the working tree but **unverified and not committed** | The bell still updates on refresh / the 30 s polling fallback. Do not "fix" it by changing env vars; report it to the build team with the time and accounts involved, and ask whether the Step 0.2 re-test has run on staging. |

**Never do on production:** apply a migration you have not run on
staging/test first; edit RLS policies by hand in the dashboard; paste a
secret into a chat, doc or screenshot; `vercel env pull` on a shared
machine and leave the file lying around.

## 7. Handover checklist (for the viva)

- [ ] Production URL opens, login works, dashboard is fast (rehearsed).
- [ ] Supabase project confirmed **Active** the day before.
- [ ] Cron ran last night (`daily_job_runs` row, no failures).
- [ ] Demo accounts exist (manager + developer) and their credentials
      are written down for the presenters — test accounts only, on the
      **production** project (staging accounts do not exist there).
- [ ] Demo data created on production (a workspace, a project, a few
      tasks) — do not demo on the empty app.
- [ ] This file + `docs/DEPLOYMENT.md` printed or saved offline, so a
      live failure during the viva has a written recovery path.
