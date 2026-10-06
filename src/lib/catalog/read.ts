import type { SupabaseClient } from "@supabase/supabase-js";

import { isRuleEntry } from "@/lib/catalog/rule-entry";
import { CatalogEntrySchema, type CatalogEntry, type RuleEntry } from "@/lib/catalog/schema";
import { DatabaseError } from "@/lib/database-error";
import type { Database } from "@/lib/database.types";

// Exactly the keys of `CatalogEntrySchema`, which is strict: selecting a timestamp column would fail every row.
// One string literal, so supabase-js can type the selected row.
const CATALOG_COLUMNS =
  "slug, status, name_pl, name_en, summary_pl, summary_en, how_to_access_pl, how_to_access_en, eligibility, interval_kind, interval_months, interval_overrides, evidence_level, evidence_source, burden_weight, nfz_funded, referral_required, sources, reviewed_by, last_reviewed, next_review_due";

/** Validates rows. A row that fails validation is logged by slug and skipped, so one bad row can't blank a page. */
function validEntries(rows: { slug: string }[]): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const row of rows) {
    const result = CatalogEntrySchema.safeParse(row);
    if (result.success) {
      entries.push(result.data);
    } else {
      const paths = result.error.issues.map((issue) => issue.path.join(".") || "(root)");
      // Worker logs are the only signal that an entry is hidden; log the slug and paths, never profile data.
      // eslint-disable-next-line no-console
      console.error(`Skipping invalid catalog entry ${row.slug}: ${paths.join(", ")}`);
    }
  }
  return entries;
}

/**
 * The active catalog entries, validated. Throws on a database error, so an outage renders the 500 page instead of
 * an empty list. A row that fails validation is logged by slug and skipped, so one bad row can't blank the dashboard.
 */
export async function getActiveCatalog(supabase: SupabaseClient<Database>): Promise<CatalogEntry[]> {
  const { data, error } = await supabase.from("screening_catalog").select(CATALOG_COLUMNS).eq("status", "active");
  if (error) throw new DatabaseError("read-catalog", error.code);
  return validEntries(data);
}

/**
 * The active or retired entries with the given slugs, validated like `getActiveCatalog` (throws on a database error,
 * skips and logs an invalid row). Lets a user's plan or done record render after its entry is retired.
 */
export async function getCatalogEntries(supabase: SupabaseClient<Database>, slugs: string[]): Promise<CatalogEntry[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await supabase
    .from("screening_catalog")
    .select(CATALOG_COLUMNS)
    .in("slug", slugs)
    .in("status", ["active", "retired"]);
  if (error) throw new DatabaseError("read-catalog-entries", error.code);
  return validEntries(data);
}

// The columns the rules read (`RuleEntry`): all the cron's due-screening job needs, so it neither fetches nor validates
// the sources, quotes and display text.
const RULE_COLUMNS =
  "slug, status, eligibility, interval_kind, interval_months, interval_overrides, evidence_level, reviewed_by";

/** Checks rule rows with `isRuleEntry`: an invalid row is logged by slug and skipped, like `validEntries`. */
export function validRuleEntries(rows: unknown[]): RuleEntry[] {
  const entries: RuleEntry[] = [];
  for (const row of rows) {
    if (isRuleEntry(row)) {
      entries.push(row);
    } else {
      const slug = typeof row === "object" && row !== null && "slug" in row ? String(row.slug) : "(unknown)";
      // eslint-disable-next-line no-console
      console.error(`Skipping invalid catalog entry ${slug}`);
    }
  }
  return entries;
}

/** The active entries' rule fields, for the cron path (see `rule-entry.ts`). Throws on a database error. */
export async function getActiveRuleCatalog(supabase: SupabaseClient<Database>): Promise<RuleEntry[]> {
  const { data, error } = await supabase.from("screening_catalog").select(RULE_COLUMNS).eq("status", "active");
  if (error) throw new DatabaseError("read-catalog", error.code);
  return validRuleEntries(data);
}
