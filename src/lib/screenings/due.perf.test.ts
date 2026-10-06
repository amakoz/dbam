import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CatalogEntrySchema, type CatalogEntry } from "@/lib/catalog/schema";
import { DUE_CANDIDATE_LIMIT, dueScreeningItems, type DueCandidate } from "@/lib/screenings/due";

// Kept in its own file so Vitest runs it in a fresh worker: the cold call is the interesting one, because a Workers
// cron run starts cold and has a 10 ms CPU cap on the free plan. The numbers come from Node/V8, not workerd, so they
// are indicative; production CPU stays a manual check of the scheduled invocation (plan 3.8).

const COLD_BUDGET_MS = 5;
const CANDIDATES = DUE_CANDIDATE_LIMIT;
const MAX_CANDIDATES = 100; // the SQL cap, logged for reference
// A candidate holds a handful of done exams, not the whole catalog; the worst case (every fixed entry) is logged too.
const TYPICAL_COMPLETIONS = 6;
const NOW = new Date("2027-03-10T09:00:00Z");

function loadCatalog(): CatalogEntry[] {
  const dir = path.join(process.cwd(), "catalog", "entries");
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => CatalogEntrySchema.parse(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))));
}

/** Spreads sex, age, smoking and anchors across users; each holds `completions` fixed-interval exams. */
function syntheticCandidates(entries: CatalogEntry[], completions: number, count: number): DueCandidate[] {
  const fixed = entries.filter((entry) => entry.interval_kind === "fixed");
  return Array.from({ length: count }, (_, i): DueCandidate => {
    const smoker = i % 3 === 0;
    return {
      profile: {
        birth_year: 1950 + (i % 50),
        sex: i % 2 === 0 ? "female" : "male",
        smoking_status: smoker ? "former" : "never",
        pack_years: smoker ? 20 + (i % 30) : null,
        years_since_quitting: smoker ? i % 15 : null,
      },
      completions: Array.from({ length: Math.min(completions, fixed.length) }, (_, j) => ({
        catalog_slug: fixed[(i + j) % fixed.length].slug,
        anchor_month: `${2020 + ((i + j) % 7)}-${String(((i * 5 + j) % 12) + 1).padStart(2, "0")}-01`,
      })),
    };
  });
}

function time(candidates: DueCandidate[], entries: CatalogEntry[]): { ms: number; due: number } {
  const start = performance.now();
  let due = 0;
  for (const candidate of candidates) due += dueScreeningItems(candidate, entries, NOW).length;
  return { ms: performance.now() - start, due };
}

describe("dueScreeningItems timing", () => {
  it(`runs ${CANDIDATES} candidates cold in under ${COLD_BUDGET_MS} ms`, () => {
    const entries = loadCatalog();
    const typical = syntheticCandidates(entries, TYPICAL_COMPLETIONS, CANDIDATES);

    const cold = time(typical, entries);
    const warm = time(typical, entries);
    const worst = time(syntheticCandidates(entries, entries.length, CANDIDATES), entries);
    const max = time(syntheticCandidates(entries, TYPICAL_COMPLETIONS, MAX_CANDIDATES), entries);

    // eslint-disable-next-line no-console
    console.log(
      `dueScreeningItems x${CANDIDATES}, ${entries.length} entries, ${TYPICAL_COMPLETIONS} completions each: ` +
        `cold ${cold.ms.toFixed(2)} ms, warm ${warm.ms.toFixed(2)} ms (${cold.due} due items); ` +
        `worst case, every fixed entry done, warm: ${worst.ms.toFixed(2)} ms (${worst.due} due items); ` +
        `${MAX_CANDIDATES} candidates, after warm-up: ${max.ms.toFixed(2)} ms`,
    );
    expect(cold.due).toBeGreaterThan(0);
    expect(cold.ms).toBeLessThan(COLD_BUDGET_MS);
  });
});
