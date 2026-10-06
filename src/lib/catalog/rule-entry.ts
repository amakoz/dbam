import { FACTOR_IDS } from "@/lib/catalog/factors";
import {
  CATALOG_STATUSES,
  CONDITION_OPS,
  INTERVAL_KINDS,
  type Branch,
  type IntervalOverride,
  type RuleEntry,
} from "@/lib/catalog/schema";
import { MAX_AGE, SEX_VALUES } from "@/lib/profile";

// A light check of the fields the eligibility, tier and interval rules read, for the cron's due-screening job. It is
// hand-written, not a zod schema: zod's cold start alone (about 2.5 ms in Node, before any row) is a quarter of a
// Workers Free cron run's 10 ms CPU cap, and a full `CatalogEntrySchema` parse of the 20 entries was another 10 ms.
// The rows come from our own catalog table, whose entries `npm run catalog:check` already validates in full; this
// guards against a changed shape. It checks types and closed vocabularies, not the cross-field refinements (a fixed
// entry has months, an active entry has a review stamp, `age_max` >= `age_min`, a condition's value type matches its
// factor): a malformed rule there makes the rules answer `no` or `unknown`, never throw. `rule-entry.test.ts` pins
// that it agrees with `CatalogEntrySchema` on the real catalog.

type Json = Record<string, unknown>;

const MAX_INTERVAL_MONTHS = 240;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && list.some((item) => item === value);
}

function isCondition(value: unknown): boolean {
  if (!isRecord(value) || !oneOf(FACTOR_IDS, value.factor) || !oneOf(CONDITION_OPS, value.op)) return false;
  const operand = value.value;
  if (Array.isArray(operand)) return operand.length > 0 && operand.every((item) => typeof item === "string");
  return typeof operand === "number" || typeof operand === "boolean" || typeof operand === "string";
}

function isAgeBound(value: unknown): boolean {
  return value === undefined || isInt(value, 0, MAX_AGE);
}

function isBranch(value: unknown): value is Branch {
  return (
    isRecord(value) &&
    (value.sex === undefined || oneOf(SEX_VALUES, value.sex)) &&
    isInt(value.age_min, 0, MAX_AGE) &&
    isAgeBound(value.age_max) &&
    Array.isArray(value.requires) &&
    value.requires.every(isCondition)
  );
}

function isOverride(value: unknown): value is IntervalOverride {
  if (!isRecord(value) || !isInt(value.months, 1, MAX_INTERVAL_MONTHS) || !isRecord(value.when)) return false;
  const { age_min, age_max, requires } = value.when;
  return (
    isAgeBound(age_min) &&
    isAgeBound(age_max) &&
    (requires === undefined || (Array.isArray(requires) && requires.every(isCondition)))
  );
}

/** True when `row` has the rule fields of a catalog entry; the type guard narrows it to what the rules read. */
export function isRuleEntry(row: unknown): row is RuleEntry {
  return (
    isRecord(row) &&
    typeof row.slug === "string" &&
    oneOf(CATALOG_STATUSES, row.status) &&
    oneOf(INTERVAL_KINDS, row.interval_kind) &&
    (row.interval_months === undefined ||
      row.interval_months === null ||
      isInt(row.interval_months, 1, MAX_INTERVAL_MONTHS)) &&
    isInt(row.evidence_level, 1, 3) &&
    (row.reviewed_by === undefined || row.reviewed_by === null || typeof row.reviewed_by === "string") &&
    Array.isArray(row.eligibility) &&
    row.eligibility.length > 0 &&
    row.eligibility.every(isBranch) &&
    Array.isArray(row.interval_overrides) &&
    row.interval_overrides.every(isOverride)
  );
}
