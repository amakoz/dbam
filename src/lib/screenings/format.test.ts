import { describe, expect, it } from "vitest";

import { createT, type Locale } from "@/i18n";
import { describeLastDone } from "@/lib/screenings/format";
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
