import type { Locale, Translate } from "@/i18n";
import {
  addYears,
  anchorMonth,
  MAX_APPOINTMENT_YEARS_AHEAD,
  warsawToday,
  type ScreeningCompletion,
} from "@/lib/screenings/rules";

// Display helpers for plans and done records on the dashboard. Stored values are plain dates (`YYYY-MM-DD`, months as
// `YYYY-MM-01`), so they are formatted in UTC and never shift by a day.

/** The limits of the Plan and Done forms, matching what `POST /api/screenings` accepts. */
export interface ScreeningFormBounds {
  /** Earliest appointment date: today in Warsaw (`YYYY-MM-DD`). */
  minDate: string;
  /** Latest appointment date (`YYYY-MM-DD`). */
  maxDate: string;
  /** Years for the "last done" year select: the current Warsaw year down to the birth year. */
  years: number[];
  /** The 12 months for the "last done" month select, named in the page's locale. */
  months: { value: number; label: string }[];
}

export function screeningFormBounds(now: Date, birthYear: number, locale: Locale): ScreeningFormBounds {
  const today = warsawToday(now);
  const currentYear = Number(today.slice(0, 4));
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  return {
    minDate: today,
    maxDate: addYears(today, MAX_APPOINTMENT_YEARS_AHEAD),
    years: Array.from({ length: Math.max(currentYear - birthYear + 1, 0) }, (_, i) => currentYear - i),
    months: Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: monthName.format(Date.UTC(2000, i, 1)) })),
  };
}

/** A plain date (`YYYY-MM-DD`) as e.g. "12 October 2026". */
export function formatDay(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(date));
}

/** A month (`YYYY-MM-01`) as e.g. "October 2026". */
export function formatMonth(month: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month));
}

/**
 * "Last done: …" with the exact day when a confirmed plan recorded it, else with the month, or "Marked done in …"
 * when the user didn't know the month (it then counts from the save).
 */
export function describeLastDone(
  completion: Pick<ScreeningCompletion, "last_done_month" | "last_done_on" | "updated_at">,
  t: Translate,
  locale: Locale,
): string {
  if (completion.last_done_on) {
    return t("dashboard.screenings.done.lastDoneOn", { date: formatDay(completion.last_done_on, locale) });
  }
  return completion.last_done_month
    ? t("dashboard.screenings.done.lastDone", { month: formatMonth(completion.last_done_month, locale) })
    : t("dashboard.screenings.done.markedIn", { month: formatMonth(anchorMonth(completion), locale) });
}
