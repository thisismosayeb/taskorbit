// Loading skeleton for /dashboard/analytics: same layout as the page
// (header, filter bar, six chart cards) with pulsing blocks instead of
// charts, so the page never flashes empty while the server aggregates.

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createTranslator, getServerLocale } from "@/lib/i18n/server";

function SkeletonCard() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="pb-2">
        <div className="h-5 w-44 animate-pulse rounded bg-ink/10" />
        <div className="mt-2 h-4 w-72 max-w-full animate-pulse rounded bg-ink/10" />
      </CardHeader>
      <CardContent>
        <div className="h-[260px] w-full animate-pulse rounded-lg bg-ink/5" />
      </CardContent>
    </Card>
  );
}

export default async function AnalyticsLoading() {
  const locale = await getServerLocale();
  const t = createTranslator(locale);
  return (
    <div className="space-y-6" aria-label={t("analytics.loadingAria")}>
      <div>
        <div className="h-8 w-40 animate-pulse rounded bg-ink/10" />
        <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-ink/10" />
      </div>
      <Card aria-hidden="true">
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="h-10 w-56 animate-pulse rounded-lg bg-ink/10" />
            <div className="h-10 w-44 animate-pulse rounded-lg bg-ink/10" />
            <div className="h-10 w-44 animate-pulse rounded-lg bg-ink/10" />
            <div className="h-10 w-28 animate-pulse rounded-lg bg-ink/10" />
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
