# TaskOrbit — Animation Guide

How animation works in TaskOrbit, where each technique lives, and the
rules that keep motion fast and respectful of the user's settings.
There are two motion systems in the app — **GSAP** (landing page
only) and **CSS** (everything else) — and a hard rule: no animation
may ever hide content or block interaction.

## 1. The two systems

| System | Where | What it does |
|---|---|---|
| GSAP 3.15.1 + ScrollTrigger | `components/landing/landing-page.tsx` only | Hero entrance, scroll-reveal of landing sections, showcase panel switch |
| CSS animations + transitions | `app/globals.css` + Tailwind | Liquid Progress waves, Wave Loader dots, mascot shake/bounce, gradient text, hover/focus transitions, skeleton shimmer |

GSAP is imported in exactly one file. If you are adding motion to a
dashboard page, use CSS — do not import GSAP there.

## 2. GSAP (landing page)

File: `components/landing/landing-page.tsx`. `gsap.registerPlugin(ScrollTrigger)`
runs at module scope; all animations are created inside one
`gsap.context()` in a `useEffect`, scoped to the landing root ref,
and reverted on unmount (`ctx.revert()`).

```tsx
// Hero: fade + rise, staggered, once on mount.
gsap.fromTo("[data-hero]",
  { opacity: 0, y: 24 },
  { opacity: 1, y: 0, duration: 0.7, stagger: 0.12,
    ease: "power2.out", clearProps: "transform" });

// Scroll reveal: each [data-reveal] section fades + rises when it
// reaches 88% of the viewport. clearProps removes the inline styles
// afterwards so the element is left clean.
gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
  gsap.fromTo(el,
    { opacity: 0, y: 28 },
    { opacity: 1, y: 0, duration: 0.6, ease: "power2.out",
      clearProps: "transform,opacity",
      scrollTrigger: { trigger: el, start: "top 88%" } });
});

// Showcase switch: short fade/slide when the demo tab changes.
gsap.fromTo("[data-showcase-panel]",
  { opacity: 0, y: 12 },
  { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", clearProps: "all" });
```

Rules that are already in the code — keep them:

- **Reduced motion is checked in JS before any GSAP runs:**
  `if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  return;` in both effects. The CSS fallback in §4 covers the rest.
- **Content is visible without JS.** The reveal initial state is the
  class `.reveal-hidden { opacity: 0 }`, and that class is **only
  added by the component** (GSAP sets the starting state via
  `fromTo`). A page with JS disabled or GSAP failed shows everything.
- **Only transform + opacity are animated.** Never width, height,
  left/top, or anything that triggers layout. Durations are short
  (0.4–0.7 s) with `power2.out`.
- **`clearProps` after the animation** so no inline `transform` /
  `opacity` is left behind to fight later layout or theme changes.
- **Scope everything to the component root** (`gsap.context(...,
  root)`) and revert on unmount — never animate a global selector
  from a component that can unmount.

## 3. Liquid Progress — internals

File: `components/motion/liquid-progress.tsx`. Pure SVG + CSS; no
GSAP, no canvas, no JavaScript animation loop.

### How it works

- Two variants, one component: `variant="bar"` (300×36 rounded-rect)
  and `variant="orb"` (120×120 circle). Both take `percent`,
  `accent` (`"manager"` | `"developer"` | `"primary"`) and an
  optional `label`.
- The fill level is computed from the clamped percent:
  `fillTop = height - (clamped / 100) * height` (bar: 36 units; orb:
  120 units). Two wave paths sit at the fill line — a fast wave
  (`opacity 0.95`, class `liquid-wave`) and a slower, lower wave
  (`opacity 0.55`, class `liquid-wave-slow`, offset +5/6 units) —
  plus a flat rect below them so 100% is a solid full shape instead
  of a wavy top edge. Everything is clipped to the shape
  (`<clipPath>` with a unique id per instance via `React.useId()`),
  so nothing ever spills outside.
- The waves are **CSS-animated** (`transform: translateX` only):
  `.liquid-wave { animation: wave-slide 3.2s linear infinite; }`,
  `.liquid-wave-slow { animation: wave-slide 5s linear infinite; }`.
  The keyframe moves one full wave period (120 user units) so the
  loop is seamless (`to { transform: translateX(-120px); }`).
  Because the SVG is wider than the clip (the wave path extends from
  -120/-300 to beyond the right edge), the slide never shows a gap.
