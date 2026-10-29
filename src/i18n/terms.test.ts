import { describe, expect, it } from "vitest";

import type { MessageKey } from "@/i18n";
import { en } from "@/i18n/en";

// English copy says "screening" for a catalog item and "exam" for the user's own planned or done one
// (context/domain/glossary.md). The test checks the rule per key, not the exact wording. Polish has no such split.
const SCREENING = /\bscreenings?\b/i;
const EXAM = /\bexams?\b/i;
const TEST = /\btests?\b/i;

const PLURAL_SUFFIXES = ["one", "few", "many", "other"] as const;

/** Every plural suffix of a base key, e.g. `dashboard.status.plans` → `dashboard.status.plans_one`, … */
function plural<const Base extends string>(base: Base) {
  return PLURAL_SUFFIXES.map((suffix) => `${base}_${suffix}` as const);
}

// Catalog item: "screening" required, "exam" forbidden.
const CATALOG_ITEM_KEYS = [
  "home.title",
  "home.subtitle",
  "home.features.profile.description",
  "home.features.tiers.description",
  "home.note",
  ...plural("dashboard.status.open"),
  "dashboard.recommendations.disclaimer",
  "dashboard.recommendations.empty",
  "dashboard.recommendations.tier.3.note",
  "dashboard.recommendations.details.about",
  "dashboard.recommendations.factor.questionnaire_flags_risk",
  "dashboard.recommendations.maybe.intro",
  "dashboard.screenings.plans.empty",
  "dashboard.screenings.plan.legend",
  "onboarding.consent.intro",
  "onboarding.consent.purpose",
  "onboarding.consent.voluntary",
  "onboarding.consent.checkbox",
  "onboarding.profile.intro",
  "profile.intro",
  "profile.form.sexHint",
  "errors.screening_not_available",
] as const satisfies readonly MessageKey[];

// The user's own planned or done item: "exam" required, "screening" forbidden.
const OWN_ITEM_KEYS = [
  "home.features.track.description",
  ...plural("dashboard.status.plans"),
  "dashboard.screenings.unavailable.name",
  "dashboard.screenings.unavailable.note",
  "dashboard.screenings.confirm.prompt",
  "dashboard.screenings.done.monthLabel",
  "dashboard.screenings.done.noInterval",
  "dashboard.screenings.saved.undone",
  "onboarding.consent.data",
  "profile.withdraw.deleted",
  "profile.reminders.disclosure",
  "email.dueScreeningReminder.subject",
  ...plural("email.dueScreeningReminder.body"),
  "email.followUpNudge.subject",
  ...plural("email.followUpNudge.schedule"),
  "errors.invalid_done_date",
  "errors.appointment_not_passed",
] as const satisfies readonly MessageKey[];

describe("English term rule", () => {
  it.each(CATALOG_ITEM_KEYS)("%s says screening, not exam, for a catalog item", (key) => {
    expect(en[key]).toMatch(SCREENING);
    expect(en[key]).not.toMatch(EXAM);
  });

  it.each(OWN_ITEM_KEYS)("%s says exam, not screening, for the user's own item", (key) => {
    expect(en[key]).toMatch(EXAM);
    expect(en[key]).not.toMatch(SCREENING);
  });

  it("uses no message with test or tests", () => {
    const offenders = Object.entries(en).filter(([, value]) => TEST.test(value));
    expect(offenders).toEqual([]);
  });
});
