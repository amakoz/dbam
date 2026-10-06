import { describe, expect, it } from "vitest";

import { createT, type Locale } from "@/i18n";
import type { Interval } from "@/lib/catalog/recommend";
import type { Branch, Condition } from "@/lib/catalog/schema";
import { describeBranch, describeCondition, describeInterval, describeMissing } from "@/lib/catalog/wording";

// Expected strings are the output of the real `createT` on Node 22 (ICU formatting of lists and numbers). If they
// fail after a Node update with no code change, re-probe the strings and re-pin them.

type Localized = Record<Locale, string>;

const hypertension: Condition = { factor: "hypertension", op: "eq", value: true };
const crcFamilyHistory: Condition = { factor: "family_history_crc_first_degree", op: "eq", value: true };
const bmiOver25: Condition = { factor: "bmi", op: "gte", value: 25 };
const smokingCurrentOrFormer: Condition = { factor: "smoking_status", op: "in", value: ["current", "former"] };

describe("describeCondition", () => {
  const cases: [string, Condition, Localized][] = [
    [
      "an inclusive number threshold",
      { factor: "pack_years", op: "gte", value: 20 },
      { pl: "paczkolata ≥ 20", en: "pack-years ≥ 20" },
    ],
    [
      "a decimal with the locale's separator",
      { factor: "bmi", op: "gte", value: 25.5 },
      { pl: "BMI ≥ 25,5", en: "BMI ≥ 25.5" },
    ],
    [
      "a boolean factor",
      hypertension,
      {
        pl: "lekarz rozpoznał u Ciebie nadciśnienie tętnicze",
        en: "a doctor has diagnosed you with high blood pressure",
      },
    ],
    [
      "a negated boolean factor",
      { factor: "hypertension", op: "eq", value: false },
      {
        pl: "nie jest tak, że lekarz rozpoznał u Ciebie nadciśnienie tętnicze",
        en: "it is not the case that a doctor has diagnosed you with high blood pressure",
      },
    ],
    [
      "a list of enum values",
      smokingCurrentOrFormer,
      { pl: "palenie papierosów: tak, obecnie lub w przeszłości", en: "smoking: yes, currently or in the past" },
    ],
    [
      "a single enum value",
      { factor: "smoking_status", op: "eq", value: "never" },
      { pl: "palenie papierosów: nie, nigdy", en: "smoking: no, never" },
    ],
  ];

  it.each(cases)("words %s", (_name, condition, expected) => {
    for (const locale of ["pl", "en"] as const) {
      expect(describeCondition(condition, createT(locale), locale)).toBe(expected[locale]);
    }
  });
});

describe("describeBranch", () => {
  const cases: [string, Branch, Localized][] = [
    [
      "a sex and an age range",
      { sex: "female", age_min: 45, age_max: 74, requires: [] },
      { pl: "kobiety i wiek 45–74 lat", en: "women and age 45–74" },
    ],
    ["an open-ended age", { age_min: 50, requires: [] }, { pl: "wiek od 50 lat", en: "age 50 or older" }],
    [
      "a sex, an age range and a condition",
      { sex: "male", age_min: 65, age_max: 75, requires: [smokingCurrentOrFormer] },
      {
        pl: "mężczyźni, wiek 65–75 lat i palenie papierosów: tak, obecnie lub w przeszłości",
        en: "men, age 65–75, and smoking: yes, currently or in the past",
      },
    ],
  ];

  it.each(cases)("words %s", (_name, branch, expected) => {
    for (const locale of ["pl", "en"] as const) {
      expect(describeBranch(branch, createT(locale), locale)).toBe(expected[locale]);
    }
  });
});

describe("describeInterval", () => {
  const months = (n: number): Interval => ({ kind: "months", months: n });
  const cases: [string, Interval, Localized][] = [
    ["12 months", months(12), { pl: "co roku", en: "every year" }],
    ["24 months", months(24), { pl: "co 2 lata", en: "every 2 years" }],
    ["60 months", months(60), { pl: "co 5 lat", en: "every 5 years" }],
    ["1 month", months(1), { pl: "co miesiąc", en: "every month" }],
    ["2 months", months(2), { pl: "co 2 miesiące", en: "every 2 months" }],
    ["6 months", months(6), { pl: "co 6 miesięcy", en: "every 6 months" }],
    ["shared_decision", { kind: "shared_decision" }, { pl: "ustalasz z lekarzem", en: "decide with your doctor" }],
    ["no_known_interval", { kind: "no_known_interval" }, { pl: "brak ustalonego odstępu", en: "no set interval" }],
    ["per_program", { kind: "per_program" }, { pl: "według zasad programu", en: "set by the program" }],
  ];

  it.each(cases)("words %s", (_name, interval, expected) => {
    for (const locale of ["pl", "en"] as const) {
      expect(describeInterval(interval, createT(locale))).toBe(expected[locale]);
    }
  });
});

describe("describeMissing", () => {
  it("joins the conditions of a branch with 'and' and the branches with 'or'", () => {
    const missing = [[crcFamilyHistory], [bmiOver25, hypertension]];
    expect(describeMissing(missing, createT("pl"), "pl")).toBe(
      "Twój rodzic, rodzeństwo lub dziecko chorowało na raka jelita grubego lub BMI ≥ 25 i lekarz rozpoznał u Ciebie nadciśnienie tętnicze",
    );
    expect(describeMissing(missing, createT("en"), "en")).toBe(
      "a first-degree relative (parent, sibling or child) had colorectal cancer or BMI ≥ 25 and a doctor has diagnosed you with high blood pressure",
    );
  });
});
