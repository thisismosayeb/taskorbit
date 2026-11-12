import { formatPercent } from "@/lib/progress";
import { cn } from "@/lib/utils";
import { t, type SupportedLocale } from "@/lib/i18n/dictionary";

export function ProgressBar({
  percent,
  label,
  className,
  barClassName,
  locale,
}: {
  percent: number;
  label?: string;
  className?: string;
  barClassName?: string;
  // Server callers pass the request locale; client callers omit it and
  // the client i18n store applies.
  locale?: SupportedLocale;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("w-full", className)}>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? t("progress.aria", { percent: formatPercent(clamped) }, locale)}
      >
        <div
          className={cn("h-full rounded-full bg-primary transition-all", barClassName)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
