import { describe, expect, it } from "vitest";

import { createT, type Locale } from "@/i18n";
import { describeLastDone, formatDay, formatMonth, screeningFormBounds } from "@/lib/screenings/format";
import type { ScreeningCompletion } from "@/lib/screenings/rules";

// Expected strings are the output of the real `createT` and Intl date formatting on Node 22 with the Europe/Warsaw
// time zone. If they fail after a Node update with no code change, re-probe the strings and re-pin them.

type Localized = Record<Locale, string>;
type LastDoneInput = Pick<ScreeningCompletion, "last_done_month" | "last_done_on" | "updated_at">;

describe("describeLastDone", () => {
  const cases: [string, LastDoneInput, Localized][] = [
    [
      "the exact day when a confirmed plan recorded it",
      { last_done_on: "2026-03-05", last_done_month: "2026-03-01", updated_at: "2026-03-05T10:00:00+00:00" },
      { pl: "Ostatnio wykonane: 5 marca 2026", en: "Last done: March 5, 2026" },
    ],
    [
      "the month when the user entered one",
      { last_done_on: null, last_done_month: "2026-03-01", updated_at: "2026-10-06T10:00:00+00:00" },
      { pl: "Ostatnio wykonane: marzec 2026", en: "Last done: March 2026" },
    ],
    [
      "the Warsaw month of the save when the user left the month blank",
      { last_done_on: null, last_done_month: null, updated_at: "2026-02-28T23:30:00+00:00" },
      { pl: "Oznaczone jako wykonane: marzec 2026", en: "Marked done in March 2026" },
    ],
  ];

  it.each(cases)("words %s", (_name, completion, expected) => {
    for (const locale of ["pl", "en"] as const) {
      expect(describeLastDone(completion, createT(locale), locale)).toBe(expected[locale]);
    }
  });
});

describe("screeningFormBounds", () => {
  it("allows appointments from today to two years ahead and done years back to the birth year", () => {
    const { minDate, maxDate, years } = screeningFormBounds(new Date("2026-10-06T10:00:00Z"), 1980, "pl");
    expect({ minDate, maxDate }).toEqual({ minDate: "2026-10-06", maxDate: "2028-10-06" });
    expect([years[0], years.at(-1), years.length]).toEqual([2026, 1980, 47]);
  });

  it("uses the Warsaw date, which is already the new year at 23:30 UTC on Dec 31", () => {
    const { minDate, maxDate, years } = screeningFormBounds(new Date("2026-12-31T23:30:00Z"), 1980, "pl");
    expect({ minDate, maxDate, firstYear: years[0] }).toEqual({
      minDate: "2027-01-01",
      maxDate: "2029-01-01",
      firstYear: 2027,
    });
  });

  it("rolls a leap-day today over to Mar 1 two years ahead", () => {
    expect(screeningFormBounds(new Date("2028-02-29T10:00:00Z"), 1980, "pl").maxDate).toBe("2030-03-01");
  });

  it("offers no years when the birth year is after the current year", () => {
    expect(screeningFormBounds(new Date("2026-10-06T10:00:00Z"), 2027, "pl").years).toEqual([]);
  });

  it.each([
    { locale: "pl" as const, labels: ["styczeń", "październik", "grudzień"] },
    { locale: "en" as const, labels: ["January", "October", "December"] },
  ])("names the 12 months in $locale", ({ locale, labels }) => {
    const { months } = screeningFormBounds(new Date("2026-10-06T10:00:00Z"), 1980, locale);
    expect(months.map((month) => month.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect([months[0].label, months[9].label, months[11].label]).toEqual(labels);
  });
});

describe("formatDay", () => {
  it.each<[string, Localized]>([
    ["2026-10-12", { pl: "12 października 2026", en: "October 12, 2026" }],
    ["2028-02-29", { pl: "29 lutego 2028", en: "February 29, 2028" }],
    // Formatted in UTC: a west-of-UTC process would otherwise print Dec 31, 2025.
    ["2026-01-01", { pl: "1 stycznia 2026", en: "January 1, 2026" }],
  ])("formats %s", (date, expected) => {
    for (const locale of ["pl", "en"] as const) {
      expect(formatDay(date, locale)).toBe(expected[locale]);
    }
  });
});

describe("formatMonth", () => {
  it.each<[string, Localized]>([
    ["2026-10-01", { pl: "październik 2026", en: "October 2026" }],
    ["2026-01-01", { pl: "styczeń 2026", en: "January 2026" }],
  ])("formats %s", (month, expected) => {
    for (const locale of ["pl", "en"] as const) {
      expect(formatMonth(month, locale)).toBe(expected[locale]);
    }
  });
});
