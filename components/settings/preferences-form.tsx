// Preferences section on the Settings page (Part 3, §6–§7): the same
// ThemeSwitcher + LanguageSwitcher that live in the top bar, with
// labels, so the choice is also findable in Settings. The switchers
// already persist to the profile; this section only presents them.

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { t, useLocale } from "@/lib/i18n";

export function PreferencesSection() {
  useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.preferencesTitle")}</CardTitle>
        <CardDescription>{t("settings.preferencesDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("settings.themeLabel")}</p>
            <p className="text-xs text-muted">{t("theme.followSystem")}</p>
          </div>
          <ThemeSwitcher />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{t("settings.languageLabel")}</p>
            <p className="text-xs text-muted">{t("locale.currentLanguage", { language: t("locale.english") + " / " + t("locale.bangla") })}</p>
          </div>
          <LanguageSwitcher />
        </div>
      </CardContent>
    </Card>
  );
}
