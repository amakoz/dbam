import { z } from "zod";

import { FACTOR_IDS, FACTORS, type FactorDefinition } from "@/lib/catalog/factors";
import { MAX_AGE, SEX_VALUES } from "@/lib/profile";

// The single source of truth for a screening catalog entry (`catalog/entries/<slug>.json`, one row of
// `public.screening_catalog`). The entry validator, the TS types, the published JSON Schema
// (`catalog/entry.schema.json`, via `npm run catalog:schema`) and the drafter's tool schema all come from it.
// Keys are declared in table column order; the snapshot generator serializes rows and jsonb values in this order.
// Refinements (condition vs factor kind, age ranges, fixed interval ⇔ months, source dates, active ⇒ review stamp)
// are enforced here only: JSON Schema carries the structural shape. See `factors.ts` for the eligibility and interval semantics.

export const CATALOG_STATUSES = ["draft", "active", "retired"] as const;
export const INTERVAL_KINDS = ["fixed", "no_known_interval", "shared_decision", "per_program"] as const;
export const CONDITION_OPS = ["eq", "in", "gte", "lte"] as const;

const MAX_INTERVAL_MONTHS = 240;

/** C0 control characters and DEL, except tab and newline: Postgres can't store NUL, and none belong in catalog text. */
function hasControlCharacter(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if ((code < 0x20 && char !== "\t" && char !== "\n") || code === 0x7f) return true;
  }
  return false;
}

const Text = z
  .string()
  .regex(/\S/, { error: "must not be blank" })
  .refine((text) => !hasControlCharacter(text), {
    error: "must not contain control characters (other than tab and newline)",
  });
const IsoDate = z.iso.date({ error: "must be a date in YYYY-MM-DD format" });
const Age = z.int().min(0).max(MAX_AGE);
const Months = z.int().min(1).max(MAX_INTERVAL_MONTHS);

