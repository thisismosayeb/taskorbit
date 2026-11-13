# TaskOrbit — Test Report (Part 4, §5)

**Scope:** Part 4 of 4 — Production, Final QA & Documentation. This report covers
everything tested for Part 4: the final gate (real runs, 2026-11-13), Step 0
re-tests on staging, E2E Journeys A–H, accessibility, Lighthouse, screenshots,
the demo video, CI, and RLS. Anything marked PASS was actually run; anything
not run is marked **NOT RUN** or **NOT RE-VERIFIED** — never inferred.

**Environment:** Staging `https://taskorbit-gamma.vercel.app` (Vercel Hobby,
team `taskorbit1`, project `taskorbit1/taskorbit`), Supabase **test** project
`taskorbit-test` (`mjhkxhewcajrewicyztm`, ap-southeast-1). **Production does
not exist yet** — Journey H runs against staging and says so in its title.
Repo `~/workspace/taskorbit`, branch `main`. Final gate run 2026-11-13 ~11:03
UTC against the working tree later committed as the Part 4 commit.

---

## 1. Final gate — PASS (real runs, 2026-11-13)

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` | **Clean** — no ESLint warnings or errors |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | **Clean** |
| Unit tests | `npm test` | **258/258 pass** (23 test files) |
| Security tests | `npm run test:security` | **22 passed \| 4 skipped** (26 total) |
| Production build | `npm run build` in an isolated copy (`/tmp/taskorbit-build`, `node_modules` symlinked; never in the repo while dev runs) | **PASS** — 26 pages + 1 API route (+ robots/sitemap = 29 routes), First Load JS shared 103 kB |

One build note: the first isolated-copy attempt failed with
`Cannot find module '@/types/database'` — my copy had missed the `types/`
folder, not an app defect. After copying it, the build passed.

---

## 2. CI (GitHub Actions) — EXISTS, NEVER RUN

- Workflow: `.github/workflows/ci.yml` (9.4 KB). Badge is in `README.md`.
- It runs: lint, typecheck, unit tests, security tests, production build,
  local Supabase (`supabase start` + `supabase db reset` applying all
  migrations), RLS tests (`tests/rls/rls-tests.sql`, T01–T32) via psql, and
  a Playwright smoke run.
- **Status: NOT RUN.** The workflow was written in Part 4 and has never had a
  push to run against — it first runs on the push of this commit. The badge
  will show its real state only after that run. Do not treat "CI exists" as
  "CI passes".

---

## 3. RLS tests (T01–T32) — NOT RUN

- `tests/rls/rls-tests.sql` contains all 32 tests (T01–T32, verified by
  counting the markers in the file). It was **never run** before Part 4:
  it needs a local Postgres (Docker/`supabase start`), which this VM cannot
  run, and no PAT was available to run it against the test project.
- It is wired into CI (see §2), so the first real run happens on the CI
  push. **Per-test results: none yet — report them after the first CI run,
  not before.**

---

## 4. Step 0 — Bell fix re-test on staging: PASS (5/5)

The Part 3 bell bug (channel SUBSCRIBED but never receiving RLS-protected
rows, because it joined anonymously before the session loaded) was fixed in
Part 4 (`ensureRealtimeAuth` pins the user's JWT on the Realtime socket
before subscribing). Re-tested live on staging by a dedicated agent
(`bell-retest3.log`, `spec05-retest3.log`, `spec05-direct.log`,
`spec05-mark.log` in `~/workspace/e2e-tunnel/`), on the new deployment
(`taskorbit-7yifmn3n7`, Ready).

| # | Item | Result |
|---|---|---|
| 1 | Bell renders | **PASS** — manager `aria-label="Notifications, 44 unread"`, `data-realtime-mode=live`; developer 2 unread, mode `connecting` → `live`; 0 console/page errors; SSR HTML contains the real bell (not the `BellSkeleton` fallback) for both roles; no React error #419 anywhere |
| 2 | Channel live + bell-live | **PASS** — manual runs (manager comments on "Design homepage" → developer bell): **2→3 in 5.3 s; 0→1 in 6.0 s; 0→1 in 4.0 s**, all mode `live → live`. Official spec logic passes: `before=0 after=1 delayMs=5994 modeBefore=live modeAfter=live` (48.1 s) |
| 3 | Mark-read takes effect | **PASS** — "Mark all as read": bell **1→0 in ~6.0 s**, persists after full reload (unread tab empty). Click-one navigates to the task; bell 1→0 on return. Official spec "mark one / mark all as read" **PASSES verbatim** with fresh auth states (21.1 s) |
| 4 | Auth hardening | **PASS** — login form `method="post"`, `action=null`; JS-disabled native submit keeps the URL on `/login` with **no `?email=`/`?password=` in the URL**; normal login still works |
| 5 | Regression spot-checks | **PASS with nuance** — login lands on `/dashboard` for both roles, no `/onboarding` redirect. Nav timings (3 samples): Dashboard **2.5 / 4.2 / 4.2 s** (avg ~3.6 s); All tasks **2.6 / 2.7 / 3.5 s** (~2.9 s); Board **3.6 / 2.7 / 2.6 s** (~3.0 s); Projects **3.1 / 2.3 / 2.2 s** (~2.5 s). No clear regression — but the claimed 20–50% improvement is **not** confirmed from this sample; roughly in line with before |

Two apparent failures during the re-test were proven to be **probe/harness
defects, not app defects**, and are fixed in the harness (see §6):
the verbatim `05-realtime.spec.ts` bell-live failed because the task had
slid off page 1 of `/dashboard/tasks` (20/page, due-date sort) — the
manager never posted the probe comment (Supabase confirms zero probe
comments from that run); and comment-live + mark failed at `authedPage`
because tests 2–3 reused rotated storage states. Both passed on retry with
fresh states / the direct-URL variant.

---

## 5. Step 0 — Dashboard slowness re-measurement

The user reported (2026-11-12): after login, every dashboard click takes
4–5 s. Re-measured on staging (see §4 item 5): Dashboard ~3.6 s, All tasks
~2.9 s, Board ~3.0 s, Projects ~2.5 s per navigation. **The user's
experience is roughly confirmed** — clicks are still ~3–4 s, not instant.
No clear regression vs the Part 3 measurements, and no measured 20–50%
improvement either.

Root causes (unchanged from the Part 3 diagnosis): (1) Vercel Hobby cold
starts on dynamic server-rendered pages; (2) the database is in Singapore
(ap-southeast-1) while the Vercel functions run in US East (iad1) — every
click round-trips across the world. The production fix is a same-region
Supabase project (us-east-1 recommended, next to iad1); that is an owner
decision and is **not** part of this report's scope.

---

## 6. E2E Journeys A–H (staging) — MIXED: 3 pass, 1 pass, 4 failed

Specs: `tests/e2e/journeys/journey-{a..h}.spec.ts`. Logs:
`~/workspace/e2e-tunnel/journey-*-run*.log`. **Read this table carefully:
a journey is PASS only where a real run passed it.**

| Journey | Result | Evidence |
|---|---|---|
| A — Manager: homepage to analytics | **PASS in the video recording run** (1.1 min segment); **FAILED in the later spec-suite run2** | Video run passed. Run2 failed on `expect(locator('#task-title')).toBeVisible()` (15 s timeout) — the "New task" click did not open the form. Harness defect (see below), not a proven app defect |
| B — Developer: invite to completed parent | **PASS in the video recording run** (2.4 min); **FAILED in the later spec-suite run2** | Video run passed. Run2 died at 3.0 m with `browserContext.close: Test ended` amid a flood of SSL handshake failures (`net_error -202`) — the relay TLS path died mid-test. Environment failure, not an app failure |
| C — Deadlines | **PASS** | Spec run1: 1 passed (2.2 m). Also passed in the video recording run (2.9 min) |
| D — Collaboration: comment + status reach the other side | **FAILED in spec-suite run2** | Test died at 3.0 m (`locator.click: Test ended`) amid the same SSL handshake failures as B. The run's console also shows Minified React error #419 twice — but that run was on the build **before** the bell-regression fix; the re-test agent (§4) explicitly verified **no React #419** on the new deployment. Cause of the D failure itself is the dead network path, not proven to be an app defect |
| E — (spec run4) | **FAILED in spec-suite run4** | Same `#task-title` 15 s timeout as A — createTask flakiness. Harness defect |
| F — Preferences: theme + language survive refresh; mobile nav 375 px | **FAILED in spec-suite run2 and in the latest `tests/e2e/results.json` run** | `TimeoutError: waiting for getByRole('menuitemradio', { name: /^Dark$/i })` — the theme menu was in Bangla (হালকা/গাঢ়/সিস্টেম) and the helper only looked for English. Harness defect (locale) |
| G — AI: not-configured state, no generation attempted | **PASS** | Spec run1: 1 passed (20.8 s). No Gemini key was provided; AI stays not-configured — this test verifies the no-key path, and it passes |
| H — Production smoke on STAGING (production does not exist yet) | **FAILED in spec-suite run2** | After `selectOption(status)`, no toast appeared within 30 s (`getByRole('status').first()` timeout). The app **does** toast on status change per the code (`components/tasks/status-select.tsx`: "Orbit cleared!" on completion, moved-to toast on board). Whether the status change itself persisted was **not verified** by this run. Cause undetermined — needs a re-run, not a guess |

