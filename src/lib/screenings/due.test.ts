import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyEntries, recommend, type RuleProfile } from "@/lib/catalog/recommend";
import type { CatalogEntry } from "@/lib/catalog/schema";
import { dueScreeningItems, type DueCandidate } from "@/lib/screenings/due";

// "Now" is 2027-03-10 in Warsaw, so the current month is 2027-03-01 and a 50-year-old was born in 1977.
const NOW = new Date("2027-03-10T09:00:00Z");

/** A never-smoking woman aged 50 in 2027. */
function profile(overrides: Partial<RuleProfile> = {}): RuleProfile {
  return {
    birth_year: 1977,
    sex: "female",
    smoking_status: "never",
    pack_years: null,
    years_since_quitting: null,
    ...overrides,
  };
}

/** An active, reviewed, fixed 12-month entry that matches adults; override what a test cares about. */
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
    eligibility: [{ age_min: 18, requires: [] }],
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

function candidate(completions: [slug: string, anchor: string][], overrides: Partial<RuleProfile> = {}): DueCandidate {
  return {
    profile: profile(overrides),
    completions: completions.map(([catalog_slug, anchor_month]) => ({ catalog_slug, anchor_month })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dueScreeningItems", () => {
  it("gives one item with the anchor and due month when a confirmed exam's interval has elapsed", () => {
    const items = dueScreeningItems(candidate([["test-entry", "2026-03-01"]]), [entry()], NOW);
    expect(items).toEqual([{ slug: "test-entry", anchorMonth: "2026-03-01", dueMonth: "2027-03-01" }]);
  });

  it("gives an item once the due month is long past", () => {
    const items = dueScreeningItems(candidate([["test-entry", "2024-01-01"]]), [entry()], NOW);
    expect(items).toEqual([{ slug: "test-entry", anchorMonth: "2024-01-01", dueMonth: "2025-01-01" }]);
  });

  it("gives none in the month before the due month", () => {
    expect(dueScreeningItems(candidate([["test-entry", "2026-04-01"]]), [entry()], NOW)).toEqual([]);
  });

  it("gives none for an entry without a fixed interval", () => {
    const shared = entry({ interval_kind: "shared_decision", interval_months: null });
    expect(dueScreeningItems(candidate([["test-entry", "2020-01-01"]]), [shared], NOW)).toEqual([]);
  });

  it("gives none for a user who has aged out of eligibility", () => {
    const young = entry({ eligibility: [{ age_min: 18, age_max: 49, requires: [] }] });
    expect(dueScreeningItems(candidate([["test-entry", "2025-01-01"]]), [young], NOW)).toEqual([]);
  });

  it("gives none for an exam that only may apply (an uncollected factor)", () => {
    const maybe = entry({
      eligibility: [{ age_min: 18, requires: [{ factor: "hypertension", op: "eq", value: true }] }],
    });
    expect(classifyEntries([maybe], profile(), 2027).maybe).toHaveLength(1);
    expect(dueScreeningItems(candidate([["test-entry", "2025-01-01"]]), [maybe], NOW)).toEqual([]);
  });

  it("applies an age override: blood pressure at 40+ repeats every 12 months, not 36", () => {
    const bloodPressure = entry({
      slug: "blood-pressure",
      interval_months: 36,
      interval_overrides: [{ when: { age_min: 40, requires: [] }, months: 12 }],
    });
    const fifty = candidate([["blood-pressure", "2026-03-01"]]);
    expect(dueScreeningItems(fifty, [bloodPressure], NOW)).toEqual([
      { slug: "blood-pressure", anchorMonth: "2026-03-01", dueMonth: "2027-03-01" },
    ]);
    const thirty = candidate([["blood-pressure", "2026-03-01"]], { birth_year: 1997 });
    expect(dueScreeningItems(thirty, [bloodPressure], NOW)).toEqual([]);
  });

  it("uses the SQL anchor as given", () => {
    const [item] = dueScreeningItems(candidate([["test-entry", "2025-07-01"]]), [entry()], NOW);
    expect(item.anchorMonth).toBe("2025-07-01");
    expect(item.dueMonth).toBe("2026-07-01");
  });

  it("gives none for a completion whose entry is missing", () => {
    expect(dueScreeningItems(candidate([["gone", "2020-01-01"]]), [entry()], NOW)).toEqual([]);
  });

  it("sorts several items by slug", () => {
    const entries = [entry({ slug: "b-exam" }), entry({ slug: "a-exam", evidence_level: 1 })];
    const items = dueScreeningItems(
      candidate([
        ["b-exam", "2026-01-01"],
        ["a-exam", "2026-02-01"],
      ]),
      entries,
      NOW,
    );
    expect(items.map((item) => item.slug)).toEqual(["a-exam", "b-exam"]);
  });

  it("never builds an Intl.Collator", () => {
    const spy = vi.spyOn(Intl, "Collator");
    dueScreeningItems(candidate([["test-entry", "2026-03-01"]]), [entry()], NOW);
    expect(spy).not.toHaveBeenCalled();
    // The spy sees the display path, so a green result above is not a blind spy.
    recommend([entry()], profile(), 2027, "pl");
    expect(spy).toHaveBeenCalled();
  });

  describe("at the New Year boundary", () => {
    // Born 1977: 50 in 2027 (Warsaw year), 49 in 2026. The entry starts at 50.
    const fifty = entry({ eligibility: [{ age_min: 50, requires: [] }] });
    const due = candidate([["test-entry", "2025-01-01"]]);

    it("counts 2026-12-31T23:30Z as Warsaw year 2027 for eligibility", () => {
      expect(dueScreeningItems(due, [fifty], new Date("2026-12-31T23:30:00Z"))).toEqual([
        { slug: "test-entry", anchorMonth: "2025-01-01", dueMonth: "2026-01-01" },
      ]);
    });

    it("still counts 2026-12-31T22:30Z as Warsaw year 2026", () => {
      expect(dueScreeningItems(due, [fifty], new Date("2026-12-31T22:30:00Z"))).toEqual([]);
    });
  });
});

describe("classifyEntries", () => {
  it("gives the same tier and maybe membership as recommend; only the order differs", () => {
    const entries = [
      entry({ slug: "t1-low", evidence_level: 3, burden_weight: 1, name_en: "B" }),
      entry({ slug: "t1-high", evidence_level: 3, burden_weight: 5, name_en: "A" }),
      entry({ slug: "t2", evidence_level: 2 }),
      entry({ slug: "t3", evidence_level: 1 }),
      entry({
        slug: "maybe",
        eligibility: [{ age_min: 18, requires: [{ factor: "bmi", op: "gte", value: 25 }] }],
      }),
      entry({ slug: "not-eligible", eligibility: [{ age_min: 90, requires: [] }] }),
    ];
    const core = classifyEntries(entries, profile(), 2027);
    const display = recommend(entries, profile(), 2027, "en");

    for (const tier of [1, 2, 3] as const) {
      const slugs = (list: { entry: CatalogEntry }[]) => list.map(({ entry }) => entry.slug).sort();
      expect(slugs(core.tiers[tier])).toEqual(slugs(display.tiers[tier]));
    }
    expect(core.maybe.map(({ entry }) => entry.slug)).toEqual(["maybe"]);
    expect(core.age).toBe(display.age);
    // The display sort puts the heavier entry first; the core keeps catalog order.
    expect(core.tiers[1].map(({ entry }) => entry.slug)).toEqual(["t1-low", "t1-high"]);
    expect(display.tiers[1].map(({ entry }) => entry.slug)).toEqual(["t1-high", "t1-low"]);
  });
});
