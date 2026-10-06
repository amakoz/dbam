import { SMOKING_STATUSES, type Profile } from "@/lib/profile";

// The closed vocabulary of risk factors a catalog eligibility rule may reference (`requires` conditions in
// `schema.ts`). Age and sex are branch fields, not factors. `collected` says whether the profile asks for the
// factor today; a collected factor names the `profiles` column that holds it.
//
// Semantics fixed by the screening-catalog-v1 plan; S-02 (recommendations) and S-05 implement them:
// - Eligibility: an entry is eligible when ANY branch in `eligibility` matches.
// - Branch match: all of these hold:
//   - `sex` is absent or equal to the profile's sex;
//   - `age_min ≤ age ≤ age_max`, inclusive, with `age = currentYear − birth_year` and an absent `age_max` meaning
//     no upper bound;
//   - every `requires` condition holds.
// - Conditions: a condition on a factor with `collected: false` makes that branch *unknown*, never true. A condition
//   whose profile value is null is false.
// - Interval: `interval_months` applies when `interval_kind = 'fixed'`. The FIRST `interval_overrides` entry whose
//   `when` matches replaces it. Other kinds have no computable next due date and must be shown as such.

/** The profile fields the eligibility and interval rules read; the cron passes only these. */
export type RuleProfile = Pick<
  Profile,
  "birth_year" | "sex" | "smoking_status" | "pack_years" | "years_since_quitting"
>;

type ProfileColumn = keyof RuleProfile;

type FactorKind = { kind: "number" } | { kind: "boolean" } | { kind: "enum"; values: readonly [string, ...string[]] };

type FactorSource = { collected: true; column: ProfileColumn } | { collected: false };

export type FactorDefinition = FactorKind & FactorSource & { description: string };

export const FACTORS = {
  // Collected by the onboarding profile.
  smoking_status: {
    kind: "enum",
    values: SMOKING_STATUSES,
    collected: true,
    column: "smoking_status",
    description: "Smoking status: never, current or former smoker.",
  },
  pack_years: {
    kind: "number",
    collected: true,
    column: "pack_years",
    description: "Pack-years: packs smoked per day × years smoked. Null for never-smokers.",
  },
  years_since_quitting: {
    kind: "number",
    collected: true,
    column: "years_since_quitting",
    description: "Full years since a former smoker quit. Null unless smoking_status is former.",
  },

  // Not collected yet: a rule may reference them, but a branch that does is unknown, never true.
  family_history_crc_first_degree: {
    kind: "boolean",
    collected: false,
    description: "A first-degree relative (parent, sibling, child) had colorectal cancer.",
  },
  family_history_breast_ovarian: {
    kind: "boolean",
    collected: false,
    description: "A close relative had breast or ovarian cancer (or a known BRCA mutation runs in the family).",
  },
  occupational_carcinogen_exposure: {
    kind: "boolean",
    collected: false,
    description: "Occupational exposure to carcinogens (e.g. asbestos, radon, silica).",
  },
  bmi: {
    kind: "number",
    collected: false,
    description: "Body mass index in kg/m².",
  },
  hypertension: {
    kind: "boolean",
    collected: false,
    description: "Diagnosed arterial hypertension.",
  },
  dyslipidemia: {
    kind: "boolean",
    collected: false,
    description: "Diagnosed dyslipidemia (abnormal blood lipids).",
  },
  diabetes: {
    kind: "boolean",
    collected: false,
    description: "Diagnosed diabetes (type 1 or 2).",
  },
  cardiovascular_disease: {
    kind: "boolean",
    collected: false,
    description: "Diagnosed cardiovascular disease (e.g. coronary disease, past heart attack or stroke).",
  },
  fatty_liver: {
    kind: "boolean",
    collected: false,
    description: "Diagnosed fatty liver disease (MASLD/NAFLD).",
  },
  hiv_or_immunosuppression: {
    kind: "boolean",
    collected: false,
    description: "HIV infection or other immunosuppression (e.g. after a transplant, on immunosuppressants).",
  },
  pregnancy: {
    kind: "boolean",
    collected: false,
    description: "Currently pregnant.",
  },
  prior_cancer: {
    kind: "boolean",
    collected: false,
    description: "A past cancer diagnosis.",
  },
  hysterectomy: {
    kind: "boolean",
    collected: false,
    description: "Had a hysterectomy (removal of the uterus).",
  },
  questionnaire_flags_risk: {
    kind: "boolean",
    collected: false,
    description: "The program's health questionnaire (e.g. Moje Zdrowie) flags a risk that makes this check indicated.",
  },
} as const satisfies Record<string, FactorDefinition>;

export type FactorId = keyof typeof FACTORS;

export const FACTOR_IDS = Object.keys(FACTORS) as [FactorId, ...FactorId[]];
