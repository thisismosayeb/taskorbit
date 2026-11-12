// Pure i18n core — NO React imports, NO next/headers. This module is
// safe to import from anywhere: server components, server actions and
// the pure lib helpers (deadline, relative time, activity, analytics,
// validators) that produce translated strings.
//
// WHY THIS FILE EXISTS (Part 3): `lib/i18n/index.ts` is the CLIENT
// module — it imports `useSyncExternalStore` for `useLocale()`, and a
// server component that (transitively) imports a React hook fails the
// production build ("This React Hook only works in a Client
// Component"). The pure helpers and the server translator live here
// instead; `index.ts` re-exports everything below plus the hook, and is
// imported only by client components.
//
// THE STORE: `currentLocale` is a plain module variable. Client code
// mutates it via `setClientLocale()` (called by LocaleProvider); server
// code NEVER calls the setter — on the server the store is always "en"
// and server strings use an explicit locale via `createTranslator()`.
// (A module global would leak across concurrent requests if the server
// ever wrote it — that is why the server path never does.)
//
// ARCHITECTURE (full version in lib/i18n/index.ts header):
// 1. One cookie (`taskorbit-locale`) is the source of truth for
//    rendering; the durable store is profiles.preferred_locale.
// 2. Client: `t()` with no explicit locale reads this store;
//    `useLocale()` (index.ts) subscribes to it via
//    `useSyncExternalStore`, so switching re-renders instantly with
//    no navigation, refetch or remount — forms keep their values.
// 3. Server: an explicit translator per request
//    (`createTranslator(await getServerLocale())`).
// 4. Dates/numbers: lib/i18n/format.ts (en-GB / bn-BD).
//
// A missing key returns the key itself (visible in the UI, and the i18n
// unit test fails on any key used in code but absent from a dictionary),
// so a typo can never silently render nothing.

import { en, type Dictionary } from "./en";
import { bn } from "./bn";

export { en, type Dictionary } from "./en";
export { bn } from "./bn";

export type SupportedLocale = "en" | "bn";
export const SUPPORTED_LOCALES: SupportedLocale[] = ["en", "bn"];
export const DEFAULT_LOCALE: SupportedLocale = "en";
export const LOCALE_COOKIE = "taskorbit-locale";

const DICTIONARIES: Record<SupportedLocale, Dictionary> = { en, bn };

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return value === "en" || value === "bn";
}

export function parseLocale(value: string | null | undefined): SupportedLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export type I18nParams = Record<string, string | number | null | undefined>;

function lookup(dict: unknown, key: string): unknown {
  let current: unknown = dict;
  for (const part of key.split(".")) {
    if (current !== null && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function interpolate(value: string, params?: I18nParams): string {
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (!(name in params)) return `{${name}}`; // param not passed: leave visible
    const replacement = params[name];
    return replacement === null || replacement === undefined ? "" : String(replacement);
  });
}

/** Pure translation: look `key` up in `locale`'s dictionary (English fallback), interpolating `{params}`. */
export function translate(key: string, params?: I18nParams, locale: SupportedLocale = DEFAULT_LOCALE): string {
  const value = lookup(DICTIONARIES[locale], key);
  if (typeof value === "string") return interpolate(value, params);
  if (locale !== DEFAULT_LOCALE) {
    const fallback = lookup(DICTIONARIES[DEFAULT_LOCALE], key);
    if (typeof fallback === "string") return interpolate(fallback, params);
  }
  return key;
}

/** A `t()` bound to one locale — what server components use. */
export function createTranslator(locale: SupportedLocale) {
  return (key: string, params?: I18nParams): string => translate(key, params, locale);
}

// ---------------------------------------------------------------------------
// Client-side locale store (module-level). See the header note above:
// client code writes it, server code only ever reads the "en" default.
// ---------------------------------------------------------------------------

let currentLocale: SupportedLocale = DEFAULT_LOCALE;
const localeListeners = new Set<() => void>();

function emitLocaleChange() {
  for (const listener of localeListeners) listener();
}

export function getClientLocale(): SupportedLocale {
  return currentLocale;
}

/** Subscribe to locale changes; used by `useLocale()` in index.ts. */
export function subscribeLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

/**
 * Change the client locale now: updates the store (subscribed components
 * re-render instantly), writes the `taskorbit-locale` cookie (1 year,
 * readable by server components) and `<html lang>`. Persistence to the
 * profile and the `router.refresh()` for server strings are owned by
 * `LocaleProvider.changeLocale()` — this is the low-level setter it calls.
 * Client-only: never call this from server code.
 */
export function setClientLocale(locale: SupportedLocale): void {
  if (!isSupportedLocale(locale)) return;
  if (currentLocale === locale) {
    // Still make sure the cookie/lang agree (e.g. first mount).
    writeLocaleCookie(locale);
    return;
  }
  currentLocale = locale;
  writeLocaleCookie(locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  emitLocaleChange();
}

function writeLocaleCookie(locale: SupportedLocale): void {
  if (typeof document === "undefined") return;
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * The `t()` every existing call site already uses.
 *
 *   t("tasks.statusTodo")                       // "To do" / "করতে হবে"
 *   t("tasks.completeBlocked", { done: 2, total: 3 })
 *   t("common.taskCount", { count: n, countS: n === 1 ? "" : "s" })
 *
 * With no explicit `locale` it reads the client store (Bangla after a
 * switch, English otherwise). Server components pass a locale via
 * `createTranslator()` instead — never rely on the store on the server.
 * Pure helpers in lib/ (deadline, analytics, …) take an optional trailing
 * `locale` and forward it here.
 */
export function t(key: string, params?: I18nParams, locale?: SupportedLocale): string {
  return translate(key, params, locale ?? getClientLocale());
}
