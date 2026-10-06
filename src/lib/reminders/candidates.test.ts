import { describe, expect, it } from "vitest";

import type { RuleEntry } from "@/lib/catalog/schema";
import { collectClaimItems, MAX_CLAIM_ITEMS, parseCandidateRows, type CandidateRow } from "@/lib/reminders/candidates";

// 2027-03-10 in Warsaw: a fixed 12-month entry last done in 2026-03 is due in 2027-03.
const NOW = new Date("2027-03-10T09:00:00Z");

function entry(slug: string): RuleEntry {
  return {
    slug,
    status: "active",
    eligibility: [{ age_min: 18, requires: [] }],
    interval_kind: "fixed",
    interval_months: 12,
    interval_overrides: [],
    evidence_level: 3,
    reviewed_by: "owner (non-medical review)",
  };
}

function row(user: number, slugs: string[], anchor = "2026-03-01"): CandidateRow {
  return {
    user_id: `00000000-0000-0000-0000-${String(user).padStart(12, "0")}`,
    birth_year: 1977,
    sex: "female",
    smoking_status: "never",
    pack_years: null,
    years_since_quitting: null,
    completions: slugs.map((catalog_slug) => ({ catalog_slug, anchor_month: anchor })),
  };
}

describe("parseCandidateRows", () => {
  it("accepts the RPC's rows, with null smoking fields", () => {
    expect(parseCandidateRows([row(1, ["a"])])).toEqual([row(1, ["a"])]);
  });

  it("throws a code-only error for a malformed row, without echoing it", () => {
    const leaky = { ...row(1, ["a"]), sex: "jan.kowalski@example.com" };
    try {
      parseCandidateRows([leaky]);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ name: "ReminderDatabaseError", step: "candidates", code: "invalid" });
      expect(JSON.stringify(error)).not.toContain("kowalski");
      expect((error as Error).message).not.toContain("kowalski");
    }
  });

  it("rejects an anchor that is not the first of a month", () => {
    expect(() => parseCandidateRows([row(1, ["a"], "2026-03-15")])).toThrow();
  });
});

describe("collectClaimItems", () => {
  const catalog = [entry("a"), entry("b")];

  it("collects one item per due completion, in candidate order", () => {
    const { items, users } = collectClaimItems([row(1, ["a", "b"]), row(2, ["a"])], catalog, NOW, 10);
    expect(users).toBe(2);
    expect(items.map((item) => [item.user_id.slice(-1), item.catalog_slug, item.due_month])).toEqual([
      ["1", "a", "2027-03-01"],
      ["1", "b", "2027-03-01"],
      ["2", "a", "2027-03-01"],
    ]);
    expect(items[0]).toEqual({
      user_id: "00000000-0000-0000-0000-000000000001",
      catalog_slug: "a",
      anchor_month: "2026-03-01",
      due_month: "2027-03-01",
    });
  });

  it("skips candidates with nothing due without spending budget", () => {
    const { items, users } = collectClaimItems([row(1, ["a"], "2026-12-01"), row(2, ["a"])], catalog, NOW, 1);
    expect(users).toBe(1);
    expect(items.map((item) => item.user_id.slice(-1))).toEqual(["2"]);
  });

  it("stops at the budget, counted in users", () => {
    const { items, users } = collectClaimItems([row(1, ["a", "b"]), row(2, ["a"]), row(3, ["a"])], catalog, NOW, 2);
    expect(users).toBe(2);
    expect(new Set(items.map((item) => item.user_id)).size).toBe(2);
  });

  it("returns nothing for a budget of 0", () => {
    expect(collectClaimItems([row(1, ["a"])], catalog, NOW, 0)).toEqual({ items: [], users: 0 });
  });

  it("stops before the item count passes the claim cap and leaves the rest for the next day", () => {
    const slugs = Array.from({ length: 100 }, (_, i) => `exam-${i}`);
    const big = slugs.map(entry);
    const rows = Array.from({ length: 12 }, (_, i) => row(i + 1, slugs));

    const { items, users } = collectClaimItems(rows, big, NOW, 50);

    expect(items.length).toBeLessThanOrEqual(MAX_CLAIM_ITEMS);
    expect(users).toBe(10);
    expect(items).toHaveLength(1000);
  });
});