- `clampProgress(value)` (exported, unit-tested in
  `tests/unit/liquid-progress.test.ts`) clamps to [0, 100]; `NaN`
  becomes 0; the displayed number is `Math.round(clamped)`. At 0%
  no wave is rendered at all (empty shape); at 100% the shape is
  completely full.
- Accent gradients: manager `#6658F5 → #16C8E8`, developer
  `#2DD4BF → #FF7D70`, primary `#6658F5 → #A36BFA`.
- Accessibility: `role="progressbar"`, `aria-valuenow` /
  `aria-valuemin={0}` / `aria-valuemax={100}`, `aria-label` from
  `t("progress.aria", { percent })`; the exact number is shown as
  text next to the orb (bar variant keeps it in a visually-hidden
  span, since the bar's label is rendered by the caller).

### Where it is used

Project progress on the project page and dashboard, task (subtask)
progress on the task page, and the `/dashboard/tasks` KPI area.
Progress values come from `lib/progress.ts` — project progress counts
**top-level tasks only**; task progress counts subtasks. Verified
live: "Part2 Test Project" 0 of 1 → 0%, "Website Redesign" 3 of 68 →
4%, task "Design homepage" 3 of 3 → 100%.

## 4. Wave Loader

File: `components/motion/wave-loader.tsx`. Three rising dots in the
brand gradient (`animate-float-soft`, staggered `0.18 s` each),
`role="status"` with an `aria-label` (default
`t("motion.loadingRoute")`). Used for AI generation, saves, and route
loading; `RouteLoader` is the full-page version (centred, `min-h-[40vh]`).
With reduced motion it becomes a simple static indicator (see §5).

## 5. Skeletons

File: `components/motion/skeletons.tsx` — `CardSkeleton`,
`ChartSkeleton`, `ListSkeleton({ rows = 3 })`. Static placeholder
shapes shown while server data loads; they carry no motion beyond a
subtle shimmer and are replaced by real content, never left on screen.

## 6. Mascot

File: `components/auth/orbit-mascot.tsx`. Two CSS animations in
`app/globals.css`: `.mascot-error` (shake, 0.5 s, ±5 px + ±2° rotate)
on a failed login, `.mascot-success` (bounce, 0.7 s, −14 px + 1.04
scale) on success. The mascot also has idle / look / shy states
driven by form focus — all CSS classes, no GSAP. Verified live in
Playwright 02-auth-mascot.

## 7. Reduced motion — the rule that covers everything

`app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .gradient-text { animation: none; }
  .liquid-wave, .liquid-wave-slow {
    animation: none;
    transform: translateX(-25%);   /* static fill, wave crest visible */
  }
  .reveal-hidden { opacity: 1; }   /* nothing stays hidden */
}
```

Plus the JS check in the landing page (§2) that skips GSAP entirely.
Verified live in Playwright: with reduced motion on, computed
animation duration is 0.01 ms — effectively instant — and the liquid
waves become static fills. **New motion must respect this block:**
never add an animation that is not killed by the `*` rule above, and
never hide content behind an animation that reduced-motion users
would never see complete.

## 8. Performance rules

1. **Transform + opacity only.** No layout-affecting properties in
   any animation. The landing page, the waves, the loader dots and
   the mascot all follow this.
2. **Short durations.** 0.4–0.7 s for entrances; 3.2 s / 5 s for the
   infinite wave loops (the loops are cheap — a single `translateX`
   on two paths per visible progress bar).
3. **No JavaScript animation loops.** There is no `requestAnimationFrame`
   loop anywhere in the app; GSAP drives the landing, CSS drives the
   rest.
4. **Clean up after yourself.** `clearProps` on GSAP tweens,
   `ctx.revert()` on unmount, channels removed on unmount (Realtime).
5. **Do not animate the dashboard.** The dashboard, board, calendar
   and task pages use plain CSS transitions only (hover, focus,
   status changes). The board's drag feedback comes from dnd-kit,
   not from custom animation.
6. **Watch the numbers.** Lighthouse (mobile, local dev server,
   2026-11-12): `/` Performance **57**, `/dashboard` Performance
   **54**. Animation is not the main cost (the dev server is), but
   do not add motion that makes it worse — re-measure on staging
   after any motion change. There is no performance budget file; the
   last measured scores are in `docs/BUILD_LOG.md` §4.