### Harness fixes applied (code only — NOT re-verified by a browser run)

Three harness bugs were found and fixed in test code only (agent
`b857aa04`, typecheck + lint pass):
1. `openTaskByTitle` is now pagination-aware (walks `?page=N` up to a cap,
   with a `{ taskId }` fast path) — fixes the bell-live / A failure mode.
   `05-realtime.spec.ts` now uses the shared helper instead of its own
   page-1-only version.
2. `setTheme` is locale-aware (reads `document.documentElement.lang` and
   matches হালকা/গাঢ়/সিস্টেম when the UI is Bangla) — fixes the F failure.
3. `createTask` retries the "New task" click up to 3 times until
   `#task-title` appears — fixes the A/E failure mode.
4. New shared `tests/e2e/auth-state.ts` mints a fresh single-use storage
   state per context, so tests 2–3 no longer get rejected on rotated
   tokens — fixes the `05-realtime.spec.ts` 3/3 failure mode.

**Honest status: these fixes are verified in the code only. No browser run
was done by design after them. They need one staging run of Journeys B/F
(and D/E/H + `05-realtime.spec.ts`) to confirm. Until that run happens,
Journeys A, B, D, E, F, H are NOT re-verified — do not present them as
passing.**

### Required follow-up (one staging run)

Run on staging, against the current deployment, with fresh auth states:
Journeys B, D, E, F, H + `05-realtime.spec.ts` verbatim. Then update this
section with the real results.

