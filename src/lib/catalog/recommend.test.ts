import { describe, expect, it } from "vitest";

import type { Branch, CatalogEntry, Condition, IntervalOverride } from "@/lib/catalog/schema";
import { evaluateBranch, recommend, resolveInterval } from "@/lib/catalog/recommend";
import type { Profile } from "@/lib/profile";

const YEAR = 2026;

/** A never-smoking woman aged 50 in `YEAR`, with every nullable column null. */
function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    birth_year: YEAR - 50,
    sex: "female",
    smoking_status: "never",
    packs_per_day: null,
    smoking_years: null,
    pack_years: null,
    years_since_quitting: null,
    reminders_enabled: false,
    reminders_enabled_at: null,
    reminders_locale: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** A profile of the given age in `YEAR`. */
function aged(age: number, overrides: Partial<Profile> = {}): Profile {
  return profile({ birth_year: YEAR - age, ...overrides });
}

/** An active, reviewed, fixed 12-month entry that matches everyone; override what a test cares about. */
function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: "test-entry",
    status: "active",
    name_pl: "Badanie",
    name_en: "Exam",
    summary_pl: "Opis",
    summary_en: "Summary",
    how_to_access_pl: "Jak",
    how_to_access_en: "How",
    eligibility: [{ age_min: 0, requires: [] }],
    interval_kind: "fixed",
    interval_months: 12,
    interval_overrides: [],
    evidence_level: 3,
    evidence_source: "NFZ program",
    burden_weight: 3,
    nfz_funded: true,
    referral_required: false,
    sources: [
      {
        url: "https://example.com/source",
        title: "Source",
        publisher: "Publisher",
        quote: "Quote",
        accessed: "2026-01-01",
      },
    ],
    reviewed_by: "owner (non-medical review)",
    last_reviewed: "2026-01-01",
    ...overrides,
  };
}

const smoking = (value: string | string[], op: Condition["op"] = "eq"): Condition => ({
  factor: "smoking_status",
  op,
  value,
});
const packYears = (value: number): Condition => ({ factor: "pack_years", op: "gte", value });
const quitWithin = (value: number): Condition => ({ factor: "years_since_quitting", op: "lte", value });
const hypertension: Condition = { factor: "hypertension", op: "eq", value: true };
const crcFamilyHistory: Condition = { factor: "family_history_crc_first_degree", op: "eq", value: true };
const bmiOver25: Condition = { factor: "bmi", op: "gte", value: 25 };
const immunosuppressed: Condition = { factor: "hiv_or_immunosuppression", op: "eq", value: true };

/** Evaluates a branch against a profile, deriving the age the way `recommend` does. */
function evaluate(branch: Branch, p: Profile) {
  return evaluateBranch(branch, p, YEAR - p.birth_year);
}

describe("evaluateBranch", () => {
  describe("age bounds", () => {
    const branch: Branch = { age_min: 50, age_max: 69, requires: [] };

    it.each([
      { age: 50, expected: "match" },
      { age: 49, expected: "no" },
      { age: 69, expected: "match" },
      { age: 70, expected: "no" },
    ])("age $age → $expected (bounds are inclusive)", ({ age, expected }) => {
      expect(evaluate(branch, aged(age))).toBe(expected);
    });

    it("treats a missing age_max as no upper bound", () => {
      expect(evaluate({ age_min: 50, requires: [] }, aged(100))).toBe("match");
    });
  });

  describe("sex", () => {
    it("requires the profile's sex to equal the branch's", () => {
      const branch: Branch = { sex: "male", age_min: 0, requires: [] };
      expect(evaluate(branch, profile({ sex: "male" }))).toBe("match");
      expect(evaluate(branch, profile({ sex: "female" }))).toBe("no");
    });
  });

  describe("null profile values", () => {
    const branch: Branch = { age_min: 0, requires: [packYears(20)] };

    it.each([
      { packYears: null, expected: "no" },
      { packYears: 20, expected: "match" },
      { packYears: 19, expected: "no" },
    ])("pack_years $packYears → $expected (gte is inclusive, null is false)", ({ packYears, expected }) => {
      expect(evaluate(branch, profile({ smoking_status: "current", pack_years: packYears }))).toBe(expected);
    });
  });

  describe("lte", () => {
    const branch: Branch = { age_min: 0, requires: [quitWithin(15)] };

    it.each([
      { years: 15, expected: "match" },
      { years: 16, expected: "no" },
      { years: null, expected: "no" },
    ])("years_since_quitting $years → $expected (lte is inclusive, null is false)", ({ years, expected }) => {
      expect(evaluate(branch, profile({ smoking_status: "former", years_since_quitting: years }))).toBe(expected);
    });
  });

  describe("false beats unknown", () => {
    const branch: Branch = { age_min: 0, requires: [smoking("current"), hypertension] };

    it("is no when a collected condition fails, even with an uncollected one", () => {
      expect(evaluate(branch, profile({ smoking_status: "never" }))).toBe("no");
    });

    it("is unknown when every collected condition holds and one is uncollected", () => {
      expect(evaluate(branch, profile({ smoking_status: "current" }))).toBe("unknown");
    });

    it("is no when the sex fails, even with an uncollected condition", () => {
      const maleBranch: Branch = { sex: "male", age_min: 0, requires: [hypertension] };
      expect(evaluate(maleBranch, profile({ sex: "female" }))).toBe("no");
    });
  });

  describe("in on smoking_status", () => {
    const branch: Branch = { age_min: 0, requires: [smoking(["current", "former"], "in")] };

    it.each([
      { status: "current", expected: "match" },
      { status: "former", expected: "match" },
      { status: "never", expected: "no" },
    ])("$status → $expected", ({ status, expected }) => {
      expect(evaluate(branch, profile({ smoking_status: status }))).toBe(expected);
    });
  });
});

