import path from "node:path";
import { describe, expect, it } from "vitest";

import type { CatalogEntry } from "@/lib/catalog/schema";

import {
  displayPath,
  ENTRIES_DIR,
  entryFilePath,
  findBackwardMoves,
  findDeletedSlugs,
  findReviewWarnings,
  formatIssuePath,
  formatReviewWarnings,
  listSnapshots,
  loadEntries,
  MIGRATIONS_DIR,
  parseSnapshotSlugs,
  parseSnapshotStatuses,
  renderReviewSummary,
  renderSnapshotSql,
  REPO_ROOT,
  SNAPSHOT_HEADER,
  snapshotFileName,
  validateEntry,
  type ReviewWarning,
  type Snapshot,
} from "./lib";

const { entries: REPO_ENTRIES } = loadEntries();
const [BASE_A, BASE_B] = REPO_ENTRIES.filter((entry) => entry.status === "active");

/** A copy of a real, valid entry with the given overrides. */
function entry(base: CatalogEntry, overrides: Partial<CatalogEntry>): CatalogEntry {
  return { ...structuredClone(base), ...overrides };
}

/** A snapshot rendered by the real generator, as `listSnapshots()` would return it. */
function snapshot(version: string, entries: readonly CatalogEntry[]): Snapshot {
  return {
    file: path.join(MIGRATIONS_DIR, `${version}_screening_catalog_snapshot.sql`),
    body: renderSnapshotSql(entries),
  };
}

const A = BASE_A.slug;
const B = BASE_B.slug;
const SNAP_1 = `supabase/migrations/20990101000000_screening_catalog_snapshot.sql`;
const SNAP_2 = `supabase/migrations/20990102000000_screening_catalog_snapshot.sql`;

describe("parseSnapshotStatuses", () => {
  it("reads back the status of every entry the generator rendered", () => {
    const parsed = parseSnapshotStatuses(
      renderSnapshotSql([entry(BASE_A, { status: "retired" }), entry(BASE_B, { status: "draft" })]),
    );
    expect(parsed?.unreadable).toEqual([]);
    expect(Object.fromEntries(parsed?.statuses ?? [])).toEqual({ [A]: "retired", [B]: "draft" });
  });

  it("reads every committed snapshot without an unreadable slug", () => {
    for (const { body } of listSnapshots()) {
      const parsed = parseSnapshotStatuses(body);
      expect(parsed?.unreadable).toEqual([]);
      expect(parsed?.statuses.size).toBeGreaterThan(0);
    }
  });

  it("returns null for a snapshot without a manifest", () => {
    expect(parseSnapshotStatuses("insert into public.screening_catalog (slug) values ('x');\n")).toBeNull();
  });

  it("lists a slug whose row is missing or duplicated as unreadable", () => {
    const body = renderSnapshotSql([BASE_A, BASE_B]);
    const rowStart = `  (\n    '${B}',\n    'active',\n`;
    expect(body).toContain(rowStart);

    const missing = parseSnapshotStatuses(body.replace(rowStart, `  (\n    '${B}-gone',\n    'active',\n`));
    expect(missing?.unreadable).toEqual([B]);
    expect(missing?.statuses.has(A)).toBe(true);

    const duplicated = parseSnapshotStatuses(body.replace(rowStart, `${rowStart}    'x'\n  ),\n${rowStart}`));
    expect(duplicated?.unreadable).toEqual([B]);
  });

  it("lists a manifest slug that is not a schema-valid slug as unreadable", () => {
    const body = renderSnapshotSql([BASE_A]).replace(
      `-- catalog-slug: ${A}\n`,
      `-- catalog-slug: ${A}\n-- catalog-slug: x.*\n`,
    );
    expect(parseSnapshotStatuses(body)?.unreadable).toEqual(["x.*"]);
  });
});