---

## 7. Accessibility (axe) — 9 pages, 0 critical, known issues remain

Tool: `@axe-core/playwright` 4.14.0, WCAG 2.1 A/AA. Full detail:
`docs/a11y/AXE_SUMMARY.md`; raw results `docs/a11y/axe-<page>.json`;
machine summary `docs/a11y/axe-summary.json` (generated
2026-11-12T23:27:36Z, staging, second run after fix batch 1).

- **First staging run (before any fix): 20 rules, 0 critical.** Worst:
  board color-contrast ×73 + nested-interactive ×98; manager dashboard
  color-contrast ×25.
- **Second staging run (fix batch 1 live): 13 rules, 0 critical.**
  Landing 0, login 0, developer dashboard 0; manager dashboard 2 rules;
  board 3 rules; calendar / task / analytics / AI 2 rules each.
- **Local verification after fix batches 1 + 2: 0 violations on all 9
  pages except board `nested-interactive`.** Batch 2 (notification-bell
  badge contrast + label, mobile landmark) is **local only — NOT yet on
  staging**.

### Known issues (NOT fixed — recorded honestly)

1. **Board `nested-interactive`, ×134 nodes (serious).** Every board card
   is a dnd-kit sortable (`role="button"`, `tabindex="0"`) containing
   focusable descendants (the "Move to…" button / links). Fixing it means
   restructuring `components/board/board-card.tsx` (e.g. card as a plain
   container with an explicit open-action, menu button outside the sortable
   handle) — not a small/safe change, and it touches drag-and-drop keyboard
   behaviour. Left for a follow-up; the board is still fully usable by
   mouse and the "Move to…" menu works by keyboard. (Count grows as more
   cards exist: 98 → 117 → 122 → 134 across runs.)
