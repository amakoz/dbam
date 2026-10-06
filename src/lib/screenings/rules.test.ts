import { describe, expect, it } from "vitest";

import type { Interval, Recommendation, Recommendations } from "@/lib/catalog/recommend";
import type { CatalogEntry } from "@/lib/catalog/schema";
import type { Profile } from "@/lib/profile";
import {
  addMonths,
  addYears,
  anchorMonth,
  nextDueMonth,
  parseDoneForm,
  parsePlanForm,
  partitionDashboard,
  warsawMonth,
  warsawToday,
  type ScreeningCompletion,
  type ScreeningPlan,
} from "@/lib/screenings/rules";

/** A never-smoking woman born in 1976, with every nullable column null. */
function profile(): Profile {
  return {
    user_id: "00000000-0000-0000-0000-000000000001",
    birth_year: 1976,
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
  };
}

/** An active, reviewed, fixed 24-month entry that matches everyone; override what a test cares about. */
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
    interval_months: 24,
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

function plan(slug: string, appointment_date: string | null, created_at = "2026-01-01T00:00:00Z"): ScreeningPlan {
  return {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    catalog_slug: slug,
    appointment_date,
    created_at,
    updated_at: created_at,
  };
}

function done(slug: string, last_done_month: string | null, updated_at = "2026-01-01T00:00:00Z"): ScreeningCompletion {
  return {
    id: 1,
    user_id: "00000000-0000-0000-0000-000000000001",
    catalog_slug: slug,
    last_done_month,
    last_done_on: null,
    created_at: updated_at,
    updated_at,
  };
}

