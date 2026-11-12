// TaskOrbit AI — "Generate today's brief" button (client). The manual
// fallback for the daily cron: it always works even if the cron fails.

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { generateAiFeature } from "@/lib/actions/ai";
import { Button } from "@/components/ui/button";
import { t, useLocale} from "@/lib/i18n";

export function GenerateBriefButton() {
  useLocale();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setMessage(null);
    try {
      const result = await generateAiFeature("daily_brief");
      if (result.ok) {
        // The card re-reads the cache on refresh.
        router.refresh();
        setMessage(t("ai.generatedWithAi"));
      } else {
        setMessage(result.error);
      }
    } catch {
      setMessage(t("ai.errorTitle"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Wand2 className="h-4 w-4" aria-hidden />}
        {pending ? t("ai.generating") : t("ai.generateBrief")}
      </Button>
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </div>
  );
}