2. **1 color-contrast + 1 label-content-name-mismatch per page** on
   dashboard (manager), board, calendar, task, analytics, AI — all in the
   notification bell (white on coral badge, 2.49:1; badge text "9+" not in
   the button's aria-label). **Fixed in code (batch 2) but NOT deployed to
   staging** — the staging numbers above still show them. Redeploy + re-run
   axe to close this.
3. Latent: `components/ui/button.tsx` `danger` variant is `bg-coral
   text-white` (2.49:1) — not flagged on any scanned page (no danger
   button was visible), worth darkening if ever used on a scanned page.
4. One local run flagged the landing hero mid-animation (3.37:1 subheading,
   2.62:1 CTA) — both measured **mid-fade**; at rest both pass (muted
   `#64748b` on `#F7F9FE`, white on `#6658F5` 4.91:1), confirmed by 4 other
   runs. Not an app bug; the axe scripts now wait for hero opacity ≥ 0.99.

**No critical issues found anywhere.**

---

## 8. Lighthouse (staging, mobile) — landing 73, dashboard 44

Latest run 2026-11-12 23:32:59Z (landing) / 23:33:51Z (dashboard),
`docs/lighthouse/*-staging.report.{json,html}` (the `*-v2` files are the
earlier run: landing 68, dashboard 52).

| Page | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Landing `/` | **73** | 100 | 100 | 100 |
| Dashboard `/dashboard` | **44** | 96 | 100 | 66 |

- Dashboard performance **44** is a known issue (same cold-start +
  Singapore round-trip causes as §5; also heavy client JS). It is recorded
  as a known issue, not hidden.
- Dashboard SEO 66: the dashboard is an authenticated page (noindex is
  expected there) — not a defect.
- Lighthouse also flags the same contrast items as axe on the old build;
  re-run after the batch-2 redeploy for the updated accessibility score.

---

## 9. Screenshots — 66 shots + manifest

- `docs/screenshots/`: **66 screenshots** + `manifest.json` (67 files
  total), base `https://taskorbit-gamma.vercel.app`, manifest generated
  2026-11-12T23:29:15Z. Includes landing, login, dashboard (manager +
  developer), board, calendar, task, analytics, AI — light + dark, 375 /
  768 / 1440 px.
- Caveat: captured against the staging build of the time; a post-fix
  retake was in progress at ~23:30 (see `docs/a11y/AXE_SUMMARY.md`). The
  batch-2 visuals (rose bell badge) postdate these shots — retake and
  confirm after the batch-2 redeploy.

---

## 10. Demo video — Journeys A–C pass (staging only)

- `docs/demo/taskorbit-demo.webm` — **514.08 s (8 min 34 s), 45,679,888
  bytes** (VP9, 1280×720, 25 fps, no audio). Details:
  `docs/demo/README.md`.
- All three journeys passed in the recording run (6.4 min total): Journey
  A 1.1 min, Journey B 2.4 min, Journey C 2.9 min. Segments: A — manager
  signup → workspace + project + task → comment → analytics; B — manager
  invites developer, developer accepts, subtasks 3/3, parent completes;
  C — deadline chips (neutral / overdue / on-time / late / none, reopen
  loses the green "on time" chip).
- **STAGING ONLY — do not present this as a production demo.** All data is
  demo/test data. Longer than the 3–5 min target because Journey B is
  shown from both sides; kept whole per the Part 4 spec. The developer
  segment opens with ~20 s of blank white (the context is created before
  the invite exists) — that is the real recording, not a broken file.
- The build in the video includes a11y fix batch 1; batch 2 was not yet
  deployed when recorded.

---

## 11. Profile pictures — code complete, DB behaviour unverified

- Track B (Part 4): `supabase/migrations/0008_avatar.sql` (Storage bucket
  + policies; note `profiles.avatar_url` already exists in `0001_init.sql`),
  `lib/actions/avatar.ts`, `lib/avatar.ts`,
  `components/settings/avatar-upload-form.tsx`, avatar display wired into
  the topbar and pages, `tests/e2e/09-avatar.spec.ts`,
  `tests/unit/avatar.test.ts` (covered by the 258/258 unit run).
- **Migration 0008 is NOT applied** (no PAT / no production project), and
  the upload flow was never run against a real database (no service-role
  key in this environment). Code is complete; the live behaviour is
  **unverified until the migration is applied and the flow is exercised on
  staging or production.**

---

## 12. Security re-check (staging) — headers live, suite passes

- **Live check (this assembly, curl):** staging returns
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(),
  usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(),
  magnetometer=(), fullscreen=(self), picture-in-picture()`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`.
- Vitest security suite: **22 passed | 4 skipped** (§1).
- Known issue: the `Permissions-Policy` header triggers a console error
  on some pages (`Error with Permissions-Policy header: Unrecognized
  feature: 'bluetooth'`) — cosmetic, seen in the Journey D run log.
- AI bundle scan (Part 3 gate, re-confirmed by the unit run): no
  `GEMINI`/key strings in client JS. No secrets are committed in this
  repo; `.env.local` is git-ignored.

---

## 13. What is NOT done / NOT tested

- **Migrations `0007_ai.sql` and `0008_avatar.sql` are NOT applied** to the
  test project (no PAT active) and there is no production project to apply
  them to. AI tables (`ai_summaries`, `ai_usage`, `daily_job_runs`) and
  the avatar Storage bucket therefore do not exist in any live database.
- **CI has never run** (§2); **RLS T01–T32 have never run** (§3).
- **Journeys A, B, D, E, F, H are not re-verified** after the harness
  fixes (§6) — one staging run is still required.
- **Dashboard Lighthouse performance 44; board nested-interactive ×134;
  bell badge contrast/mismatch still live on staging** (batch 2 not
  deployed) — all recorded as known issues above.
- **Gemini key not provided** — AI stays not-configured (Journey G
  verifies the no-key path; generation with a real key is NOT TESTED).
- **Production Supabase project, SMTP choice, email confirmation
  ON/OFF** — owner decisions, still pending; production setup waits on
  them. No custom domain provided.
- **GitHub auto-deploy (Vercel ↔ GitHub) is not connected** — deploys are
  still CLI uploads. The push in this assembly does **not** deploy staging
  by itself; a CLI deploy (or connecting auto-deploy) is a separate step.

---

## 14. Files & evidence index

| Item | Location |
|---|---|
| This report | `docs/TEST_REPORT.md` |
| CI workflow | `.github/workflows/ci.yml` |
| RLS tests | `tests/rls/rls-tests.sql` (T01–T32) |
| Axe summary + raw JSONs | `docs/a11y/AXE_SUMMARY.md`, `docs/a11y/axe-*.json`, `docs/a11y/axe-summary.json` (local re-check: `docs/a11y-local/`) |
| Lighthouse reports | `docs/lighthouse/*-staging.report.{json,html}` |
| Screenshots + manifest | `docs/screenshots/` (66 shots, `manifest.json`) |
| Demo video + notes | `docs/demo/taskorbit-demo.webm`, `docs/demo/README.md` |
| Journey logs | `~/workspace/e2e-tunnel/journey-*-run*.log` |
| Bell re-test logs | `~/workspace/e2e-tunnel/bell-retest*.log`, `spec05-*.log` |
| Journey specs | `tests/e2e/journeys/journey-{a..h}.spec.ts` |
| Harness fixes | `tests/e2e/journeys/helpers.ts`, `tests/e2e/helpers.ts`, `tests/e2e/auth-state.ts` |
| Build log (Part 4 checkpoints) | `docs/BUILD_LOG.md` |
