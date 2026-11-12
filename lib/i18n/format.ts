// Locale-aware date / number formatting (Part 3, §7).
//
// English renders with `en-GB` (the app's existing convention: "12 Nov
// 2026"); Bangla renders with `bn-BD`, which uses Bengali digits —
// consistent everywhere, never mixed with Latin digits in the same
// locale. User-created content is never passed through here.

import type { SupportedLocale } from "./dictionary";

export function localeTag(locale: SupportedLocale): string {
  return locale === "bn" ? "bn-BD" : "en-GB";
}

/** Short date, e.g. "12 Nov 2026" / "১২ নভে ২০২৬". */
export function formatDateShortLocale(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Date + time, e.g. "12 Nov 2026, 14:32" / "১২ নভে ২০২৬, ১৪:৩২". */
export function formatDateTimeLocale(date: Date, locale: SupportedLocale, timeZone?: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Month + year, e.g. "November 2026" / "নভেম্বর ২০২৬". */
export function formatMonthYearLocale(date: Date, locale: SupportedLocale, timeZone?: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone,
    month: "long",
    year: "numeric",
  }).format(date);
}

/** A plain number in the locale's digits, e.g. 12 / ১২. */
export function formatNumberLocale(value: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

/** "12 Nov" style short date without the year. */
export function formatDayMonthLocale(date: Date, locale: SupportedLocale, timeZone?: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone,
    day: "numeric",
    month: "short",
  }).format(date);
}
