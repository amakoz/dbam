import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { validRuleEntries } from "@/lib/catalog/read";
import { batchKey } from "@/lib/reminders/batch-key";
import { collectClaimItems, parseCandidateRows } from "@/lib/reminders/candidates";
import { DUE_CANDIDATE_LIMIT } from "@/lib/screenings/due";

// The in-process CPU of a due-screening cron run, timed in the order the job runs it: decode and validate the
// candidate rows, decode and validate the catalog rows, run the rules for every candidate, hash the batch key. Kept in
// its own file so Vitest runs it in a fresh worker, because a Workers cron run starts cold and has a 10 ms CPU cap on
// the free plan. Network waits don't count and are not
// measured. The numbers come from Node/V8, not workerd (for one, Node's first `crypto.subtle` call is slower than
// workerd's), so they are indicative: production CPU stays a manual check of the scheduled invocation (plan 3.8).
//
// The numbers are always logged. The strict budget is asserted only with PERF_ASSERT=1, for the
// implementer's own run on a quiet machine: shared CI runners are too noisy for a few-millisecond assertion. A
// ceiling of 4x the budget always applies and catches an order-of-magnitude regression.

// 7 of the 10 ms cap: the sequence below is the in-process part, and the supabase-js and fetch work around it (request
// building, response decoding) is not measured, so it keeps 3 ms of headroom.
const BUDGET_MS = 7;
const CI_CEILING_MS = BUDGET_MS * 4;
const STRICT = process.env.PERF_ASSERT === "1";
const CANDIDATES = DUE_CANDIDATE_LIMIT;
// A candidate holds a handful of done exams, not the whole catalog.
const TYPICAL_COMPLETIONS = 6;
const NOW = new Date("2027-03-10T09:00:00Z");
const RULE_COLUMNS = [
  "slug",
  "status",
  "eligibility",
  "interval_kind",
  "interval_months",
  "interval_overrides",
  "evidence_level",
  "reviewed_by",
] as const;

/** The catalog as the cron's select returns it, encoded as the response body: the rule columns of every entry. */
function catalogBody(): string {
  const dir = path.join(process.cwd(), "catalog", "entries");
  const rows = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const entry = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as Record<string, unknown>;
      return Object.fromEntries(RULE_COLUMNS.map((column) => [column, entry[column] ?? null]));
    });
  return JSON.stringify(rows);
}

/** The candidates RPC's response body: ages, sexes and smoking spread out, each user holding `completions` done exams. */
function candidatesBody(slugs: string[], count: number, completions: number): string {
  const rows = Array.from({ length: count }, (_, i) => {
    const smoker = i % 3 === 0;
    return {
      user_id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      birth_year: 1950 + (i % 50),
      sex: i % 2 === 0 ? "female" : "male",
      smoking_status: smoker ? "former" : "never",
      pack_years: smoker ? 20 + (i % 30) : null,
      years_since_quitting: smoker ? i % 15 : null,
      completions: Array.from({ length: Math.min(completions, slugs.length) }, (_, j) => ({
        catalog_slug: slugs[(i + j) % slugs.length],
        anchor_month: `${2020 + ((i + j) % 7)}-${String(((i * 5 + j) % 12) + 1).padStart(2, "0")}-01`,
      })),
    };
  });
  return JSON.stringify(rows);
}

/** One run's CPU work, step by step. */
async function cronRun(candidates: string, catalog: string): Promise<{ total: number; steps: string; due: number }> {
  const steps: string[] = [];
  const lap = (() => {
    let last = performance.now();
    return (name: string) => {
      const now = performance.now();
      steps.push(`${name} ${(now - last).toFixed(2)}`);
      last = now;
    };
  })();
  const start = performance.now();

  const rows = parseCandidateRows(JSON.parse(candidates));
  lap("candidates");
  const entries = validRuleEntries(JSON.parse(catalog) as { slug: string }[]);
  lap("catalog");
  const { items } = collectClaimItems(rows, entries, NOW, 93);
  lap("rules");
  await batchKey(
    "dbam-due-screening-reminder",
    items.map((_, i) => i),
  );
  lap("hash");

  return { total: performance.now() - start, steps: steps.join(", "), due: items.length };
}

describe("due-screening cron run CPU", () => {
  it(`runs ${CANDIDATES} candidates cold within the budget`, async () => {
    const catalog = catalogBody();
    const slugs = (JSON.parse(catalog) as { slug: string }[]).map((row) => row.slug);
    const typical = candidatesBody(slugs, CANDIDATES, TYPICAL_COMPLETIONS);

    const cold = await cronRun(typical, catalog);
    const warm = await cronRun(typical, catalog);
    const worst = await cronRun(candidatesBody(slugs, CANDIDATES, slugs.length), catalog);
    const max = await cronRun(candidatesBody(slugs, 100, TYPICAL_COMPLETIONS), catalog);

    // eslint-disable-next-line no-console
    console.log(
      `due-screening cron run, ${CANDIDATES} candidates x ${TYPICAL_COMPLETIONS} completions, ${slugs.length} entries: ` +
        `cold ${cold.total.toFixed(2)} ms (${cold.steps}; ${cold.due} items), warm ${warm.total.toFixed(2)} ms; ` +
        `all entries done, warm ${worst.total.toFixed(2)} ms; 100 candidates, warm ${max.total.toFixed(2)} ms; ` +
        `budget ${BUDGET_MS} ms${STRICT ? " (asserted)" : " (not asserted: set PERF_ASSERT=1)"}`,
    );

    expect(cold.due).toBeGreaterThan(0);
    expect(cold.total).toBeLessThan(CI_CEILING_MS);
    if (STRICT) expect(cold.total).toBeLessThan(BUDGET_MS);
  });
});