describe("findBackwardMoves", () => {
  const allowed: [string, CatalogEntry["status"], CatalogEntry["status"]][] = [
    ["draft → active", "draft", "active"],
    ["active → retired", "active", "retired"],
    ["draft → retired", "draft", "retired"],
    ["unchanged draft", "draft", "draft"],
    ["unchanged active", "active", "active"],
    ["unchanged retired", "retired", "retired"],
  ];
  it.each(allowed)("allows %s", (_, shipped, now) => {
    const snapshots = [snapshot("20990101000000", [entry(BASE_A, { status: shipped })])];
    expect(findBackwardMoves([entry(BASE_A, { status: now })], snapshots)).toEqual([]);
  });

  it.each(["active", "retired"] as const)("lets a new slug start as %s", (status) => {
    const snapshots = [snapshot("20990101000000", [BASE_A])];
    expect(findBackwardMoves([BASE_A, entry(BASE_B, { status })], snapshots)).toEqual([]);
  });

  const refused: [CatalogEntry["status"], CatalogEntry["status"]][] = [
    ["active", "draft"],
    ["retired", "active"],
    ["retired", "draft"],
  ];
  it.each(refused)("refuses an entry file moving %s → %s", (shipped, now) => {
    const snapshots = [snapshot("20990101000000", [entry(BASE_A, { status: shipped })])];
    expect(findBackwardMoves([entry(BASE_A, { status: now })], snapshots)).toEqual([
      `catalog/entries/${A}.json: status: "${now}" moves back from "${shipped}" (shipped in ${SNAP_1}); ` +
        "statuses move forward only: draft → active → retired",
    ]);
  });

  it("reports a demotion shipped with its regenerated snapshot once, against that snapshot", () => {
    const demoted = entry(BASE_A, { status: "draft" });
    const snapshots = [snapshot("20990101000000", [BASE_A]), snapshot("20990102000000", [demoted])];
    expect(findBackwardMoves([demoted], snapshots)).toEqual([
      `${SNAP_2}: ${A}: status "draft" moves back from "active" (in ${SNAP_1}); ` +
        "if this snapshot is not on main, delete it, restore the status and run `npm run catalog:migration`",
    ]);
  });

  it("compares with an older snapshot when the newest one does not ship the slug", () => {
    const snapshots = [snapshot("20990101000000", [BASE_A, BASE_B]), snapshot("20990102000000", [BASE_B])];
    const problems = findBackwardMoves([entry(BASE_A, { status: "draft" }), BASE_B], snapshots);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(
      `catalog/entries/${A}.json: status: "draft" moves back from "active" (shipped in ${SNAP_1})`,
    );
  });

  it("skips a snapshot without a manifest, which findDeletedSlugs reports", () => {
    const snapshots = [{ file: path.join(MIGRATIONS_DIR, "20990101000000_screening_catalog_snapshot.sql"), body: "" }];
    expect(findBackwardMoves([BASE_A], snapshots)).toEqual([]);
  });

  it("reports a status it cannot read", () => {
    const body = renderSnapshotSql([BASE_A]).replace(`    '${A}',\n`, `    '${A}-x',\n`);
    expect(
      findBackwardMoves(
        [BASE_A],
        [{ file: path.join(MIGRATIONS_DIR, "20990101000000_screening_catalog_snapshot.sql"), body }],
      ),
    ).toEqual([`${SNAP_1}: cannot read the status of ${A}; snapshots must not be hand-edited`]);
  });

  it("finds no backward move in the committed catalog", () => {
    expect(findBackwardMoves(REPO_ENTRIES, listSnapshots())).toEqual([]);
  });
});

describe("findReviewWarnings", () => {
  const TODAY = "2027-09-29";

  it("flags an active entry whose review date is before today", () => {
    expect(findReviewWarnings([entry(BASE_A, { next_review_due: "2027-09-28" })], TODAY)).toEqual([
      { slug: A, kind: "overdue", due: "2027-09-28" },
    ]);
  });

  it.each(["2027-09-29", "2027-09-30"])("does not flag a review due on %s", (due) => {
    expect(findReviewWarnings([entry(BASE_A, { next_review_due: due })], TODAY)).toEqual([]);
  });

  it.each([null, undefined])("flags an active entry with a %s review date as missing", (due) => {
    expect(findReviewWarnings([entry(BASE_A, { next_review_due: due })], TODAY)).toEqual([
      { slug: A, kind: "missing", due: null },
    ]);
  });

  it.each(["draft", "retired"] as const)("never flags a %s entry", (status) => {
    const entries = [
      entry(BASE_A, { status, next_review_due: "2020-01-01" }),
      entry(BASE_B, { status, next_review_due: null }),
    ];
    expect(findReviewWarnings(entries, TODAY)).toEqual([]);
  });

  it("sorts the warnings by slug", () => {
    const entries = [entry(BASE_B, { next_review_due: null }), entry(BASE_A, { next_review_due: "2020-01-01" })];
    expect(findReviewWarnings(entries, TODAY).map((warning) => warning.slug)).toEqual([A, B].sort());
  });
});

