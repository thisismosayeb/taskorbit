"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { t, useLocale} from "@/lib/i18n";

const NAV_LINKS = [
  { href: "/#features", labelKey: "landing.navFeatures" },
  { href: "/#how", labelKey: "landing.navHow" },
  { href: "/#showcase", labelKey: "landing.navShowcase" },
  { href: "/#developers", labelKey: "landing.navDevelopers" },
  { href: "/about", labelKey: "landing.navAbout" },
] as const;

/**
 * Public header: sticky, translucent; logo, section links, Login /
 * Get Started, theme + language switchers (ThemeSwitcher /
 * LanguageSwitcher), keyboard-accessible mobile menu (Escape closes,
 * focus returns to the toggle).
 */
export function PublicHeader({ loggedIn }: { loggedIn: boolean }) {
  useLocale();
  const [open, setOpen] = React.useState(false);
  const toggleRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open ]);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/80 backdrop-blur-md">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-white"
      >
        {t("landing.skipToContent")}
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink/80 hover:bg-background hover:text-ink">
              {t(l.labelKey)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeSwitcher compact />
          <LanguageSwitcher compact />
          {loggedIn ? (
            <Link href="/dashboard" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              {t("common.goToDashboard")}
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-background sm:inline-block">
                {t("auth.login")}
              </Link>
              <Link href="/signup" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                {t("landing.getStartedFree")}
              </Link>
            </>
          )}
          <button
            ref={toggleRef}
            type="button"
            aria-label={open ? t("landing.closeMenu") : t("landing.openMenu")}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-ink hover:bg-background lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-menu" className="border-t border-ink/10 bg-surface px-4 py-3 lg:hidden" aria-label="Mobile">
          <ul className="space-y-1">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-base font-medium text-ink hover:bg-background"
                >
                  {t(l.labelKey)}
                </a>
              </li>
            ))}
            {!loggedIn ? (
              <li>
                <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-base font-medium text-primary hover:bg-background">
                  {t("auth.login")}
                </Link>
              </li>
            ) : null}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
