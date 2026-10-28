import { describe, expect, it } from "vitest";

import { packYears, parseProfileForm, type ProfileErrors } from "@/lib/profile";

const CURRENT_YEAR = 2026;

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const NEVER = { birth_year: "1980", sex: "female", smoking_status: "never" };
const SMOKER = { birth_year: "1980", sex: "male", smoking_status: "current", packs_per_day: "1", smoking_years: "20" };
const FORMER = { ...SMOKER, smoking_status: "former", smoking_years: "30", years_since_quitting: "16" };

const parse = (fields: Record<string, string>) => parseProfileForm(form(fields), CURRENT_YEAR);
const errorsOf = (fields: Record<string, string>): ProfileErrors | null => {
  const result = parse(fields);
  return result.ok ? null : result.errors;
};

describe("packYears", () => {
  it.each([
    { packs: 0.1, years: 3, expected: 0.3, note: "float noise rounded away" },
    { packs: 1.33, years: 3, expected: 3.99, note: "two decimals kept" },
    { packs: 0.5, years: 20, expected: 10, note: "half a pack for 20 years" },
  ])("packYears($packs, $years) → $expected ($note)", ({ packs, years, expected }) => {
    expect(packYears(packs, years)).toBe(expected);
  });
});

describe("parseProfileForm", () => {
  it("accepts a never-smoker and returns the whole profile", () => {
    expect(parse(NEVER)).toEqual({
      ok: true,
      value: {
        birth_year: 1980,
        sex: "female",
        smoking_status: "never",
        packs_per_day: null,
        smoking_years: null,
        years_since_quitting: null,
      },
    });
  });

  describe("birth year", () => {
    it.each([
      { birthYear: "", expected: "profile.errors.birthYearRequired", note: "blank" },
      { birthYear: "abc", expected: "profile.errors.birthYearInvalid", note: "not a number" },
      { birthYear: "1905", expected: "profile.errors.birthYearInvalid", note: "age 121" },
      { birthYear: "2027", expected: "profile.errors.birthYearInvalid", note: "a future year" },
      { birthYear: "2009", expected: "profile.errors.birthYearTooYoung", note: "age 17" },
    ])("$birthYear → $expected ($note)", ({ birthYear, expected }) => {
      expect(errorsOf({ ...NEVER, birth_year: birthYear })).toEqual({ birth_year: expected });
    });

    it.each([
      { birthYear: "2008", expected: 2008, note: "age 18 (inclusive)" },
      { birthYear: "1906", expected: 1906, note: "age 120 (inclusive)" },
      { birthYear: " 1980 ", expected: 1980, note: "trimmed" },
    ])("$birthYear is accepted ($note)", ({ birthYear, expected }) => {
      const result = parse({ ...NEVER, birth_year: birthYear });
      expect(result.ok && result.value.birth_year).toBe(expected);
    });
  });

  it.each([
    { field: "sex", value: "", expected: { sex: "profile.errors.sexRequired" } },
    { field: "sex", value: "other", expected: { sex: "profile.errors.sexRequired" } },
    { field: "smoking_status", value: "", expected: { smoking_status: "profile.errors.smokingStatusRequired" } },
    {
      field: "smoking_status",
      value: "sometimes",
      expected: { smoking_status: "profile.errors.smokingStatusRequired" },
    },
  ])("$field '$value' → $expected", ({ field, value, expected }) => {
    expect(errorsOf({ ...NEVER, [field]: value })).toEqual(expected);
  });

  it("drops submitted smoking fields for a never-smoker", () => {
    const result = parse({ ...NEVER, packs_per_day: "5", smoking_years: "10", years_since_quitting: "2" });
    expect(result).toMatchObject({
      ok: true,
      value: { packs_per_day: null, smoking_years: null, years_since_quitting: null },
    });
  });

  it("keeps years since quitting null for a current smoker", () => {
    expect(parse({ ...SMOKER, years_since_quitting: "5" })).toEqual({
      ok: true,
      value: {
        birth_year: 1980,
        sex: "male",
        smoking_status: "current",
        packs_per_day: 1,
        smoking_years: 20,
        years_since_quitting: null,
      },
    });
  });

  describe("packs per day", () => {
    it.each([
      { packs: "0,5", expected: 0.5, note: "decimal comma" },
      { packs: "0,555", expected: 0.56, note: "rounded to 2 decimals" },
      { packs: "10", expected: 10, note: "upper bound (inclusive)" },
    ])("$packs → $expected ($note)", ({ packs, expected }) => {
      const result = parse({ ...SMOKER, packs_per_day: packs });
      expect(result.ok && result.value.packs_per_day).toBe(expected);
    });

    it.each(["0", "10.01", "abc"])("%s → packsPerDayInvalid", (packs) => {
      expect(errorsOf({ ...SMOKER, packs_per_day: packs })).toEqual({
        packs_per_day: "profile.errors.packsPerDayInvalid",
      });
    });
  });

  describe("smoking years", () => {
    it.each([
      { years: "0", note: "below 1" },
      { years: "47", note: "longer than the age (46)" },
    ])("$years → smokingYearsInvalid ($note)", ({ years }) => {
      expect(errorsOf({ ...SMOKER, smoking_years: years })).toEqual({
        smoking_years: "profile.errors.smokingYearsInvalid",
      });
    });

    it("is bounded by the column limit (100) when the birth year is invalid", () => {
      expect(errorsOf({ ...SMOKER, birth_year: "abc", smoking_years: "100" })).toEqual({
        birth_year: "profile.errors.birthYearInvalid",
      });
      expect(errorsOf({ ...SMOKER, birth_year: "abc", smoking_years: "101" })).toEqual({
        birth_year: "profile.errors.birthYearInvalid",
        smoking_years: "profile.errors.smokingYearsInvalid",
      });
    });
  });

  describe("former smoker (born 1980, age 46)", () => {
    it("requires years since quitting", () => {
      expect(errorsOf({ ...FORMER, years_since_quitting: "" })).toEqual({
        years_since_quitting: "profile.errors.yearsSinceQuittingInvalid",
      });
    });

    it("accepts 0 years since quitting", () => {
      const result = parse({ ...FORMER, years_since_quitting: "0" });
      expect(result.ok && result.value.years_since_quitting).toBe(0);
    });

    it("accepts smoking years plus years since quitting equal to the age", () => {
      expect(parse(FORMER)).toEqual({
        ok: true,
        value: {
          birth_year: 1980,
          sex: "male",
          smoking_status: "former",
          packs_per_day: 1,
          smoking_years: 30,
          years_since_quitting: 16,
        },
      });
    });

    it("rejects smoking years plus years since quitting longer than the age, on smoking_years", () => {
      expect(errorsOf({ ...FORMER, years_since_quitting: "17" })).toEqual({
        smoking_years: "profile.errors.smokingLongerThanAge",
      });
    });
  });

  it("returns every field error at once", () => {
    expect(
      errorsOf({
        birth_year: "",
        smoking_status: "former",
        packs_per_day: "0",
        smoking_years: "0",
        years_since_quitting: "",
      }),
    ).toEqual({
      birth_year: "profile.errors.birthYearRequired",
      sex: "profile.errors.sexRequired",
      packs_per_day: "profile.errors.packsPerDayInvalid",
      smoking_years: "profile.errors.smokingYearsInvalid",
      years_since_quitting: "profile.errors.yearsSinceQuittingInvalid",
    });
  });
});
