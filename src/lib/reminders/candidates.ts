import type { RuleEntry } from "@/lib/catalog/schema";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import { dueScreeningItems } from "@/lib/screenings/due";

// The rows of `get_due_screening_candidates`, validated, and the items to claim for them. Pure (no `astro:*` imports), so
// the CPU timing test runs the same code as the cron job.

export interface CandidateRow {
  user_id: string;
  birth_year: number;
  sex: "female" | "male";
  smoking_status: "never" | "current" | "former";
  pack_years: number | null;
  years_since_quitting: number | null;
  completions: { catalog_slug: string; anchor_month: string }[];
}

// Hand-written checks, not zod: a cold zod parse of 50 rows cost about 2.8 ms of a Workers cron run's 10 ms CPU cap.
// The rows come from our own definer function, so this guards against a changed shape, not against hostile input.

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isCompletion(value: unknown): value is CandidateRow["completions"][number] {
  return (
    isRecord(value) &&
    typeof value.catalog_slug === "string" &&
    typeof value.anchor_month === "string" &&
    /^\d{4}-\d{2}-01$/.test(value.anchor_month)
  );
}

function isCandidateRow(value: unknown): value is CandidateRow {
  return (
    isRecord(value) &&
    typeof value.user_id === "string" &&
    typeof value.birth_year === "number" &&
    Number.isFinite(value.birth_year) &&
    (value.sex === "female" || value.sex === "male") &&
    (value.smoking_status === "never" || value.smoking_status === "current" || value.smoking_status === "former") &&
    isNumberOrNull(value.pack_years) &&
    isNumberOrNull(value.years_since_quitting) &&
    Array.isArray(value.completions) &&
    value.completions.every(isCompletion)
  );
}

/** Throws `ReminderDatabaseError("candidates", "invalid")` for a malformed row, never a message (it could quote data). */
export function parseCandidateRows(data: unknown): CandidateRow[] {
  if (!Array.isArray(data) || !data.every(isCandidateRow)) {
    throw new ReminderDatabaseError("candidates", "invalid");
  }
  return data;
}

/** `claim_due_screening_reminders` accepts 1 to 1000 items; a run that would pass it leaves the rest for the next day. */
export const MAX_CLAIM_ITEMS = 1000;

export interface ClaimItem {
  user_id: string;
  catalog_slug: string;
  anchor_month: string;
  due_month: string;
}

/**
 * The claim items for the first `budget` candidates that have a due exam (`dueScreeningItems`), in candidate order,
 * stopping before the item count would pass MAX_CLAIM_ITEMS. `users` is how many candidates they belong to.
 */
export function collectClaimItems(
  rows: CandidateRow[],
  catalog: RuleEntry[],
  now: Date,
  budget: number,
): { items: ClaimItem[]; users: number } {
  const items: ClaimItem[] = [];
  let users = 0;
  for (const row of rows) {
    if (users >= budget) break;
    const due = dueScreeningItems(
      {
        profile: {
          birth_year: row.birth_year,
          sex: row.sex,
          smoking_status: row.smoking_status,
          pack_years: row.pack_years,
          years_since_quitting: row.years_since_quitting,
        },
        completions: row.completions,
      },
      catalog,
      now,
    );
    if (due.length === 0) continue;
    if (items.length + due.length > MAX_CLAIM_ITEMS) break;
    users += 1;
    for (const item of due) {
      items.push({
        user_id: row.user_id,
        catalog_slug: item.slug,
        anchor_month: item.anchorMonth,
        due_month: item.dueMonth,
      });
    }
  }
  return { items, users };
}