describe("formatReviewWarnings", () => {
  const overdue: ReviewWarning = { slug: A, kind: "overdue", due: "2027-09-29" };
  const missing: ReviewWarning = { slug: B, kind: "missing", due: null };

  it("prints nothing without warnings", () => {
    expect(formatReviewWarnings([], false)).toEqual([]);
    expect(formatReviewWarnings([], true)).toEqual([]);
  });

  it("prints one plain line per warning outside GitHub Actions", () => {
    expect(formatReviewWarnings([overdue, missing], false)).toEqual([
      `warning: catalog/entries/${A}.json: next_review_due: review overdue since 2027-09-29; re-review and set a new stamp`,
      `warning: catalog/entries/${B}.json: next_review_due: missing on an active entry; set a review date`,
    ]);
  });

  it("adds exactly one annotation under GitHub Actions, however many entries fall due", () => {
    // More entries fall due on one day than GitHub keeps annotations for (10 per step).
    const warnings = Array.from({ length: 19 }, (_, i): ReviewWarning => ({
      slug: `entry-${i}`,
      kind: "overdue",
      due: "2027-09-29",
    }));
    const lines = formatReviewWarnings(warnings, true);
    expect(lines.filter((line) => line.startsWith("warning: "))).toHaveLength(19);
    const annotations = lines.filter((line) => line.startsWith("::"));
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatch(/^::warning title=Catalog review due::19 active catalog entries need review: /);
  });

  it("uses the singular for one entry", () => {
    expect(formatReviewWarnings([overdue], true).at(-1)).toBe(
      `::warning title=Catalog review due::1 active catalog entry needs review: ${A}`,
    );
  });
});

describe("renderReviewSummary", () => {
  it("is empty without warnings", () => {
    expect(renderReviewSummary([])).toBe("");
  });

  it("lists every warning under one heading", () => {
    expect(
      renderReviewSummary([
        { slug: A, kind: "overdue", due: "2027-09-29" },
        { slug: B, kind: "missing", due: null },
      ]),
    ).toBe(
      [
        "### Catalog entries due for review",
        "",
        `- \`${A}\`: review overdue since 2027-09-29`,
        `- \`${B}\`: missing on an active entry`,
        "",
      ].join("\n"),
    );
  });
});

describe("displayPath and entryFilePath", () => {
  it("shows a repo-relative path with forward slashes", () => {
    expect(displayPath(path.join(REPO_ROOT, "catalog", "x.json"))).toBe("catalog/x.json");
  });

  it("puts an entry file in the entries directory", () => {
    expect(entryFilePath("x")).toBe(path.join(ENTRIES_DIR, "x.json"));
  });
});

describe("formatIssuePath", () => {
  it.each([
    { issuePath: [], expected: "(entry)" },
    { issuePath: ["eligibility", 0, "requires", 1, "factor"], expected: "eligibility[0].requires[1].factor" },
    { issuePath: [0, "slug"], expected: "[0].slug" },
  ])("$issuePath → $expected", ({ issuePath, expected }) => {
    expect(formatIssuePath(issuePath)).toBe(expected);
  });
});

describe("validateEntry", () => {
  it("accepts a valid entry whose slug matches the file name", () => {
    expect(validateEntry("label", A, structuredClone(BASE_A))).toEqual({ ok: true, entry: BASE_A });
  });

  it("rejects a slug that does not match the file name", () => {
    expect(validateEntry("label", "other", structuredClone(BASE_A))).toEqual({
      ok: false,
      problems: [`label: slug: "${A}" does not match the file name (expected "other")`],
    });
  });

  it("prefixes every schema problem with the file label", () => {
    const result = validateEntry("label", "x", {});
    expect(result.ok).toBe(false);
    const problems = result.ok ? [] : result.problems;
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(problem.startsWith("label: ")).toBe(true);
  });
});

