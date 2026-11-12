// Language switcher (Part 3, §7): English / বাংলা.
//
// A small dropdown. Switching is instant: `changeLocale()` updates the
// client i18n store (subscribed components re-render in place — a
// half-filled form keeps its values), writes the cookie, persists to
// the profile, and refreshes server components. Keep the
// `data-language-switcher` attribute: headers mount this where the
// placeholder buttons used to be, and browser tests target it.

"use client";

import * as React from "react";
import { Check, Languages } from "lucide-react";
import { t, useLocale, type SupportedLocale } from "@/lib/i18n";
import { useLocaleContext } from "@/components/i18n/locale-provider";

const CHOICES: { value: SupportedLocale; labelKey: "locale.english" | "locale.bangla"; short: string }[] = [
  { value: "en", labelKey: "locale.english", short: "EN" },
  { value: "bn", labelKey: "locale.bangla", short: "বাংলা" },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  // Subscribe so the labels re-render when the language changes.
  const locale = useLocale();
  const { changeLocale } = useLocaleContext();
  const [open, setOpen] = React.useState(false);

  const current = CHOICES.find((c) => c.value === locale) ?? CHOICES[0];

  return (
    <div className="relative">
      <button
        type="button"
        data-language-switcher
        aria-label={t("locale.switcher")}
        title={t("locale.switcher")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted hover:bg-background hover:text-ink"
      >
        <Languages className="h-4 w-4" />
        {!compact ? <span>{current.short}</span> : null}
      </button>
      {open ? (
        <>
          <button
            aria-label={t("locale.switchLanguage")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label={t("locale.switchLanguage")}
            className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-ink/10 bg-surface p-1.5 shadow-lg"
          >
            {CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                role="menuitemradio"
                aria-checked={locale === choice.value}
                onClick={() => {
                  setOpen(false);
                  changeLocale(choice.value);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-background"
              >
                <span className="flex-1">
                  {t(choice.labelKey)}
                  <span className="ml-2 text-xs text-muted">{choice.short}</span>
                </span>
                {locale === choice.value ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
