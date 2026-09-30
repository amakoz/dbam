import type { MessageKey } from "@/i18n";
import {
  resolveInterval,
  type Interval,
  type MaybeRecommendation,
  type Recommendation,
  type Recommendations,
  type Tier,
} from "@/lib/catalog/recommend";
import type { CatalogEntry } from "@/lib/catalog/schema";
import type { Database } from "@/lib/database.types";
import type { Profile } from "@/lib/profile";

// The date and state rules of S-03 (plans and done records), shared by `POST /api/screenings` and the dashboard.
// Pure: no I/O and no i18n, and "now" is a parameter, so it can be unit-tested directly.
//
// Dates are plain `YYYY-MM-DD` strings, which compare correctly as strings. "Today" and "this month" are Warsaw
// calendar values, never UTC ones (`toISOString()`), so a save just after midnight in Poland lands on the right day.

export type ScreeningPlan = Database["public"]["Tables"]["screening_plans"]["Row"];
export type ScreeningCompletion = Database["public"]["Tables"]["screening_completions"]["Row"];

/** A catalog slug as it may appear in a redirect URL and an element id. */
export const SLUG_PATTERN = /^[a-z0-9-]+$/;

/** How far ahead an appointment date may be, in years (inclusive). */
export const MAX_APPOINTMENT_YEARS_AHEAD = 2;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: MessageKey };

// ---------------------------------------------------------------------------------------------------------------
// Warsaw calendar and plain-date arithmetic
// ---------------------------------------------------------------------------------------------------------------

const WARSAW_DATE = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}

function formatDate(year: number, month: number, day: number): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The Warsaw calendar date of `now`, as `YYYY-MM-DD`. */
export function warsawToday(now: Date): string {
  const parts = WARSAW_DATE.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return formatDate(part("year"), part("month"), part("day"));
}

/** The first day of the Warsaw calendar month of `date`, as `YYYY-MM-01`. */
export function warsawMonth(date: Date): string {
  return `${warsawToday(date).slice(0, 8)}01`;
}

/** Year, month (1–12) and day of a `YYYY-MM-DD` string. */
function dateParts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number);
  return [year, month, day];
}

/** Whether `value` is a real calendar date in `YYYY-MM-DD` format (so `2026-02-30` is not). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = dateParts(value);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The month `n` months after the month of `month` (`YYYY-MM-DD`; the day is ignored), as `YYYY-MM-01`. */
export function addMonths(month: string, n: number): string {
  const [year, monthNumber] = dateParts(month);
  const index = year * 12 + (monthNumber - 1) + n;
  return formatDate(Math.floor(index / 12), (index % 12) + 1, 1);
}

