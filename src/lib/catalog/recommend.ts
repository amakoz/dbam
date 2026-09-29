import type { Locale } from "@/i18n";
import { FACTORS } from "@/lib/catalog/factors";
import type { Branch, CatalogEntry, Condition } from "@/lib/catalog/schema";
import type { Profile, Sex } from "@/lib/profile";

// The eligibility, tier and interval rules of S-02, implementing the semantics documented in `factors.ts`. Pure: no
// I/O, no Supabase and no i18n, so it can be unit-tested directly.

/** `unknown`: every known part holds, but a condition is on a factor the profile doesn't collect. */
export type BranchResult = "match" | "unknown" | "no";

export type Tier = 1 | 2 | 3;

export type Interval = { kind: "months"; months: number } | { kind: Exclude<CatalogEntry["interval_kind"], "fixed"> };

export interface Recommendation {
  entry: CatalogEntry;
  tier: Tier;
  /** The first matching branch in document order. */
  matchedBranch: Branch;
  interval: Interval;
}

export interface MaybeRecommendation {
  entry: CatalogEntry;
  /** One array per `unknown` branch, holding only that branch's conditions on uncollected factors. */
  missing: Condition[][];
}

export interface Recommendations {
  tiers: Record<Tier, Recommendation[]>;
  maybe: MaybeRecommendation[];
  age: number;
}

/** A branch, or an interval override's `when`, which matches like a branch without `sex`. */
interface Rule {
  sex?: Sex;
  age_min?: number;
  age_max?: number;
  requires?: Condition[];
}

function evaluateCondition(condition: Condition, profile: Profile): BranchResult {
  const factor = FACTORS[condition.factor];
  if (!factor.collected) return "unknown";

  const actual = profile[factor.column];
  if (actual === null) return "no";
  return holds(condition, actual) ? "match" : "no";
}

function holds({ op, value }: Condition, actual: string | number): boolean {
  switch (op) {
    case "eq":
      return actual === value;
    case "in":
      return Array.isArray(value) && typeof actual === "string" && value.includes(actual);
    case "gte":
      return typeof actual === "number" && typeof value === "number" && actual >= value;
    case "lte":
      return typeof actual === "number" && typeof value === "number" && actual <= value;
  }
}

/**
 * False beats unknown: `no` when any known part fails (sex, age, or a condition on a collected factor, including a
 * null profile value); otherwise `unknown` when a condition is on an uncollected factor; otherwise `match`.
 */
export function evaluateBranch(branch: Rule, profile: Profile, age: number): BranchResult {
  if (branch.sex !== undefined && branch.sex !== profile.sex) return "no";
  if (branch.age_min !== undefined && age < branch.age_min) return "no";
  if (branch.age_max !== undefined && age > branch.age_max) return "no";

  const results = (branch.requires ?? []).map((condition) => evaluateCondition(condition, profile));
  if (results.includes("no")) return "no";
  if (results.includes("unknown")) return "unknown";
  return "match";
}

/** For `fixed`, the first override whose `when` matches wins; an `unknown` override is skipped, not applied. */
export function resolveInterval(entry: CatalogEntry, profile: Profile, age: number): Interval {
  if (entry.interval_kind !== "fixed") return { kind: entry.interval_kind };

  const override = entry.interval_overrides.find((o) => evaluateBranch(o.when, profile, age) === "match");
  const months = override?.months ?? entry.interval_months;
  // Unreachable for a validated entry: the schema requires interval_months when the kind is fixed.
  if (months === undefined || months === null) return { kind: "no_known_interval" };
  return { kind: "months", months };
}

/** Tier = 4 − evidence level: 3 (organised program, A/B) → 1, 2 → 2, 1 (shared decision, C/I, pilot) → 3. */
function tierOf(evidenceLevel: number): Tier {
  if (evidenceLevel >= 3) return 1;
  return evidenceLevel === 2 ? 2 : 3;
}

/**
 * The entries due for the profile, grouped by tier, plus the ones that may apply depending on uncollected factors.
 * Only active entries with a review stamp are considered (the launch gate). Within a tier, entries are sorted by
 * burden weight (highest first), then by name in the given locale.
 */
export function recommend(
  entries: CatalogEntry[],
  profile: Profile,
  currentYear: number,
  locale: Locale,
): Recommendations {
  const age = currentYear - profile.birth_year;
  const tiers: Record<Tier, Recommendation[]> = { 1: [], 2: [], 3: [] };
  const maybe: MaybeRecommendation[] = [];

  for (const entry of entries) {
    if (entry.status !== "active" || entry.reviewed_by === undefined || entry.reviewed_by === null) continue;

    const results = entry.eligibility.map((branch) => evaluateBranch(branch, profile, age));
    const matched = results.indexOf("match");
    if (matched !== -1) {
      const tier = tierOf(entry.evidence_level);
      tiers[tier].push({
        entry,
        tier,
        matchedBranch: entry.eligibility[matched],
        interval: resolveInterval(entry, profile, age),
      });
    } else if (results.includes("unknown")) {
      const missing = entry.eligibility
        .filter((_, i) => results[i] === "unknown")
        .map((branch) => branch.requires.filter((condition) => !FACTORS[condition.factor].collected));
      maybe.push({ entry, missing });
    }
  }

  const collator = new Intl.Collator(locale);
  const name = (entry: CatalogEntry) => (locale === "pl" ? entry.name_pl : entry.name_en);
  const byBurdenThenName = (a: { entry: CatalogEntry }, b: { entry: CatalogEntry }) =>
    b.entry.burden_weight - a.entry.burden_weight || collator.compare(name(a.entry), name(b.entry));
  for (const list of Object.values(tiers)) list.sort(byBurdenThenName);
  maybe.sort(byBurdenThenName);

  return { tiers, maybe, age };
}
