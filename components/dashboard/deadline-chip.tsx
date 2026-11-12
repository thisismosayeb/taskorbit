import { getDeadlineState, getDeadlineLegend, type DeadlineTaskInput } from "@/lib/date/deadline";
import type { SupportedLocale } from "@/lib/i18n/dictionary";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const variantForState: Record<string, "green" | "red" | "amber" | "cyan" | "neutral"> = {
  green: "green",
  red: "red",
  amber: "amber",
  neutral: "cyan",
  none: "neutral",
};

// `locale` is optional: server callers pass the request locale so the
// chip translates in the first server pass; client callers omit it and
// the client i18n store applies (see lib/i18n/index.ts).
export function DeadlineChip({
  task,
  timezone,
  className,
  locale,
}: {
  task: DeadlineTaskInput;
  timezone: string;
  className?: string;
  locale?: SupportedLocale;
}) {
  const result = getDeadlineState(task, timezone, undefined, locale);
  return (
    <Badge variant={variantForState[result.state]} title={result.detail} className={cn(className)}>
      {result.label}
    </Badge>
  );
}

/** Text legend explaining what each deadline color means. */
export function DeadlineLegend({ className, locale }: { className?: string; locale?: SupportedLocale }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted", className)}>
      {getDeadlineLegend(locale).map((item) => (
        <span key={item.state} title={item.description} className="inline-flex items-center gap-1.5">
          <Badge variant={variantForState[item.state]}>{item.label}</Badge>
          <span>{item.description}</span>
        </span>
      ))}
    </div>
  );
}
