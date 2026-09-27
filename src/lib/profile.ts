import type { MessageKey } from "@/i18n";
import type { Database } from "@/lib/database.types";

// Validation for the onboarding/profile form, shared by the React island (before submit) and `POST /api/profile`
// (authoritative). Bounds mirror the `profiles` check constraints in supabase/migrations.

export const SEX_VALUES = ["female", "male"] as const;
export type Sex = (typeof SEX_VALUES)[number];

export const SMOKING_STATUSES = ["never", "current", "former"] as const;
export type SmokingStatus = (typeof SMOKING_STATUSES)[number];

export const MIN_AGE = 18;
export const MAX_AGE = 120;
const MAX_PACKS_PER_DAY = 10;
const MAX_YEARS = 100;

export const SEX_LABEL_KEYS = {
  female: "profile.form.sex.female",
  male: "profile.form.sex.male",
} as const satisfies Record<Sex, MessageKey>;

export const SMOKING_STATUS_LABEL_KEYS = {
  never: "profile.form.smokingStatus.never",
  current: "profile.form.smokingStatus.current",
  former: "profile.form.smokingStatus.former",
} as const satisfies Record<SmokingStatus, MessageKey>;

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface ProfileInput {
  birth_year: number;
  sex: Sex;
  smoking_status: SmokingStatus;
  packs_per_day: number | null;
  smoking_years: number | null;
  years_since_quitting: number | null;
}

export type ProfileField = keyof ProfileInput;
export type ProfileErrors = Partial<Record<ProfileField, MessageKey>>;
export type ProfileParseResult = { ok: true; value: ProfileInput } | { ok: false; errors: ProfileErrors };

function isOneOf<T extends string>(values: readonly T[], value: string): value is T {
  return values.some((v) => v === value);
}

function field(form: FormData, name: ProfileField): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseInteger(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null;
}

/** Accepts a decimal comma ("0,5") as well as a point; rounds to the column's 2 decimals. */
function parseDecimal(value: string): number | null {
  const normalized = value.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(normalized) ? Math.round(Number(normalized) * 100) / 100 : null;
}

/** Pack-years = packs per day × years smoked, as the `profiles.pack_years` generated column computes it. */
export function packYears(packsPerDay: number, smokingYears: number): number {
  return Math.round(packsPerDay * smokingYears * 100) / 100;
}

/** Validates the submitted form. Smoking fields that don't apply to the chosen status are dropped (null). */
export function parseProfileForm(form: FormData, currentYear: number): ProfileParseResult {
  const errors: ProfileErrors = {};

  const birthYearRaw = field(form, "birth_year");
  const birthYear = parseInteger(birthYearRaw);
  let age: number | null = null;
  if (!birthYearRaw) {
    errors.birth_year = "profile.errors.birthYearRequired";
  } else if (birthYear === null || currentYear - birthYear > MAX_AGE || birthYear > currentYear) {
    errors.birth_year = "profile.errors.birthYearInvalid";
  } else if (currentYear - birthYear < MIN_AGE) {
    errors.birth_year = "profile.errors.birthYearTooYoung";
  } else {
    age = currentYear - birthYear;
  }
  // Without a valid age, bound the smoking years by the column limit only.
  const yearsLimit = Math.min(age ?? MAX_YEARS, MAX_YEARS);

  const sex = field(form, "sex");
  if (!isOneOf(SEX_VALUES, sex)) errors.sex = "profile.errors.sexRequired";

  const status = field(form, "smoking_status");
  let packsPerDay: number | null = null;
  let smokingYears: number | null = null;
  let yearsSinceQuitting: number | null = null;

  if (!isOneOf(SMOKING_STATUSES, status)) {
    errors.smoking_status = "profile.errors.smokingStatusRequired";
  } else if (status !== "never") {
    packsPerDay = parseDecimal(field(form, "packs_per_day"));
    if (packsPerDay === null || packsPerDay <= 0 || packsPerDay > MAX_PACKS_PER_DAY) {
      errors.packs_per_day = "profile.errors.packsPerDayInvalid";
    }

    smokingYears = parseInteger(field(form, "smoking_years"));
    if (smokingYears === null || smokingYears < 1 || smokingYears > yearsLimit) {
      errors.smoking_years = "profile.errors.smokingYearsInvalid";
    }

    if (status === "former") {
      yearsSinceQuitting = parseInteger(field(form, "years_since_quitting"));
      if (yearsSinceQuitting === null || yearsSinceQuitting > yearsLimit) {
        errors.years_since_quitting = "profile.errors.yearsSinceQuittingInvalid";
      } else if (
        age !== null &&
        smokingYears !== null &&
        !errors.smoking_years &&
        smokingYears + yearsSinceQuitting > age
      ) {
        errors.smoking_years = "profile.errors.smokingLongerThanAge";
      }
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    birthYear === null ||
    !isOneOf(SEX_VALUES, sex) ||
    !isOneOf(SMOKING_STATUSES, status)
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      birth_year: birthYear,
      sex,
      smoking_status: status,
      packs_per_day: packsPerDay,
      smoking_years: smokingYears,
      years_since_quitting: yearsSinceQuitting,
    },
  };
}
