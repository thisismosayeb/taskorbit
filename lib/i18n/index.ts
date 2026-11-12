// Client-side i18n entry point — imported ONLY by client components
// (and by tests). It re-exports the whole pure core from
// ./dictionary.ts and adds the one thing that needs React: `useLocale()`.
// It MUST keep the `"use client"` directive: `useSyncExternalStore`
// cannot be imported into a server component graph, which is exactly
// what broke the production build before the pure/client split —
// server code and pure lib helpers import from ./dictionary.ts instead.
//
// ARCHITECTURE (Part 3, theme + Bangla track) — how `t()` became
// locale-aware WITHOUT rewriting the ~70 files that already call
// `t("dotted.key")`:
//
// 1. ONE COOKIE IS THE SOURCE OF TRUTH FOR RENDERING.
//    `taskorbit-locale` (`en` | `bn`) is read by server components and
//    written by the client on every switch. The durable store is
//    `profiles.preferred_locale`; the cookie is its render-time copy,
//    synced at login and on every change (see lib/actions/preferences.ts).
//
// 2. CLIENT: a tiny module-level store (in ./dictionary.ts).
//    `t()` with no explicit locale reads `currentLocale`, a module
//    variable. `useLocale()` subscribes to it via `useSyncExternalStore`,
//    so any client component that calls `useLocale()` re-renders the
//    instant the locale changes — no navigation, no refetch, no remount,
//    and any half-filled form keeps its values (React state is untouched).
//    Client components that render `t()` strings call `useLocale()` once
//    at their top (one line each); their non-memoized children re-render
//    along with them. `t()` called inside event handlers (toasts,
//    validation at submit time) needs no subscription — it reads the
//    store at call time.
//
// 3. SERVER: an explicit translator per request.
//    Server components cannot read the client store (and a module global
//    would leak across concurrent requests), so they do NOT use the bare
//    `t()`. Each server function that renders strings starts with:
//        const locale = await getServerLocale();      // from the cookie
//        const t = createTranslator(locale);          // bound, shadows import
//    Call sites are unchanged — the local `t` shadows the import.
//    (Helpers live in lib/i18n/server.ts, NOT here, because importing
//    next/headers into this module would break the client bundle.)
//    Pure lib helpers that produce strings (deadline, relative time,
//    activity, analytics) take an optional trailing `locale` argument
//    instead; server call sites pass it, client call sites omit it and
//    get the store locale.
//
// 4. SWITCHING.
//    `LocaleProvider` (components/i18n/locale-provider.tsx) owns
//    `changeLocale()`: update the store (instant client re-render) ->
//    write the cookie + `<html lang>` -> persist to the profile via a
//    fire-and-forget server action -> `router.refresh()` so server
//    components re-render from the new cookie. The refresh preserves
//    mounted client components and their form state; it is an RSC
//    re-render, not a page reload.
//
// 5. DATES / NUMBERS.
//    `lib/i18n/format.ts` formats with Intl: `en-GB` for English,
//    `bn-BD` (Bengali digits) for Bangla, consistently everywhere.
//
// A missing key returns the key itself (visible in the UI, and the i18n
// unit test fails on any key used in code but absent from a dictionary),
// so a typo can never silently render nothing.
"use client";

import { useSyncExternalStore } from "react";
import { getClientLocale, subscribeLocale, type SupportedLocale } from "./dictionary";

export * from "./dictionary";

/**
 * Subscribe the calling component to locale changes. Call once at the top
 * of any client component that renders `t()` strings: it re-renders the
 * instant the locale changes. Returns the current locale.
 */
export function useLocale(): SupportedLocale {
  return useSyncExternalStore(subscribeLocale, getClientLocale, getClientLocale);
}
