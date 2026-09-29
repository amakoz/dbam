import type { Locale, MessageKey, Translate } from "@/i18n";
import type { FactorId, FACTORS } from "@/lib/catalog/factors";
import type { Interval } from "@/lib/catalog/recommend";
import type { Branch, Condition } from "@/lib/catalog/schema";
import { SMOKING_STATUS_LABEL_KEYS, type Sex } from "@/lib/profile";

// Turns eligibility rules and intervals into localized phrases. Every factor needs wording for its kind, so adding a
// factor to `factors.ts` without phrases here fails the type check.

interface WordingByKind {
  /** The phrase for `eq true`; `eq false` wraps it in the shared negation key. */
  boolean: { kind: "boolean"; true: MessageKey };
  /** One phrase per op, with a `{value}` placeholder. */
  number: { kind: "number"; eq: MessageKey; gte: MessageKey; lte: MessageKey };
  /** One phrase with a `{values}` placeholder, filled with the labels of the listed values. */
  enum: { kind: "enum"; key: MessageKey; labels: Readonly<Record<string, MessageKey>> };
}

type FactorWording = WordingByKind[keyof WordingByKind];

const FACTOR_WORDING = {
  smoking_status: {
    kind: "enum",
    key: "dashboard.recommendations.factor.smoking_status",
    labels: SMOKING_STATUS_LABEL_KEYS,
  },
  pack_years: {
    kind: "number",
    eq: "dashboard.recommendations.factor.pack_years.eq",
    gte: "dashboard.recommendations.factor.pack_years.gte",
    lte: "dashboard.recommendations.factor.pack_years.lte",
  },
  years_since_quitting: {
    kind: "number",
    eq: "dashboard.recommendations.factor.years_since_quitting.eq",
    gte: "dashboard.recommendations.factor.years_since_quitting.gte",
    lte: "dashboard.recommendations.factor.years_since_quitting.lte",
  },
  family_history_crc_first_degree: {
    kind: "boolean",
    true: "dashboard.recommendations.factor.family_history_crc_first_degree",
  },
  family_history_breast_ovarian: {
    kind: "boolean",
    true: "dashboard.recommendations.factor.family_history_breast_ovarian",
  },
  occupational_carcinogen_exposure: {
    kind: "boolean",
    true: "dashboard.recommendations.factor.occupational_carcinogen_exposure",
  },
  bmi: {
    kind: "number",
    eq: "dashboard.recommendations.factor.bmi.eq",
    gte: "dashboard.recommendations.factor.bmi.gte",
    lte: "dashboard.recommendations.factor.bmi.lte",
  },
  hypertension: { kind: "boolean", true: "dashboard.recommendations.factor.hypertension" },
  dyslipidemia: { kind: "boolean", true: "dashboard.recommendations.factor.dyslipidemia" },
  diabetes: { kind: "boolean", true: "dashboard.recommendations.factor.diabetes" },
  cardiovascular_disease: { kind: "boolean", true: "dashboard.recommendations.factor.cardiovascular_disease" },
  fatty_liver: { kind: "boolean", true: "dashboard.recommendations.factor.fatty_liver" },
  hiv_or_immunosuppression: { kind: "boolean", true: "dashboard.recommendations.factor.hiv_or_immunosuppression" },
  pregnancy: { kind: "boolean", true: "dashboard.recommendations.factor.pregnancy" },
  prior_cancer: { kind: "boolean", true: "dashboard.recommendations.factor.prior_cancer" },
  hysterectomy: { kind: "boolean", true: "dashboard.recommendations.factor.hysterectomy" },
  questionnaire_flags_risk: { kind: "boolean", true: "dashboard.recommendations.factor.questionnaire_flags_risk" },
} as const satisfies { [F in FactorId]: WordingByKind[(typeof FACTORS)[F]["kind"]] };

const SEX_RULE_KEYS = {
  female: "dashboard.recommendations.rule.sex.female",
  male: "dashboard.recommendations.rule.sex.male",
} as const satisfies Record<Sex, MessageKey>;

const INTERVAL_KIND_KEYS = {
  no_known_interval: "dashboard.recommendations.interval.no_known_interval",
  shared_decision: "dashboard.recommendations.interval.shared_decision",
  per_program: "dashboard.recommendations.interval.per_program",
} as const satisfies Record<Exclude<Interval["kind"], "months">, MessageKey>;

function listFormat(locale: Locale, type: "conjunction" | "disjunction", items: string[]): string {
  return new Intl.ListFormat(locale, { style: "long", type }).format(items);
}

/** One condition in words, e.g. "pack-years ≥ 20". */
export function describeCondition(condition: Condition, t: Translate, locale: Locale): string {
  const wording: FactorWording = FACTOR_WORDING[condition.factor];
  const { op, value } = condition;
  switch (wording.kind) {
    case "boolean": {
      const phrase = t(wording.true);
      return value === false ? t("dashboard.recommendations.factor.negation", { condition: phrase }) : phrase;
    }
    case "number": {
      // The schema allows only eq, gte and lte with a number for number factors.
      const numberOp = op === "in" ? "eq" : op;
      return t(wording[numberOp], {
        value: typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : "",
      });
    }
    case "enum": {
      const values = Array.isArray(value) ? value : [String(value)];
      const labels = values.map((v) => (Object.hasOwn(wording.labels, v) ? t(wording.labels[v]) : v));
      // The labels are the profile form's answers ("Tak, obecnie"); mid-sentence they read in lower case.
      return t(wording.key, { values: listFormat(locale, "disjunction", labels).toLocaleLowerCase(locale) });
    }
  }
}

/** A branch in words: sex, age range and conditions joined with "and", e.g. "women and age 45–74". */
export function describeBranch(branch: Branch, t: Translate, locale: Locale): string {
  const parts = [
    ...(branch.sex === undefined ? [] : [t(SEX_RULE_KEYS[branch.sex])]),
    branch.age_max === undefined
      ? t("dashboard.recommendations.rule.ageFrom", { min: branch.age_min })
      : t("dashboard.recommendations.rule.ageRange", { min: branch.age_min, max: branch.age_max }),
    ...branch.requires.map((condition) => describeCondition(condition, t, locale)),
  ];
  return listFormat(locale, "conjunction", parts);
}

/** How often, e.g. "every 2 years", "every 6 months" or a phrase for an interval that isn't fixed. */
export function describeInterval(interval: Interval, t: Translate): string {
  if (interval.kind !== "months") return t(INTERVAL_KIND_KEYS[interval.kind]);
  return interval.months % 12 === 0
    ? t.plural("dashboard.recommendations.interval.years", interval.months / 12)
    : t.plural("dashboard.recommendations.interval.months", interval.months);
}

/** The missing conditions of the unknown branches: each branch's joined with "and", the branches with "or". */
export function describeMissing(missing: Condition[][], t: Translate, locale: Locale): string {
  const branches = missing.map((conditions) =>
    listFormat(
      locale,
      "conjunction",
      conditions.map((condition) => describeCondition(condition, t, locale)),
    ),
  );
  return listFormat(locale, "disjunction", branches);
}
