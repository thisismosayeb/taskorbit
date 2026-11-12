// Locale provider (Part 3, §7) — owns switching.
//
// Mounted once in the root layout, inside ThemeProvider, with the
// locale the server read from the cookie (or the profile) as
// `initialLocale`. It:
//   - syncs the client i18n store to `initialLocale` on mount;
//   - exposes `changeLocale()` to the LanguageSwitcher: update the store
//     (subscribed components re-render instantly, forms keep their
//     values), write the cookie + <html lang>, persist to
//     `profiles.preferred_locale` (fire-and-forget), then
//     `router.refresh()` so server components re-render from the new
//     cookie. The refresh is an RSC re-render, not a page reload —
//     mounted client components and their state survive it.
//   - re-renders its context consumers on change (the switchers' own
//     labels) via the context value.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  getClientLocale,
  setClientLocale,
  useLocale,
  type SupportedLocale,
} from "@/lib/i18n";
import { savePreferences } from "@/lib/actions/preferences";

interface LocaleContextValue {
  locale: SupportedLocale;
  changeLocale: (locale: SupportedLocale) => void;
}

const LocaleContext = React.createContext<LocaleContextValue>({
  locale: "en",
  changeLocale: (locale) => {
    setClientLocale(locale);
  },
});

export function useLocaleContext(): LocaleContextValue {
  return React.useContext(LocaleContext);
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: SupportedLocale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const locale = useLocale();

  // Sync the client store with what the server rendered. Runs once on
  // mount (and if the server ever passes a different initial locale).
  // This is also what writes the cookie when the locale came from the
  // profile rather than a cookie (e.g. first login on a new device).
  React.useEffect(() => {
    if (getClientLocale() !== initialLocale) {
      setClientLocale(initialLocale);
    }
    // Intentionally only on mount / initialLocale change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLocale]);

  const value = React.useMemo<LocaleContextValue>(
    () => ({
      locale,
      changeLocale: (next) => {
        if (next === getClientLocale()) return;
        setClientLocale(next);
        // Best-effort persistence; the switch already happened locally.
        void savePreferences({ locale: next }).catch(() => undefined);
        router.refresh();
      },
    }),
    [locale, router],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
