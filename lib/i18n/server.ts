// Server-only i18n helpers. Imported ONLY by server components, server
// actions and the root layout — never by client code (next/headers cannot
// be imported into the client bundle). The client store lives in
// lib/i18n/dictionary.ts; the React hook lives in lib/i18n/index.ts.

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createTranslator, parseLocale, type SupportedLocale } from "./dictionary";

export { createTranslator, parseLocale, type SupportedLocale } from "./dictionary";

/**
 * The locale for this request, from the `taskorbit-locale` cookie.
 * The cookie is written by LocaleProvider on every switch and by the
 * login action from the profile, so the profile is only consulted by
 * the root layout when no cookie exists yet (see getInitialLocale).
 */
export async function getServerLocale(): Promise<SupportedLocale> {
  const store = await cookies();
  return parseLocale(store.get("taskorbit-locale")?.value ?? null);
}

/** Bound translator for this request: `const t = await getServerTranslator();` */
export async function getServerTranslator() {
  return createTranslator(await getServerLocale());
}

export type ThemePreference = "light" | "dark" | "system";
export const THEME_COOKIE = "taskorbit-theme";

function parseTheme(value: string | null | undefined): ThemePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

/**
 * What the root layout needs on first paint: the locale (cookie, else
 * the logged-in user's `preferred_locale`, else 'en') and the theme to
 * use as next-themes' default (theme cookie, else the profile's
 * `theme_preference`, else 'system' — a locally stored theme choice
 * always wins over this default). The profile is read only when a
 * cookie is missing, so a normal navigation costs no extra query.
 */
export async function getInitialPreferences(): Promise<{
  locale: SupportedLocale;
  theme: ThemePreference;
}> {
  const store = await cookies();
  const localeCookie = store.get("taskorbit-locale")?.value ?? null;
  const themeCookie = store.get(THEME_COOKIE)?.value ?? null;
  if (localeCookie && themeCookie) {
    return { locale: parseLocale(localeCookie), theme: parseTheme(themeCookie) };
  }

  let locale: SupportedLocale = parseLocale(localeCookie);
  let theme: ThemePreference = parseTheme(themeCookie);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { locale, theme };

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_locale, theme_preference")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { locale, theme };
  if (!localeCookie) locale = parseLocale(profile.preferred_locale);
  if (!themeCookie) theme = parseTheme(profile.theme_preference);
  return { locale, theme };
}
