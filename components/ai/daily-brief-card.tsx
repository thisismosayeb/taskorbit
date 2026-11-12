// TaskOrbit AI — "AI Daily Brief" card for the manager dashboard
// (Part 3, spec section 8). Server component: shows the cached brief
// (or a Generate button / not-configured state). It never changes KPI
// card hrefs and never touches business logic.

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getCachedDailyBrief } from "@/lib/actions/ai";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";
import { GenerateBriefButton } from "./generate-brief-button";

export async function AiDailyBriefCard() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const brief = await getCachedDailyBrief();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            {t("ai.dailyBriefCard")}
          </CardTitle>
          <Link href="/dashboard/ai" className="text-sm font-medium text-primary hover:underline">
            {t("ai.viewAiPage")}
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {brief.ok ? (
          <div className="space-y-2">
            <p className="font-medium">{brief.content.headline}</p>
            <ul className="space-y-1 text-sm text-muted">
              {brief.content.nextActions.slice(0, 3).map((a, i) => (
                <li key={i}>• {a.text}</li>
              ))}
            </ul>
            <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" aria-hidden />
                {t("ai.generatedWithAi")}
              </span>
              <span>{t("ai.generatedAt", { date: new Date(brief.generatedAt).toLocaleString() })}</span>
            </p>
          </div>
        ) : brief.notConfigured ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("ai.notConfiguredTitle")}</p>
            <p className="text-sm text-muted">{t("ai.notConfiguredBody")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">{t("ai.noCachedBrief")}</p>
            <GenerateBriefButton />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
