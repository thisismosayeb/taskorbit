# TaskOrbit Part 4 §4 — Accessibility (axe) — staging + fixes

Run on **staging** `https://taskorbit-gamma.vercel.app`, 2026-11-12/13, with
`@axe-core/playwright` 4.14.0 (default WCAG 2.1 A/AA rules). Per-page raw
results: `axe-<page>.json` in this folder; machine summary:
`axe-summary.json`. Local verification after the fixes: `../a11y-local/`
(same script against a local dev server — see "Fixes" below). Scripts:
`~/workspace/e2e-tunnel/axe-staging.mjs`, `axe-local.mjs`.

## Staging results — first run (BEFORE any fix, pre-redeploy build)

| Page | Violations (serious unless noted) |
|---|---|
| Landing `/` | color-contrast ×3 |
| Login `/login` | — (0) |
| Dashboard (manager) | color-contrast ×25, label-content-name-mismatch ×6 |
| Dashboard (developer) | color-contrast ×13, label-content-name-mismatch ×6, heading-order ×1 (moderate) |
| Board | color-contrast ×73, label-content-name-mismatch ×2, **nested-interactive ×98** |
| Calendar | color-contrast ×25, label-content-name-mismatch ×2 |
| Task page | color-contrast ×2, label-content-name-mismatch ×2, heading-order ×1 (moderate) |
| Analytics | color-contrast ×2, label-content-name-mismatch ×2, heading-order ×1 (moderate) |
| AI page | color-contrast ×2, label-content-name-mismatch ×2, heading-order ×1 (moderate) |
| **Total** | **20 rules, 0 critical** |

Dominant contrast pairs (145 nodes): white on coral `#FF7D70` 2.49:1 (50×,
avatar initials), white on cyan `#16C8E8` 2.0:1 (47×, avatars + landing),
primary `#6658F5` on `bg-primary/10` `#F0EEFE` 4.29:1 (22×, "Manager" badge),
deadline chips at `opacity-80` (13×), out-of-month calendar cells at
`opacity-45` (6× day numbers + dimmed chips).

## Staging redeploy (coordinator) + second run — fix batch 1 is LIVE

Staging was redeployed with fix batch 1 below (confirmed by a changed JS
chunk hash `1548-1e9238771a290b88.js` → `1548-cf483ec3039c52f4.js` and by the
fixed aria-labels `"Search Ctrl K"` / `"TMTest Manager — User menu"`
appearing in a live page snapshot). Second staging run
(`axe-staging3.log`, raw JSONs overwritten in this folder): **13 rules** —
landing 0, login 0, developer dashboard 0; manager dashboard 2 rules
(label-mismatch ×1, region ×1 moderate); board 3 rules (incl.
nested-interactive ×117); calendar / task / analytics / AI 2 rules each.
The remaining items were all in the notification bell (which only fails
once unread notifications exist — 44 unread at the time, badge "9+") and
one landmark issue; they are fix batch 2 below. Batch 1's fixes are
confirmed live on staging, including visually (darker avatars, indigo
"Manager" badge, rose bell badge in the demo-video frames).

## Fixes made (uncommitted working tree — batch 1 deployed, batch 2 local-only)

All verified locally (dev server, same axe script, real content asserted —
see `../a11y-local/`): **0 violations on all 9 pages except board
nested-interactive** (see "Remaining"). Unit tests: 258/258 pass
(`npm test`), `tsc --noEmit` clean. New regression cases in
`tests/unit/theme-contrast.test.ts`.

### Batch 1 (live on staging)

- `components/ui/avatar.tsx` — palette: cyanbrand → cyan-700 (`#0E7490`,
  5.36:1), coral → rose-600 (`#E11D48`, 4.70:1), emerald-500 → emerald-700
  (`#047857`, 5.48:1). White initials now pass AA.
- `components/ui/badge.tsx` — `primary` variant text `text-primary` →
  `text-indigo-600` (`#4F46E5` on `#F0EEFE`, 5.50:1). The token itself is
  only 4.29:1 on its own tint.
- `components/landing/landing-page.tsx` — hero pill text → indigo-600;
  "NZ" avatar colour `#16C8E8` → `#0E7490` (2 spots).
- `components/calendar/calendar-view.tsx` — removed `opacity-80` from event
  chip detail lines (100/800 chip colours pass at full strength: cyan
  6.49:1, red 5.30:1, green 4.57:1); out-of-month cells no longer use
  container `opacity-45` (day numbers now solid `text-muted`, cells get a
  faint `bg-ink/[0.03]`); "today" number/week header text → indigo-600
  (was 4.37:1 on the today tint).
