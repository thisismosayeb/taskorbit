import { getClientLocale, t, type SupportedLocale } from "@/lib/i18n/dictionary";
import { formatDateShortLocale, formatDateTimeLocale } from "@/lib/i18n/format";
// Relative + exact time formatting for notifications and activity.
// Relative time is always computed against the viewer's clock ("5 minutes
// ago"); the exact time is rendered in the workspace timezone so a log entry
// can be pinned to a precise moment.
//
// Locale: an optional trailing `locale` argument (server call sites pass
// the request locale; client call sites omit it and get the client store
// locale). Dates render with en-GB in English and bn-BD (Bengali digits)
// in Bangla — see lib/i18n/format.ts.

/** "just now" / "5 minutes ago" / "2 hours ago" / "Yesterday" / "3 days ago". */
export function formatRelativeTime(iso: string, now: Date = new Date(), locale?: SupportedLocale): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return t("relative.justNow", undefined, locale);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return t("relative.justNow", undefined, locale);
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return minutes === 1 ? t("relative.minuteOne", { count: minutes }, locale) : t("relative.minuteOther", { count: minutes }, locale);
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return hours === 1 ? t("relative.hourOne", { count: hours }, locale) : t("relative.hourOther", { count: hours }, locale);
  const days = Math.floor(hours / 24);
  if (days === 1) return t("relative.yesterday", undefined, locale);
  if (days < 7) return t("relative.daysAgo", { count: days }, locale);
  return formatDateShortLocale(then, locale ?? getClientLocale());
}

/** Exact time in the workspace timezone, e.g. "12 Nov 2026, 14:32". */
export function formatExactTime(iso: string, timezone: string, locale?: SupportedLocale): string {
  return formatDateTimeLocale(new Date(iso), locale ?? getClientLocale(), timezone);
}
