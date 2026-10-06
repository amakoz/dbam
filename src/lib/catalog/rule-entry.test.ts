import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { validRuleEntries } from "@/lib/catalog/read";
import { isRuleEntry } from "@/lib/catalog/rule-entry";
import { CatalogEntrySchema } from "@/lib/catalog/schema";

function realEntries(): Record<string, unknown>[] {
  const dir = path.join(process.cwd(), "catalog", "entries");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>);
}

describe("isRuleEntry", () => {
  it("accepts every entry the full schema accepts, on the real catalog", () => {
    const entries = realEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const raw of entries) {
      expect(CatalogEntrySchema.safeParse(raw).success).toBe(true);
      expect(isRuleEntry(raw)).toBe(true);
    }
  });

  it("accepts a row with only the rule columns, as the cron's select returns it", () => {
    for (const raw of realEntries()) {
      const { slug, status, eligibility, interval_kind, interval_months, interval_overrides, evidence_level } = raw;
      const row = { slug, status, eligibility, interval_kind, interval_months, interval_overrides, evidence_level };
      expect(isRuleEntry({ ...row, reviewed_by: raw.reviewed_by ?? null })).toBe(true);
    }
  });

  it("rejects what the full schema rejects in the rule fields", () => {
    const [raw] = realEntries();
    const broken: Record<string, unknown>[] = [
      { ...raw, slug: 7 },
      { ...raw, status: "published" },
      { ...raw, interval_kind: "weekly" },
      { ...raw, interval_months: 0 },
      { ...raw, interval_months: 241 },
      { ...raw, interval_months: "12" },
      { ...raw, evidence_level: 4 },
      { ...raw, evidence_level: 2.5 },
      { ...raw, reviewed_by: 3 },
      { ...raw, eligibility: [] },
      { ...raw, eligibility: "adults" },
      { ...raw, eligibility: [{ requires: [] }] },
      { ...raw, eligibility: [{ age_min: -1, requires: [] }] },
      { ...raw, eligibility: [{ age_min: 40, sex: "other", requires: [] }] },
      { ...raw, eligibility: [{ age_min: 40, requires: [{ factor: "no_such_factor", op: "eq", value: true }] }] },
      { ...raw, eligibility: [{ age_min: 40, requires: [{ factor: "bmi", op: "gt", value: 25 }] }] },
      { ...raw, eligibility: [{ age_min: 40, requires: [{ factor: "bmi", op: "gte", value: null }] }] },
      { ...raw, eligibility: [{ age_min: 40, requires: [{ factor: "smoking_status", op: "in", value: [] }] }] },
      { ...raw, interval_overrides: [{ when: { age_min: 40 } }] },
      { ...raw, interval_overrides: [{ when: "40+", months: 12 }] },
      { ...raw, interval_overrides: [{ when: { age_min: 40 }, months: 0 }] },
      { ...raw, interval_overrides: "none" },
    ];
    for (const row of broken) {
      expect(CatalogEntrySchema.safeParse(row).success).toBe(false);
      expect(isRuleEntry(row)).toBe(false);
    }
    expect(isRuleEntry(null)).toBe(false);
    expect(isRuleEntry("dental-check-up")).toBe(false);
  });
});

describe("validRuleEntries", () => {
  it("skips and logs an invalid row by slug, keeping the rest", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const [good] = realEntries();
      const rows = [good, { slug: "broken", status: "active" }, null];
      expect(validRuleEntries(rows)).toHaveLength(1);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(String(spy.mock.calls[0]?.[0])).toContain("broken");
    } finally {
      spy.mockRestore();
    }
  });
});