/** Recommendations with `tier1Entries` in tier 1 (with their fixed interval), plus the optional `maybe` and `age`. */
function recs(
  tier1Entries: CatalogEntry[],
  { maybe = [], age = 50 }: { maybe?: CatalogEntry[]; age?: number } = {},
): Recommendations {
  const tier1: Recommendation[] = tier1Entries.map((e) => {
    const interval: Interval =
      e.interval_kind === "fixed" && typeof e.interval_months === "number"
        ? { kind: "months", months: e.interval_months }
        : { kind: "no_known_interval" };
    return { entry: e, tier: 1, matchedBranch: e.eligibility[0], interval };
  });
  return {
    tiers: { 1: tier1, 2: [], 3: [] },
    maybe: maybe.map((e) => ({ entry: e, missing: [] })),
    age,
  };
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("warsawToday and warsawMonth", () => {
  it.each([
    { now: "2026-09-30T21:59:59Z", expected: "2026-09-30", note: "just before CEST midnight" },
    { now: "2026-09-30T22:00:00Z", expected: "2026-10-01", note: "CEST midnight" },
    { now: "2026-09-30T23:30:00Z", expected: "2026-10-01", note: "late UTC evening is already Warsaw tomorrow" },
    { now: "2026-12-31T22:59:59Z", expected: "2026-12-31", note: "just before CET midnight" },
    { now: "2026-12-31T23:00:00Z", expected: "2027-01-01", note: "CET midnight, year rolls over" },
    { now: "2026-03-29T21:59:59Z", expected: "2026-03-29", note: "before the first midnight after spring DST" },
    { now: "2026-03-29T22:00:00Z", expected: "2026-03-30", note: "first midnight after spring DST (now CEST)" },
    { now: "2026-10-25T22:59:59Z", expected: "2026-10-25", note: "before the first midnight after autumn DST" },
    { now: "2026-10-25T23:00:00Z", expected: "2026-10-26", note: "first midnight after autumn DST (now CET)" },
  ])("warsawToday($now) → $expected ($note)", ({ now, expected }) => {
    expect(warsawToday(new Date(now))).toBe(expected);
  });

  it("warsawMonth is the first day of the Warsaw month", () => {
    expect(warsawMonth(new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
    expect(warsawMonth(new Date("2026-10-06T10:00:00Z"))).toBe("2026-10-01");
  });
});

describe("addYears", () => {
  it.each([
    { day: "2024-02-29", n: 2, expected: "2026-03-01" },
    { day: "2024-02-29", n: 4, expected: "2028-02-29" },
  ])("addYears($day, $n) → $expected (Feb 29 rolls to Mar 1 in a non-leap year)", ({ day, n, expected }) => {
    expect(addYears(day, n)).toBe(expected);
  });
});

describe("addMonths", () => {
  it.each([
    { month: "2024-03-01", n: 24, expected: "2026-03-01" },
    { month: "2026-11-15", n: 2, expected: "2027-01-01" },
    { month: "2026-01-01", n: -1, expected: "2025-12-01" },
  ])("addMonths($month, $n) → $expected (the day is ignored, the year rolls over)", ({ month, n, expected }) => {
    expect(addMonths(month, n)).toBe(expected);
  });
});

describe("parsePlanForm", () => {
  const today = "2026-10-06";
  const parse = (fields: Record<string, string>, on = today) =>
    parsePlanForm(form({ slug: "mammography", ...fields }), on);
  const invalidDate = { ok: false, error: "errors.invalid_appointment_date" };

  it.each([
    { date: "2026-10-05", ok: false, note: "yesterday" },
    { date: "2026-10-06", ok: true, note: "today (inclusive)" },
    { date: "2028-10-06", ok: true, note: "two years ahead (inclusive)" },
    { date: "2028-10-07", ok: false, note: "one day past two years" },
  ])("appointment date $date → ok: $ok ($note)", ({ date, ok }) => {
    const result = parse({ appointment_date: date });
    expect(result.ok).toBe(ok);
    if (ok) expect(result).toEqual({ ok: true, value: { slug: "mammography", appointment_date: date } });
    else expect(result).toEqual(invalidDate);
  });

  it("treats a blank date as planned with no date", () => {
    expect(parse({ appointment_date: "" })).toEqual({
      ok: true,
      value: { slug: "mammography", appointment_date: null },
    });
    expect(parse({ appointment_date: "   " })).toEqual({
      ok: true,
      value: { slug: "mammography", appointment_date: null },
    });
  });

  it("trims the date before validating", () => {
    expect(parse({ appointment_date: " 2026-10-07 " })).toEqual({
      ok: true,
      value: { slug: "mammography", appointment_date: "2026-10-07" },
    });
  });

  it.each(["2026-02-30", "2026-13-01"])("rejects the impossible date %s", (date) => {
    expect(parse({ appointment_date: date })).toEqual(invalidDate);
  });

  it("rejects a malformed or missing slug", () => {
    const invalidRequest = { ok: false, error: "errors.invalid_request" };
    expect(parse({ slug: "Mammo!", appointment_date: "2026-10-07" })).toEqual(invalidRequest);
    expect(parsePlanForm(form({ appointment_date: "2026-10-07" }), today)).toEqual(invalidRequest);
  });

  it("allows up to Mar 1 and rejects Mar 2 when today is Feb 29 (the leap-day upper bound)", () => {
    expect(parse({ appointment_date: "2026-03-01" }, "2024-02-29").ok).toBe(true);
    expect(parse({ appointment_date: "2026-03-02" }, "2024-02-29")).toEqual(invalidDate);
  });
});

describe("parseDoneForm", () => {
  const currentMonth = "2026-10-01";
  const birthYear = 1970;
  const parse = (fields: Record<string, string>) =>
    parseDoneForm(form({ slug: "mammography", ...fields }), currentMonth, birthYear);
  const invalidDone = { ok: false, error: "errors.invalid_done_date" };
  const okMonth = (last_done_month: string | null) => ({ ok: true, value: { slug: "mammography", last_done_month } });

  it("treats both fields blank as unknown", () => {
    expect(parse({ done_month: "", done_year: "" })).toEqual(okMonth(null));
    expect(parse({})).toEqual(okMonth(null));
  });

  it.each([
    { done_month: "3", done_year: "" },
    { done_month: "", done_year: "2024" },
  ])("rejects a half-filled date ($done_month / $done_year)", (fields) => {
    expect(parse(fields)).toEqual(invalidDone);
  });

  it.each(["3", "03"])("accepts month %s of 2024 as 2024-03-01", (done_month) => {
    expect(parse({ done_month, done_year: "2024" })).toEqual(okMonth("2024-03-01"));
  });

  it.each([
    { done_month: "0", done_year: "2024" },
    { done_month: "13", done_year: "2024" },
    { done_month: "123", done_year: "2024" },
    { done_month: "3", done_year: "24" },
  ])("rejects month $done_month / year $done_year", (fields) => {
    expect(parse(fields)).toEqual(invalidDone);
  });

  it("includes the current month and rejects the next one", () => {
    expect(parse({ done_month: "10", done_year: "2026" })).toEqual(okMonth("2026-10-01"));
    expect(parse({ done_month: "11", done_year: "2026" })).toEqual(invalidDone);
  });

  it("includes January of the birth year and rejects December before it", () => {
    expect(parse({ done_month: "1", done_year: "1970" })).toEqual(okMonth("1970-01-01"));
    expect(parse({ done_month: "12", done_year: "1969" })).toEqual(invalidDone);
  });

  it("rejects a malformed slug", () => {
    expect(parse({ slug: "Bad Slug", done_month: "3", done_year: "2024" })).toEqual({
      ok: false,
      error: "errors.invalid_request",
    });
  });
});

describe("anchorMonth", () => {
  it("anchors a blank done date on the Warsaw month of updated_at, not the UTC month", () => {
    expect(anchorMonth({ last_done_month: null, updated_at: "2026-09-30T23:30:00+00:00" })).toBe("2026-10-01");
  });

  it("prefers a set last_done_month over updated_at", () => {
    expect(anchorMonth({ last_done_month: "2024-03-01", updated_at: "2026-09-30T23:30:00+00:00" })).toBe("2024-03-01");
  });
});

describe("nextDueMonth", () => {
  it("adds the interval to the last done month", () => {
    expect(
      nextDueMonth(
        { last_done_month: "2024-03-01", updated_at: "2026-01-01T00:00:00Z" },
        { kind: "months", months: 24 },
      ),
    ).toBe("2026-03-01");
  });

  it("counts a blank done date from the Warsaw month of updated_at", () => {
    expect(
      nextDueMonth({ last_done_month: null, updated_at: "2026-09-30T23:30:00+00:00" }, { kind: "months", months: 12 }),
    ).toBe("2027-10-01");
  });

  it.each(["no_known_interval", "shared_decision", "per_program"] as const)("is null for %s", (kind) => {
    expect(nextDueMonth({ last_done_month: "2024-03-01", updated_at: "2026-01-01T00:00:00Z" }, { kind })).toBeNull();
  });
});

describe("partitionDashboard", () => {
  const now = new Date("2026-10-06T10:00:00Z");
  const exam = entry({ slug: "exam" });
  const slugsOf = (list: { entry: CatalogEntry }[]) => list.map((item) => item.entry.slug);

  it("lets a plan beat a completion: the exam shows in plans only", () => {
    const result = partitionDashboard(
      recs([exam]),
      [plan("exam", "2026-11-01")],
      [done("exam", "2025-10-01")],
      [exam],
      profile(),
      now,
    );
    expect(slugsOf(result.plans)).toEqual(["exam"]);
    expect(result.done).toEqual([]);
    expect(result.tiers[1]).toEqual([]);
    expect(result.lastDone.size).toBe(0);
  });

  it("keeps a not-yet-due completion in done and hides it from its tier and from maybe", () => {
    const result = partitionDashboard(
      recs([exam], { maybe: [exam] }),
      [],
      [done("exam", "2025-10-01")],
      [exam],
      profile(),
      now,
    );
    expect(result.done).toHaveLength(1);
    expect(result.done[0].entry.slug).toBe("exam");
    expect(result.done[0].nextDue).toBe("2027-10-01");
    expect(result.tiers[1]).toEqual([]);
    expect(result.maybe).toEqual([]);
  });

  it("treats an exam as due again when its next due month is the current month", () => {
    const completion = done("exam", "2024-10-01");
    const result = partitionDashboard(recs([exam]), [], [completion], [exam], profile(), now);
    expect(result.done).toEqual([]);
    expect(slugsOf(result.tiers[1])).toEqual(["exam"]);
    expect(result.lastDone.get("exam")).toBe(completion);
  });

  it("flips from done to due again at Warsaw midnight, not UTC midnight", () => {
    const completion = done("exam", "2024-03-01");
    const partition = (at: string) =>
      partitionDashboard(recs([exam]), [], [completion], [exam], profile(), new Date(at));

    const before = partition("2026-02-28T22:59:59Z");
    expect(before.done).toHaveLength(1);
    expect(before.done[0].nextDue).toBe("2026-03-01");
    expect(before.tiers[1]).toEqual([]);

    const after = partition("2026-02-28T23:00:00Z");
    expect(after.done).toEqual([]);
    expect(slugsOf(after.tiers[1])).toEqual(["exam"]);
    expect(after.lastDone.get("exam")).toBe(completion);
  });

  it("keeps a no-interval completion in done with no next due, and out of the tiers", () => {
    const noInterval = entry({ slug: "no-interval", interval_kind: "no_known_interval", interval_months: null });
    const result = partitionDashboard(
      recs([noInterval]),
      [],
      [done("no-interval", "2000-01-01")],
      [noInterval],
      profile(),
      now,
    );
    expect(result.done).toHaveLength(1);
    expect(result.done[0].nextDue).toBeNull();
    expect(result.tiers[1]).toEqual([]);
  });

  describe("awaitingConfirmation", () => {
    const awaiting = (date: string | null, at = now) =>
      partitionDashboard(recs([exam]), [plan("exam", date)], [], [exam], profile(), at).plans[0].awaitingConfirmation;

    it.each([
      { date: "2026-10-05", expected: true, note: "yesterday" },
      { date: "2026-10-06", expected: true, note: "today" },
      { date: "2026-10-07", expected: false, note: "tomorrow" },
      { date: null, expected: false, note: "no date" },
    ])("appointment $date → $expected ($note)", ({ date, expected }) => {
      expect(awaiting(date)).toBe(expected);
    });

    it("uses the Warsaw day: 22:30 UTC on 5 October is already 6 October", () => {
      expect(awaiting("2026-10-06", new Date("2026-10-05T22:30:00Z"))).toBe(true);
    });
  });

  it("sorts plans by date, then created_at, then undated plans oldest first, whatever the input order", () => {
    const entries = ["undated-new", "later", "earlier", "undated-old", "same-late", "same-early"].map((slug) =>
      entry({ slug }),
    );
    const result = partitionDashboard(
      recs([]),
      [
        plan("undated-new", null, "2026-03-01T00:00:00Z"),
        plan("later", "2026-12-01"),
        plan("same-late", "2026-11-01", "2026-02-01T00:00:00Z"),
        plan("earlier", "2026-10-20"),
        plan("undated-old", null, "2026-01-01T00:00:00Z"),
        plan("same-early", "2026-11-01", "2026-01-15T00:00:00Z"),
      ],
      [],
      entries,
      profile(),
      now,
    );
    expect(result.plans.map(({ plan: p }) => p.catalog_slug)).toEqual([
      "earlier",
      "same-early",
      "same-late",
      "later",
      "undated-old",
      "undated-new",
    ]);
  });

  it("skips a plan or completion whose entry is missing, without hiding the tier item", () => {
    const result = partitionDashboard(
      recs([exam]),
      [plan("ghost", "2026-11-01")],
      [done("exam", "2025-10-01")],
      [],
      profile(),
      now,
    );
    expect(result.plans).toEqual([]);
    expect(result.done).toEqual([]);
    expect(slugsOf(result.tiers[1])).toEqual(["exam"]);
  });

  describe("interval by age", () => {
    const byAge = entry({
      slug: "by-age",
      interval_months: 36,
      interval_overrides: [{ when: { age_min: 40 }, months: 12 }],
    });
    const completion = done("by-age", "2025-09-01");

    it("uses the override when recommendations.age matches: due again, in its tier with lastDone", () => {
      const result = partitionDashboard(recs([byAge], { age: 45 }), [], [completion], [byAge], profile(), now);
      expect(result.done).toEqual([]);
      expect(slugsOf(result.tiers[1])).toEqual(["by-age"]);
      expect(result.lastDone.get("by-age")).toBe(completion);
    });

    it("uses the base interval below the override's age: still done, due 2028-09-01", () => {
      const result = partitionDashboard(recs([byAge], { age: 35 }), [], [completion], [byAge], profile(), now);
      expect(result.done).toHaveLength(1);
      expect(result.done[0].nextDue).toBe("2028-09-01");
      expect(result.tiers[1]).toEqual([]);
    });
  });
});
