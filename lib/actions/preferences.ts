// Persist theme / language preferences (Part 3, §6–§7).
//
// Called fire-and-forget from the switchers: the choice already applied
// locally, so a failure here must never undo it or surface an error.
// Writes to `profiles.theme_preference` / `profiles.preferred_locale`
// (columns already exist: text NOT NULL, defaults 'system' / 'en') and
// mirrors the choice into cookies the server reads on the next render
// (`taskorbit-locale` for the locale; `taskorbit-theme` is informational
// — next-themes itself persists the theme in localStorage, and the root
// layout uses the profile value as its defaultTheme).

"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, parseLocale, type SupportedLocale } from "@/lib/i18n/dictionary";

type ThemePreference = "light" | "dark" | "system";
const THEME_COOKIE = "taskorbit-theme";

function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

export async function savePreferences(input: {
  theme?: ThemePreference;
  locale?: SupportedLocale;
}): Promise<{ ok: boolean; error?: string }> {
  const theme = input.theme !== undefined && isThemePreference(input.theme) ? input.theme : undefined;
  const locale = input.locale !== undefined ? parseLocale(input.locale) : undefined;
  if (theme === undefined && locale === undefined) return { ok: true };

  const cookieStore = await cookies();
  // Cookies first: the next server render reads them even if the
  // profile write below fails.
  if (locale !== undefined) {
    cookieStore.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  if (theme !== undefined) {
    cookieStore.set(THEME_COOKIE, theme, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: true }; // Not logged in: cookie/localStorage only.

  const patch: { theme_preference?: ThemePreference; preferred_locale?: SupportedLocale } = {};
  if (theme !== undefined) patch.theme_preference = theme;
  if (locale !== undefined) patch.preferred_locale = locale;
  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return { ok: false, error: "Could not save your preference. Try again." };
  return { ok: true };
}
