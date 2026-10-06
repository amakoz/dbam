import { classifyEntries, type RuleProfile } from "@/lib/catalog/recommend";
import type { RuleEntry } from "@/lib/catalog/schema";
import { anchorMonth, nextDueMonth, partitionDashboard, warsawToday } from "@/lib/screenings/rules";

// Which completions the due-screening reminder job emails about (S-06). Pure: the dashboard's own rules, run on the
// minimal inputs the cron may read, so the email agrees with what the dashboard shows. "Now" is a parameter.

/**
 * How many candidate users one cron run evaluates. A Workers cron run starts cold, and a cold run of
 * `dueScreeningItems` took about 2.5 ms for 50 candidates but 5-7 ms for 100 (`due.perf.test.ts`), against a 10 ms CPU
 * cap that also pays for the JSON decode, a zod parse and a SHA-256. Users left over roll to the next daily run.
 */
export const DUE_CANDIDATE_LIMIT = 50;

export interface DueCandidate {
  profile: RuleProfile;
  /** `anchor_month` is computed in SQL (`screening_anchor_month`) and used as is. */
  completions: { catalog_slug: string; anchor_month: string }[];
}

export interface DueItem {
  slug: string;
  /** `YYYY-MM-01`. */
  anchorMonth: string;
  /** `YYYY-MM-01`. */
  dueMonth: string;
}

/**
 * The items the dashboard would show at `now` as "due again" in a tier, with no plans (the SQL has already excluded
 * planned slugs), sorted by slug. Calls the sort-free `classifyEntries`, so it never builds an `Intl.Collator`; tier
 * membership does not depend on the display sort. Eligibility uses the Warsaw year, not the runtime's local one.
 */
export function dueScreeningItems(candidate: DueCandidate, entries: RuleEntry[], now: Date): DueItem[] {
  const year = Number(warsawToday(now).slice(0, 4));
  const recommendations = classifyEntries(entries, candidate.profile, year);
  // `updated_at` is never read: the anchor is always set, so `anchorMonth` returns it unchanged.
  const completions = candidate.completions.map(({ catalog_slug, anchor_month }) => ({
    catalog_slug,
    last_done_month: anchor_month,
    updated_at: anchor_month,
  }));
  const { tiers, lastDone } = partitionDashboard(recommendations, [], completions, entries, candidate.profile, now);

  const items: DueItem[] = [];
  for (const tier of [1, 2, 3] as const) {
    for (const { entry, interval } of tiers[tier]) {
      const completion = lastDone.get(entry.slug);
      if (!completion) continue;
      const dueMonth = nextDueMonth(completion, interval);
      if (dueMonth !== null) items.push({ slug: entry.slug, anchorMonth: anchorMonth(completion), dueMonth });
    }
  }
  return items.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}