describe("renderSnapshotSql", () => {
  it("throws on an empty list", () => {
    expect(() => renderSnapshotSql([])).toThrow("no entries to render");
  });

  it("starts with the generated-file header", () => {
    expect(renderSnapshotSql([BASE_A]).split("\n").slice(0, SNAPSHOT_HEADER.length)).toEqual(SNAPSHOT_HEADER);
  });

  it("doubles single quotes and keeps backslashes and $$ literal", () => {
    expect(renderSnapshotSql([entry(BASE_A, { name_pl: "O'Brien \\ $$" })])).toContain("\n    'O''Brien \\ $$',\n");
  });

  it("renders jsonb columns as quoted JSON cast to jsonb", () => {
    const json = JSON.stringify(BASE_A.eligibility).replaceAll("'", "''");
    expect(renderSnapshotSql([BASE_A])).toContain(`\n    '${json}'::jsonb,\n`);
  });

  it("throws on a NUL character, which Postgres text cannot store", () => {
    expect(() => renderSnapshotSql([entry(BASE_A, { name_pl: "a\0b" })])).toThrow("NUL character");
  });

  it("throws on a non-integer number", () => {
    expect(() => renderSnapshotSql([entry(BASE_A, { evidence_level: 1.5 })])).toThrow(
      "evidence_level: expected an integer",
    );
  });

  it("is byte-identical whatever the input order", () => {
    expect(renderSnapshotSql([BASE_B, BASE_A])).toBe(renderSnapshotSql([BASE_A, BASE_B]));
  });

  it("never updates the slug on conflict", () => {
    const sql = renderSnapshotSql([BASE_A]);
    expect(sql).toContain("  name_pl = excluded.name_pl");
    expect(sql).not.toContain("slug = excluded.slug");
  });
});

describe("parseSnapshotSlugs", () => {
  it("returns null without a manifest", () => {
    expect(parseSnapshotSlugs("insert into public.screening_catalog (slug) values ('x');\n")).toBeNull();
  });

  it("reads back the sorted slugs the generator listed", () => {
    expect(parseSnapshotSlugs(renderSnapshotSql([BASE_B, BASE_A]))).toEqual([A, B].sort());
  });

  it("ignores a manifest-like line inside entry text", () => {
    const sql = renderSnapshotSql([entry(BASE_A, { name_pl: "x\n-- catalog-slug: injected" }), BASE_B]);
    expect(parseSnapshotSlugs(sql)).toEqual([A, B].sort());
  });
});

describe("findDeletedSlugs", () => {
  const snapshots = [snapshot("20990101000000", [BASE_A, BASE_B]), snapshot("20990102000000", [BASE_A, BASE_B])];

  it("finds nothing when every shipped slug has a file", () => {
    expect(findDeletedSlugs([A, B], snapshots)).toEqual([]);
  });

  it("reports a deleted slug once, naming the first snapshot that shipped it", () => {
    expect(findDeletedSlugs([A], snapshots)).toEqual([
      `catalog/entries/${B}.json: missing, but ${SNAP_1} shipped it; ` +
        `restore the file and set "status": "retired" instead of deleting it`,
    ]);
  });

  it("reports a snapshot without a manifest", () => {
    const handEdited = { file: path.join(MIGRATIONS_DIR, "20990103000000_screening_catalog_snapshot.sql"), body: "" };
    expect(findDeletedSlugs([A, B], [handEdited])).toEqual([
      `supabase/migrations/20990103000000_screening_catalog_snapshot.sql: no "-- catalog-slug:" manifest; ` +
        "snapshots must not be hand-edited",
    ]);
  });
});

describe("snapshotFileName", () => {
  it("stamps the UTC time to the second", () => {
    expect(snapshotFileName(new Date("2026-01-02T03:04:05.678Z"))).toBe(
      "20260102030405_screening_catalog_snapshot.sql",
    );
  });
});
