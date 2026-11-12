// TaskOrbit AI page (Part 3, spec section 8).
//
// Label: "TaskOrbit AI". Managers see all six features; developers see
// My Focus, Deadline Risk, Standup Draft and Next Actions (Daily Brief
// and Project Summary are manager-only — enforced again in the server
// action, so the UI hiding them is not the only gate).
//
// No key configured: a clean "not configured" state, no secrets shown,
// nothing breaks. AI cards are hidden elsewhere (sidebar link stays,
// dashboard card shows the same not-configured state).

import { Sparkles } from "lucide-react";
import { getDashboardContext } from "@/lib/actions/workspace";
import { getAiProjectOptions, getCachedAiFeature } from "@/lib/actions/ai";
import { isManager } from "@/lib/permissions";
import { isAiConfigured } from "@/lib/ai/config";
import { featuresForRole, type AiFeature } from "@/lib/ai/features";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiFeatureCard } from "@/components/ai/ai-feature-card";
import type { AiOutput } from "@/lib/ai/schemas";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

const FEATURE_COPY: Record<AiFeature, { titleKey: string; bodyKey: string }> = {
  daily_brief: { titleKey: "ai.brief", bodyKey: "ai.briefBody" },
  project_summary: { titleKey: "ai.projectSummary", bodyKey: "ai.projectSummaryBody" },
  my_focus: { titleKey: "ai.myFocus", bodyKey: "ai.myFocusBody" },
  deadline_risk: { titleKey: "ai.deadlineRisk", bodyKey: "ai.deadlineRiskBody" },
  standup: { titleKey: "ai.standup", bodyKey: "ai.standupBody" },
  next_actions: { titleKey: "ai.nextActions", bodyKey: "ai.nextActionsBody" },
};

export default async function AiPage() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  const ctx = await getDashboardContext();
  if (!ctx.user || !ctx.workspace || !ctx.role) return null;

  const configured = isAiConfigured();
  const features = featuresForRole(ctx.role);

  if (!configured) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            {t("ai.title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("ai.subtitle")}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("ai.notConfiguredTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted">{t("ai.notConfiguredBody")}</p>
            {isManager(ctx.role) ? (
              <p className="text-xs text-muted">{t("ai.notConfiguredHint")}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const projectOptions = isManager(ctx.role) ? await getAiProjectOptions() : [];

  // Load each visible feature's cached result (today's, if any) so the
  // page opens with the last generated output instead of empty cards.
  const cached = new Map<AiFeature, { content: AiOutput[AiFeature]; generatedAt: string }>();
  for (const feature of features) {
    const result = await getCachedAiFeature(feature, {
      projectId: feature === "project_summary" ? projectOptions[0]?.id : undefined,
    });
    if (result.ok) cached.set(feature, { content: result.content, generatedAt: result.generatedAt });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden />
          {t("ai.title")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("ai.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {features.map((feature) => {
          const copy = FEATURE_COPY[feature];
          const entry = cached.get(feature);
          return (
            <AiFeatureCard
              key={feature}
              feature={feature}
              title={t(copy.titleKey)}
              body={t(copy.bodyKey)}
              projectOptions={feature === "project_summary" ? projectOptions : undefined}
              initialContent={entry?.content ?? null}
              initialGeneratedAt={entry?.generatedAt ?? null}
            />
          );
        })}
      </div>

      <p className="text-xs text-muted">{t("ai.aiCanBeWrong")}</p>
    </div>
  );
}
