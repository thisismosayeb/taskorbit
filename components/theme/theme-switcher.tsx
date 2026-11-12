// Theme switcher (Part 3, §6): Light / Dark / System.
//
// A small dropdown (Sun / Moon / Monitor icons + translated labels).
// `useTheme().setTheme` applies instantly (no reload) and next-themes
// persists the choice in localStorage; `savePreferences` persists it to
// `profiles.theme_preference` as well (fire-and-forget — a failed save
// never blocks the switch). Keep the `data-theme-switcher` attribute:
// the header/auth layouts mount this component where the placeholder
// buttons used to be, and browser tests target that attribute.

"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n";
import { savePreferences } from "@/lib/actions/preferences";

type ThemeChoice = "light" | "dark" | "system";

const CHOICES: { value: ThemeChoice; icon: React.ReactNode; labelKey: string }[] = [
  { value: "light", icon: <Sun className="h-4 w-4" />, labelKey: "theme.light" },
  { value: "dark", icon: <Moon className="h-4 w-4" />, labelKey: "theme.dark" },
  { value: "system", icon: <Monitor className="h-4 w-4" />, labelKey: "theme.system" },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  // Subscribe so the labels re-render when the language changes.
  useLocale();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const current: ThemeChoice = theme === "light" || theme === "dark" || theme === "system" ? theme : "system";
  const currentChoice = CHOICES.find((c) => c.value === current) ?? CHOICES[2];

  function choose(value: ThemeChoice) {
    setTheme(value);
    setOpen(false);
    // Best-effort: the theme already applied locally; a failed save
    // must not undo it or show an error.
    void savePreferences({ theme: value }).catch(() => undefined);
  }

  // Before mount, next-themes has not resolved the theme yet — render the
  // same button without a resolved icon so hydration matches the server.
  const icon = mounted ? currentChoice.icon : <Sun className="h-4 w-4" />;

  return (
    <div className="relative">
      <button
        type="button"
        data-theme-switcher
        aria-label={t("theme.switcher")}
        title={t("theme.switcher")}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted hover:bg-background hover:text-ink"
      >
        {icon}
        {!compact ? <span className="hidden sm:inline">{t(currentChoice.labelKey)}</span> : null}
      </button>
      {open ? (
        <>
          <button
            aria-label={t("theme.switchTheme")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            role="menu"
            aria-label={t("theme.switchTheme")}
            className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-ink/10 bg-surface p-1.5 shadow-lg"
          >
            {CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                role="menuitemradio"
                aria-checked={current === choice.value}
                onClick={() => choose(choice.value)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink hover:bg-background"
              >
                {choice.icon}
                <span className="flex-1">{t(choice.labelKey)}</span>
                {current === choice.value ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            ))}
            <p className="px-2.5 pb-1 pt-1 text-xs text-muted">{t("theme.followSystem")}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