- `components/dashboard/sidebar.tsx` — active link label is now `text-ink`
  (was `text-roleaccent`: developer teal 1.86:1, manager indigo 4.29:1);
  the accent still marks the item via tinted background + coloured icon.
- `components/ui/card.tsx` — `CardTitle` renders `h2` instead of `h3`
  (cards sit directly under the page `h1`; `h1 → h3` skipped a level).
- `components/dashboard/topbar.tsx` — user-menu `aria-label` now starts
  with the avatar initials + display name (`"TMTest Manager — User menu"`):
  axe concatenates visible text without spaces, so the label must contain
  the exact run-together form.
- `components/search/search-dialog.tsx` — search trigger button no longer
  has an `aria-label` (name comes from content, `"SearchCtrl K"`); the
  descriptive label could not contain the run-together visible text.
  The now-unused `search.openAria` key was removed from `en.ts`/`bn.ts`.
- `lib/i18n/en.ts`, `lib/i18n/bn.ts` — `dashboard.statAria` is now
  `"{value}{label} — view list"`: the card renders number above label, so
  the visible text is `"19Total projects"` and the name must contain it.
- `lib/theme/contrast.ts` — doc comment updated with the new pairs.

### Batch 2 (local only — NOT yet on staging)

Found by the second staging run, fixed and verified locally the same way:

- `components/notifications/notification-bell.tsx` — the unread-count
  badge was white on `bg-coral` (2.49:1) and sat *inside* the bell button,
  whose aria-label `"Notifications, 44 unread"` did not contain the
  visible badge text `"9+"` (label-content-name-mismatch, 5 pages).
  The badge is now a **sibling** of the button (same absolute position,
  visually identical), `aria-hidden` (it duplicates the count the label
  already announces), and `bg-rose-600` (white 4.70:1).
- `components/dashboard/sidebar.tsx` — the mobile top strip (logo link +
  menu button) is now a `<header>` landmark; below `lg` it sat outside
  every landmark (axe `region`, moderate, manager dashboard).

### Measurement note (not an app bug)

One local run flagged the landing hero (3.37:1 subheading, 2.62:1 CTA) —
both measured **mid-animation**: axe blends colours by element opacity
and the Framer Motion hero entrance was still fading in under CPU load.
At rest both pass (muted `#64748b` on `#F7F9FE`, white on `#6658F5`
4.91:1), confirmed by 4 other runs. Both axe scripts now wait for
`[data-hero]` elements to reach opacity ≥ 0.99 before running axe.

## Remaining (NOT fixed — needs a design/structural decision)

- **Board `nested-interactive`, 122 nodes (serious; was 98 — more cards
  now exist from the journey runs).** Every board card is a dnd-kit
  sortable (`role="button"`, `tabindex="0"`) containing focusable
  descendants (the "Move to…" button / links). Fixing it means
  restructuring `components/board/board-card.tsx` (e.g. card as a plain
  container with an explicit open-action, menu button outside the sortable
  handle) — not a small/safe change, and it touches drag-and-drop keyboard
  behaviour. Left for a follow-up; the board is still fully usable by mouse
  and the "Move to…" menu works by keyboard.
- **No critical issues found anywhere.**
- Latent (same failing pair, not flagged on the scanned pages — no danger
  button was visible): `components/ui/button.tsx` `danger` variant is
  `bg-coral text-white` (2.49:1). Worth darkening if the variant is ever
  used on a scanned page.

## Follow-ups for the coordinator

1. Redeploy staging with fix batch 2, then re-run `axe-staging.mjs`
   (in `~/workspace/e2e-tunnel/`) against staging — expected: 0 rules
   except board nested-interactive.
2. `docs/screenshots/` were captured against the pre-fix staging build;
   a post-fix retake was in progress 2026-11-13 ~23:30
   (`~/workspace/e2e-tunnel/shots-staging.mjs`, log `shots-staging2.log`).
   The fixes change visuals slightly (darker avatar backgrounds, darker
   "Manager" badge text, undimmed calendar chips, brighter "today"
   number, rose bell badge) — confirm the retake completed.
3. Lighthouse (mobile, staging) also flags the same contrast items on the
   old build — see `docs/lighthouse/`; re-run after redeploy for the
   updated accessibility score.