/** The date `n` years after `day` (`YYYY-MM-DD`). Feb 29 rolls over to Mar 1 in a non-leap year. */
export function addYears(day: string, n: number): string {
  const [year, month, dayNumber] = dateParts(day);
  const date = new Date(0);
  date.setUTCFullYear(year + n, month - 1, dayNumber);
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// ---------------------------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------------------------

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** The submitted slug when it is well formed; the endpoint checks it against the user's recommendations. */
function slugField(form: FormData): string | null {
  const slug = field(form, "slug");
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export interface PlanInput {
  slug: string;
  /** Null means "planned, no date yet". */
  appointment_date: string | null;
}

/** The Plan form: an optional appointment date from `today` (Warsaw) up to two years ahead, both inclusive. */
export function parsePlanForm(form: FormData, today: string): ParseResult<PlanInput> {
  const slug = slugField(form);
  if (!slug) return { ok: false, error: "errors.invalid_request" };

  const date = field(form, "appointment_date");
  if (!date) return { ok: true, value: { slug, appointment_date: null } };

  if (!isIsoDate(date) || date < today || date > addYears(today, MAX_APPOINTMENT_YEARS_AHEAD)) {
    return { ok: false, error: "errors.invalid_appointment_date" };
  }
  return { ok: true, value: { slug, appointment_date: date } };
}

export interface DoneInput {
  slug: string;
  /** `YYYY-MM-01`; null means "don't know" (due again counts from the month it was marked). */
  last_done_month: string | null;
}

/**
 * The Done form: `done_month` (1–12) and `done_year` (4 digits), both blank or both set. When set, the month must lie
 * between January of the birth year and `currentMonth` (Warsaw, `YYYY-MM-01`), both inclusive.
 */
export function parseDoneForm(form: FormData, currentMonth: string, birthYear: number): ParseResult<DoneInput> {
  const slug = slugField(form);
  if (!slug) return { ok: false, error: "errors.invalid_request" };

  const monthRaw = field(form, "done_month");
  const yearRaw = field(form, "done_year");
  if (!monthRaw && !yearRaw) return { ok: true, value: { slug, last_done_month: null } };

  const invalid = { ok: false, error: "errors.invalid_done_date" } as const;
  if (!/^\d{1,2}$/.test(monthRaw) || !/^\d{4}$/.test(yearRaw)) return invalid;
  const month = Number(monthRaw);
  if (month < 1 || month > 12) return invalid;

  const lastDoneMonth = formatDate(Number(yearRaw), month, 1);
  if (lastDoneMonth < formatDate(birthYear, 1, 1) || lastDoneMonth > currentMonth) return invalid;
  return { ok: true, value: { slug, last_done_month: lastDoneMonth } };
}

// ---------------------------------------------------------------------------------------------------------------
// Due again
// ---------------------------------------------------------------------------------------------------------------

/**
 * The month "due again" counts from: the month of the last exam, or when blank, the Warsaw month the record was last
 * saved (`set_updated_at` fires on every upsert, so re-marking an exam done means "done again now").
 */
export function anchorMonth(completion: Pick<ScreeningCompletion, "last_done_month" | "updated_at">): string {
  return completion.last_done_month ?? warsawMonth(new Date(completion.updated_at));
}

/**
 * The month (`YYYY-MM-01`) from whose first day the exam is due again, or null when the entry has no fixed interval
 * (it then never becomes due again on its own).
 */
export function nextDueMonth(
  completion: Pick<ScreeningCompletion, "last_done_month" | "updated_at">,
  interval: Interval,
): string | null {
  return interval.kind === "months" ? addMonths(anchorMonth(completion), interval.months) : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------------------------

export interface PlanView {
  plan: ScreeningPlan;
  entry: CatalogEntry;
  /** The tier when the exam is currently recommended, for its badge; null otherwise. */
  tier: Tier | null;
}

export interface DoneView {
  completion: ScreeningCompletion;
  entry: CatalogEntry;
  /** See `nextDueMonth`; always null or later than the current month here. */
  nextDue: string | null;
}

export interface DashboardPartition {
  /** Dated plans by date ascending, then undated plans (oldest first). */
  plans: PlanView[];
  /** Done records that are not due again yet (or have no fixed interval), without the ones that have a plan. */
  done: DoneView[];
  /** The recommendations without exams that have a plan or a not-yet-due done record. */
  tiers: Record<Tier, Recommendation[]>;
  maybe: MaybeRecommendation[];
  /** The done record of each tier item that is due again, by slug, for its "last done" line. */
  lastDone: Map<string, ScreeningCompletion>;
}

/**
 * Splits the dashboard into plans, done records and the remaining recommendations. Each exam shows in one place:
 * a plan wins over a done record, and a not-yet-due done record wins over the tier.
 *
 * `entries` must hold the catalog entry of every plan and done record (active or retired); a record whose entry is
 * missing (e.g. it failed validation) is skipped. Intervals come from `resolveInterval` with the current profile, so a
 * done record keeps its place when the exam is no longer recommended.
 */
export function partitionDashboard(
  recommendations: Recommendations,
  plans: ScreeningPlan[],
  completions: ScreeningCompletion[],
  entries: CatalogEntry[],
  profile: Profile,
  now: Date,
): DashboardPartition {
  const currentMonth = warsawMonth(now);
  const entryBySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const tierBySlug = new Map<string, Tier>();
  for (const tier of [1, 2, 3] as const) {
    for (const { entry } of recommendations.tiers[tier]) tierBySlug.set(entry.slug, tier);
  }

  const planViews: PlanView[] = [];
  for (const plan of plans) {
    const entry = entryBySlug.get(plan.catalog_slug);
    if (entry) planViews.push({ plan, entry, tier: tierBySlug.get(plan.catalog_slug) ?? null });
  }
  planViews.sort((a, b) => {
    const dateA = a.plan.appointment_date;
    const dateB = b.plan.appointment_date;
    if (dateA !== dateB) {
      if (dateA === null) return 1;
      if (dateB === null) return -1;
      return dateA < dateB ? -1 : 1;
    }
    return a.plan.created_at < b.plan.created_at ? -1 : a.plan.created_at > b.plan.created_at ? 1 : 0;
  });
  const planned = new Set(plans.map((plan) => plan.catalog_slug));

  const done: DoneView[] = [];
  const dueAgain = new Map<string, ScreeningCompletion>();
  for (const completion of completions) {
    const entry = entryBySlug.get(completion.catalog_slug);
    if (!entry || planned.has(completion.catalog_slug)) continue;
    const nextDue = nextDueMonth(completion, resolveInterval(entry, profile, recommendations.age));
    if (nextDue === null || nextDue > currentMonth) {
      done.push({ completion, entry, nextDue });
    } else {
      dueAgain.set(completion.catalog_slug, completion);
    }
  }
  const hidden = new Set([...planned, ...done.map(({ entry }) => entry.slug)]);

  const tiers: Record<Tier, Recommendation[]> = { 1: [], 2: [], 3: [] };
  const lastDone = new Map<string, ScreeningCompletion>();
  for (const tier of [1, 2, 3] as const) {
    tiers[tier] = recommendations.tiers[tier].filter(({ entry }) => !hidden.has(entry.slug));
    for (const { entry } of tiers[tier]) {
      const completion = dueAgain.get(entry.slug);
      if (completion) lastDone.set(entry.slug, completion);
    }
  }
  const maybe = recommendations.maybe.filter(({ entry }) => !hidden.has(entry.slug));

  return { plans: planViews, done, tiers, maybe, lastDone };
}