/** The latest calendar date anywhere on Earth (UTC+14), so a date written as "today" in any time zone passes. */
function latestToday(): string {
  return new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------------------------------------------

function checkConditionMatchesFactor(
  condition: { factor: keyof typeof FACTORS; op: (typeof CONDITION_OPS)[number]; value: unknown },
  ctx: z.RefinementCtx,
): void {
  const { factor, op, value } = condition;
  const definition: FactorDefinition = FACTORS[factor];
  const opIssue = (allowed: string) => {
    ctx.addIssue({
      code: "custom",
      path: ["op"],
      message: `"${op}" is not allowed for ${definition.kind} factor "${factor}" (use ${allowed})`,
    });
  };
  const valueIssue = (message: string, path: (string | number)[] = []) => {
    ctx.addIssue({ code: "custom", path: ["value", ...path], message });
  };

  switch (definition.kind) {
    case "number":
      if (op === "in") opIssue("eq, gte or lte");
      else if (typeof value !== "number") valueIssue(`must be a number for factor "${factor}"`);
      return;
    case "boolean":
      if (op !== "eq") opIssue("eq");
      else if (typeof value !== "boolean") valueIssue(`must be true or false for factor "${factor}"`);
      return;
    case "enum": {
      const allowed = definition.values.join(", ");
      const isAllowed = (v: unknown) => typeof v === "string" && definition.values.includes(v);
      if (op !== "eq" && op !== "in") {
        opIssue("eq or in");
      } else if (op === "eq") {
        if (!isAllowed(value)) valueIssue(`must be one of ${allowed} for factor "${factor}"`);
      } else if (!Array.isArray(value)) {
        valueIssue(`must be a non-empty array of ${allowed} for factor "${factor}" with op "in"`);
      } else {
        value.forEach((v: unknown, i) => {
          if (!isAllowed(v)) valueIssue(`must be one of ${allowed} for factor "${factor}"`, [i]);
        });
      }
      return;
    }
  }
}

export const ConditionSchema = z
  .strictObject({
    factor: z
      .enum(FACTOR_IDS, {
        error: (issue) =>
          issue.input === undefined
            ? undefined
            : `unknown factor ${JSON.stringify(issue.input)} (see src/lib/catalog/factors.ts)`,
      })
      .describe("A factor id from the closed vocabulary in src/lib/catalog/factors.ts."),
    op: z.enum(CONDITION_OPS).describe("number factors: eq, gte or lte; boolean factors: eq; enum factors: eq or in."),
    value: z
      .union([z.number(), z.boolean(), z.string(), z.array(z.string()).min(1)])
      .describe("Compared with the profile value; its type must match the factor kind (an array only for op in)."),
  })
  .superRefine(checkConditionMatchesFactor)
  .describe("A condition on one risk factor. A condition on an uncollected factor makes its branch unknown.");

// ---------------------------------------------------------------------------------------------------------------
// Age ranges: eligibility branches and interval overrides
// ---------------------------------------------------------------------------------------------------------------

const AgeRangeFields = z.object({ age_min: Age.optional(), age_max: Age.optional() });

function checkAgeRange(range: { age_min?: number; age_max?: number }, ctx: z.RefinementCtx): void {
  if (range.age_min !== undefined && range.age_max !== undefined && range.age_max < range.age_min) {
    ctx.addIssue({ code: "custom", path: ["age_max"], message: `must be ≥ age_min (${range.age_min})` });
  }
}

// Runs the age check even when a sibling field (e.g. a condition in `requires`) is invalid, as long as the ages are.
const whenAgesValid = { when: (payload: z.core.ParsePayload) => AgeRangeFields.safeParse(payload.value).success };

export const BranchSchema = z
  .strictObject({
    sex: z.enum(SEX_VALUES).optional().describe("Absent means any sex."),
    age_min: Age.describe("Inclusive lower age bound; age = current year − birth year."),
    age_max: Age.optional().describe("Inclusive upper age bound; absent means no upper bound."),
    requires: z.array(ConditionSchema).describe("Every condition must hold; empty means no extra conditions."),
  })
  .superRefine(checkAgeRange, whenAgesValid)
  .describe("One way to be eligible: sex, an age range and risk-factor conditions, all of which must hold.");

export const IntervalOverrideSchema = z
  .strictObject({
    when: z
      .strictObject({
        age_min: Age.optional(),
        age_max: Age.optional(),
        requires: z.array(ConditionSchema).optional(),
      })
      .superRefine(checkAgeRange, whenAgesValid)
      .describe("Matches like a branch (without sex); absent fields do not restrict."),
    months: Months.describe("Replaces interval_months when this override is the first one that matches."),
  })
  .describe("A conditional interval for a fixed-interval entry.");

// ---------------------------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------------------------

export const SourceSchema = z
  .strictObject({
    url: z.url({ protocol: /^https$/, error: "must be an https URL" }),
    title: Text,
    publisher: Text,
    quote: Text.describe("A verbatim quote from the source that supports the entry's rules."),
    accessed: IsoDate.refine((date) => date <= latestToday(), { error: "must not be in the future" }).describe(
      "The date the source was read, YYYY-MM-DD.",
    ),
  })
  .describe("A cited source, with a verbatim supporting quote.");

// ---------------------------------------------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------------------------------------------

const IntervalFields = z.object({ interval_kind: z.enum(INTERVAL_KINDS), interval_months: Months.nullish() });

function checkIntervalMonths(
  entry: { interval_kind: (typeof INTERVAL_KINDS)[number]; interval_months?: number | null },
  ctx: z.RefinementCtx,
): void {
  const hasMonths = entry.interval_months !== undefined && entry.interval_months !== null;
  if (entry.interval_kind === "fixed" && !hasMonths) {
    ctx.addIssue({ code: "custom", path: ["interval_months"], message: `required when interval_kind is "fixed"` });
  } else if (entry.interval_kind !== "fixed" && hasMonths) {
    ctx.addIssue({
      code: "custom",
      path: ["interval_months"],
      message: `must be absent or null unless interval_kind is "fixed" (it is "${entry.interval_kind}")`,
    });
  }
}

const ReviewFields = z.object({
  status: z.enum(CATALOG_STATUSES),
  reviewed_by: Text.nullish(),
  last_reviewed: IsoDate.nullish(),
});

/** The launch gate: an active entry is shown to users, so it must carry a review stamp. */
function checkReviewStamp(
  entry: { status: (typeof CATALOG_STATUSES)[number]; reviewed_by?: string | null; last_reviewed?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (entry.status !== "active") return;
  for (const field of ["reviewed_by", "last_reviewed"] as const) {
    if (entry[field] === undefined || entry[field] === null) {
      ctx.addIssue({ code: "custom", path: [field], message: `required when status is "active" (review stamp)` });
    }
  }
}

export const CatalogEntrySchema = z
  .strictObject({
    slug: z
      .string()
      .max(64)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "must be lowercase words joined by single hyphens" })
      .describe("Immutable id; the file name is <slug>.json."),
    status: z
      .enum(CATALOG_STATUSES)
      .describe("draft (hidden from users), active (shown) or retired (hidden from new recommendations)."),
    name_pl: Text,
    name_en: Text,
    summary_pl: Text,
    summary_en: Text,
    how_to_access_pl: Text,
    how_to_access_en: Text,
    eligibility: z.array(BranchSchema).min(1).describe("Eligible when ANY branch matches."),
    interval_kind: z
      .enum(INTERVAL_KINDS)
      .describe("fixed has interval_months; the other kinds have no computable next due date."),
    interval_months: Months.nullish().describe("Required when interval_kind is fixed, absent or null otherwise."),
    interval_overrides: z
      .array(IntervalOverrideSchema)
      .describe("The first override whose `when` matches replaces interval_months."),
    evidence_level: z
      .int()
      .min(1)
      .max(3)
      .describe(
        "3 = organised NFZ program, EU core cancer screening or USPSTF A/B; 2 = Polish society recommendation or " +
          "Moje Zdrowie item; 1 = shared decision, USPSTF C/I or pilot.",
      ),
    evidence_source: Text.describe("Who backs the evidence level, e.g. NFZ program; EU Council Rec. 2022."),
    burden_weight: z.int().min(0).max(5).describe("Disease burden in Poland, 0–5; a tie-breaker only."),
    nfz_funded: z.boolean(),
    referral_required: z.boolean(),
    sources: z.array(SourceSchema).min(1),
    reviewed_by: Text.nullish().describe(
      "Who signed off the entry: a POZ doctor, or 'owner (non-medical review)' until one does; required for active " +
        "entries.",
    ),
    last_reviewed: IsoDate.nullish().describe("The sign-off date, YYYY-MM-DD; required for active entries."),
    next_review_due: IsoDate.nullish(),
  })
  .superRefine(checkIntervalMonths, {
    when: (payload) => IntervalFields.safeParse(payload.value).success,
  })
  .superRefine(checkReviewStamp, {
    when: (payload) => ReviewFields.safeParse(payload.value).success,
  })
  .describe("A screening catalog entry: one row of public.screening_catalog.");

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type Branch = z.infer<typeof BranchSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type IntervalOverride = z.infer<typeof IntervalOverrideSchema>;
export type Source = z.infer<typeof SourceSchema>;