describe("resolveInterval", () => {
  const overrides: IntervalOverride[] = [
    { when: { requires: [immunosuppressed] }, months: 12 },
    { when: { age_min: 40 }, months: 24 },
    { when: { age_min: 30 }, months: 36 },
  ];
  const fixed = entry({ interval_kind: "fixed", interval_months: 60, interval_overrides: overrides });

  it.each([
    { age: 45, months: 24 },
    { age: 35, months: 36 },
    { age: 25, months: 60 },
  ])("age $age → every $months months (first matching override, unknown ones skipped)", ({ age, months }) => {
    expect(resolveInterval(fixed, aged(age), age)).toEqual({ kind: "months", months });
  });

  it.each(["shared_decision", "no_known_interval", "per_program"] as const)("returns only the kind for %s", (kind) => {
    const nonFixed = entry({ interval_kind: kind, interval_months: null, interval_overrides: [] });
    expect(resolveInterval(nonFixed, profile(), 50)).toEqual({ kind });
  });
});

describe("recommend", () => {
  const slugs = (list: { entry: CatalogEntry }[]) => list.map((r) => r.entry.slug);

  it("computes the age from the current year and the birth year", () => {
    expect(recommend([], profile({ birth_year: 1980 }), YEAR, "pl").age).toBe(46);
  });

  describe("tier mapping", () => {
    it("maps evidence level 3, 2 and 1 to tier 1, 2 and 3", () => {
      const entries = [
        entry({ slug: "level-1", evidence_level: 1 }),
        entry({ slug: "level-2", evidence_level: 2 }),
        entry({ slug: "level-3", evidence_level: 3 }),
      ];
      const { tiers, maybe } = recommend(entries, profile(), YEAR, "pl");

      expect(slugs(tiers[1])).toEqual(["level-3"]);
      expect(slugs(tiers[2])).toEqual(["level-2"]);
      expect(slugs(tiers[3])).toEqual(["level-1"]);
      expect(maybe).toEqual([]);
      for (const tier of [1, 2, 3] as const) {
        expect(tiers[tier].map((r) => r.tier)).toEqual([tier]);
      }
    });

    it("carries the resolved interval", () => {
      const { tiers } = recommend([entry({ interval_months: 36 })], profile(), YEAR, "pl");
      expect(tiers[1].map((r) => r.interval)).toEqual([{ kind: "months", months: 36 }]);
    });
  });

  describe("sort order within a tier", () => {
    it("puts the higher burden weight first regardless of name", () => {
      const entries = [
        entry({ slug: "low", name_pl: "Aaa", name_en: "Aaa", burden_weight: 2 }),
        entry({ slug: "high", name_pl: "Zzz", name_en: "Zzz", burden_weight: 5 }),
      ];
      expect(slugs(recommend(entries, profile(), YEAR, "pl").tiers[1])).toEqual(["high", "low"]);
    });

    it("breaks a tie with the Polish collation, where Ś sorts after S", () => {
      const entries = [
        entry({ slug: "z", name_pl: "Zebra" }),
        entry({ slug: "sr", name_pl: "Śruba" }),
        entry({ slug: "sz", name_pl: "Szafa" }),
      ];
      const names = recommend(entries, profile(), YEAR, "pl").tiers[1].map((r) => r.entry.name_pl);
      expect(names).toEqual(["Szafa", "Śruba", "Zebra"]);
    });

    it("breaks a tie by name_en for the en locale and by name_pl for pl", () => {
      const entries = [
        entry({ slug: "first-in-pl", name_pl: "Abc", name_en: "Zzz" }),
        entry({ slug: "first-in-en", name_pl: "Bcd", name_en: "Aaa" }),
      ];
      expect(slugs(recommend(entries, profile(), YEAR, "en").tiers[1])).toEqual(["first-in-en", "first-in-pl"]);
      expect(slugs(recommend(entries, profile(), YEAR, "pl").tiers[1])).toEqual(["first-in-pl", "first-in-en"]);
    });

    it("sorts maybe by burden weight, then by name in the locale", () => {
      const unknown = [{ age_min: 0, requires: [hypertension] }];
      const entries = [
        entry({ slug: "low", name_pl: "Aaa", name_en: "Aaa", burden_weight: 2, eligibility: unknown }),
        entry({ slug: "high", name_pl: "Zzz", name_en: "Zzz", burden_weight: 5, eligibility: unknown }),
        entry({ slug: "tie-b", name_pl: "Bcd", name_en: "Aaa", burden_weight: 2, eligibility: unknown }),
        entry({ slug: "tie-a", name_pl: "Abc", name_en: "Zzz", burden_weight: 2, eligibility: unknown }),
      ];
      expect(slugs(recommend(entries, profile(), YEAR, "pl").maybe)).toEqual(["high", "low", "tie-a", "tie-b"]);
      expect(slugs(recommend(entries, profile(), YEAR, "en").maybe)).toEqual(["high", "low", "tie-b", "tie-a"]);
    });
  });

  describe("launch gate", () => {
    it("skips drafts, retired entries and active entries without a reviewer", () => {
      const entries = [
        entry({ slug: "draft", status: "draft" }),
        entry({ slug: "retired", status: "retired" }),
        entry({ slug: "reviewer-null", reviewed_by: null }),
        entry({ slug: "reviewer-omitted", reviewed_by: undefined }),
        entry({ slug: "unknown-draft", status: "draft", eligibility: [{ age_min: 0, requires: [hypertension] }] }),
        entry({ slug: "shown" }),
      ];
      const { tiers, maybe } = recommend(entries, profile(), YEAR, "pl");

      expect(slugs(Object.values(tiers).flat())).toEqual(["shown"]);
      expect(maybe).toEqual([]);
    });

    it("shows an active reviewed entry in maybe as well", () => {
      const unknown = [{ age_min: 0, requires: [hypertension] }];
      const entries = [
        entry({ slug: "shown", eligibility: unknown }),
        entry({ slug: "unreviewed", eligibility: unknown, reviewed_by: null }),
      ];
      expect(slugs(recommend(entries, profile(), YEAR, "pl").maybe)).toEqual(["shown"]);
    });
  });

  describe("maybe and missing", () => {
    it("lists only the uncollected conditions of the unknown branches, and no tier", () => {
      const branchA: Branch = { age_min: 50, requires: [crcFamilyHistory, smoking("current")] };
      const branchB: Branch = { age_min: 40, age_max: 49, requires: [bmiOver25] };
      const branchC: Branch = { sex: "male", age_min: 40, requires: [hypertension] };
      const multi = entry({ eligibility: [branchA, branchB, branchC] });

      const { tiers, maybe } = recommend([multi], aged(55, { smoking_status: "current" }), YEAR, "pl");

      expect(Object.values(tiers).flat()).toEqual([]);
      expect(maybe).toEqual([{ entry: multi, missing: [[crcFamilyHistory]] }]);
    });
  });

  describe("matched branch", () => {
    it("is the first matching branch in document order", () => {
      const first: Branch = { age_min: 40, requires: [] };
      const second: Branch = { age_min: 0, requires: [] };
      const { tiers } = recommend([entry({ eligibility: [first, second] })], profile(), YEAR, "pl");

      expect(tiers[1]).toHaveLength(1);
      expect(tiers[1][0].matchedBranch).toBe(first);
    });

    it("puts an entry with a matching and an unknown branch in a tier, not in maybe", () => {
      const unknown: Branch = { age_min: 0, requires: [hypertension] };
      const matching: Branch = { age_min: 0, requires: [] };
      const { tiers, maybe } = recommend([entry({ eligibility: [unknown, matching] })], profile(), YEAR, "pl");

      expect(tiers[1]).toHaveLength(1);
      expect(tiers[1][0].matchedBranch).toBe(matching);
      expect(maybe).toEqual([]);
    });
  });
});
