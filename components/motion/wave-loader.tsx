"use client";

import { cn } from "@/lib/utils";
import { t, useLocale} from "@/lib/i18n";

/**
 * Wave Loader — used for AI generation, saves and route loading.
 * Three rising dots in the brand gradient; with prefers-reduced-motion
 * it becomes a simple static indicator (see globals.css).
 */
export function WaveLoader({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  useLocale();
  return (
    <div
      role="status"
      aria-label={label ?? t("motion.loadingRoute")}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span className="flex items-end gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="animate-float-soft inline-block h-2.5 w-2.5 rounded-full bg-primary"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </span>
      <span className="text-sm text-muted">{label ?? t("motion.loadingRoute")}</span>
    </div>
  );
}

/** Full-page route loading state. */
export function RouteLoader({ label }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <WaveLoader label={label} />
    </div>
  );
}
