# Catalog check guards Implementation Plan

## Overview

Roadmap F-17 (backlog B-14 + B-15, owner answers Q-02 and Q-06) adds two guards to `npm run catalog:check`:

1. It **fails** when a catalog entry's status moves backwards. Entries move forward only: draft → active → retired, with draft → retired allowed.
2. It **warns, without ever failing**, for every active entry whose `next_review_due` is in the past or missing.

`catalog:migration` refuses the same backward moves, so a demoting snapshot is never generated. `catalog/README.md` documents the allowed moves. This closes drift D-02 and D-08 (`context/domain/domain-distillation.md:216,222`).

## Current State Analysis

- `catalog:check` validates entries and the published JSON Schema, reports deleted slugs across all snapshots, and compares the rendered SQL with the **newest** snapshot only (`scripts/catalog/check.ts:15-38`). Its output is either a failure (stderr, `exit(1)`) or a single pass line; it has no warning channel (`check.ts:40-46`).
- Every snapshot upsert sets `status = excluded.status` with no transition check (`supabase/migrations/20260929165522_screening_catalog_snapshot.sql:530`). An active → draft move removes the entry from every user-facing read: RLS shows only `active`/`retired` (`20260928153742_screening_catalog.sql:67`), plan and done entries load via `.in("status", ["active", "retired"])` (`src/lib/catalog/read.ts:50`), and recommendations and the cron read `active` only (`read.ts:35,77`).
- `next_review_due` is stored and validated as a nullable date (`src/lib/catalog/schema.ts:248`); nothing reads it for a decision.
- Data today: 19 active entries, all with `next_review_due` = `2027-09-29`, and 1 draft (`lung-ldct-nfz-program`) with no review fields. The 3 committed snapshots carry the same statuses, so there are no backward moves in history (research Summary).

## Desired End State

- On the current tree, `npm run catalog:check` exits 0. Its pass line also reports the number of review warnings (0 today).
- An entry file whose status is below the status it had in any earlier snapshot makes `catalog:check` exit 1, with a message naming the file. `catalog:migration` refuses to write a snapshot for it.
- A snapshot whose status for a slug is below the previous snapshot's status is reported against that snapshot file. This covers a demotion committed together with its regenerated snapshot.
- Each active entry with `next_review_due < today` (Warsaw date), or with no `next_review_due`, prints one warning line. Under GitHub Actions the run also emits exactly one `::warning` annotation and a step-summary list. The exit code never changes because of warnings.
- `catalog/README.md` lists the allowed moves and the review warning. `CLAUDE.md`'s catalog hard rule adds "never move a status backwards" and keeps "never delete an entry" word for word.

### Key Discoveries:

- Snapshot rows have a deterministic layout: slug first, then status, one value per line (`scripts/catalog/lib.ts:182-185`, observed at `…165522_screening_catalog_snapshot.sql:49-51`).
- `findDeletedSlugs(fileSlugs, snapshots)` (`lib.ts:251-271`) is the pattern to follow: a pure function, data in, messages out, called by both CLIs.
- `listSnapshots()` returns snapshots oldest first (`lib.ts:229-238`).
- `warsawToday(now: Date): string` already exists (`src/lib/screenings/rules.ts:55`).
- `CATALOG_STATUSES = ["draft", "active", "retired"]` (`src/lib/catalog/schema.ts:13`).
- Vitest collects `scripts/**/*.test.ts` (`vitest.config.ts`); there is no catalog-script test file yet.
- CI checks out at depth 1 (`.github/workflows/ci.yml:20`), and the `ci` job runs `catalog:check` without a database (`ci.yml:26`).

## What We're NOT Doing

- No database trigger or constraint on status transitions. The roadmap names `catalog:check` as the guard.
- No change to the snapshot format, the manifest or `renderSnapshotSql`. A change there would force a no-op catalog migration to production.
- No scheduled CI run for review dates. The warning shows on every `ci` run (PRs and pushes to `main`).
- No hiding of overdue entries from users (Q-06), and no warnings for draft or retired entries.
- No grandfather or allow list for historical backward moves, because none exist.
- No tests for the rest of the catalog scripts: F-19 extends the same test file later.
- No edits to `context/domain/domain-distillation.md` (the next distillation run re-scores D-02/D-08) and no `roadmap.md` status change.

## Implementation Approach

The previous status comes from the **committed snapshot chain**. For each slug, walk its status through every snapshot, oldest first, and then through its current entry file. The status rank must never drop (draft 0 < active 1 < retired 2), and a slug's first appearance may have any status. Both guards are pure functions in `scripts/catalog/lib.ts`, with "today" passed in. The CLIs only do the I/O: read the clock, read env, print and exit.

## Critical Implementation Details

- **Strict status parse.** Text fields may contain newlines (`schema.ts:28-32`), so a snapshot must yield exactly one row-start match per manifest slug. If it yields zero or more than one, report the snapshot as unreadable; never guess. Skip a snapshot with no manifest, since `findDeletedSlugs` already reports it and a second message would be a duplicate.
- **Annotation cap.** GitHub keeps only 10 warning annotations per step (community-documented, research "External evidence"). All 19 active entries go overdue on the same day, so per-entry annotations would be silently truncated. Emit one summary annotation; the full list goes to the log and the step summary.
- **Warnings print before the outcome.** Print them on both the failing and the passing path, and never add them to `problems`.

## Phase 1: Pure guards with unit tests

### Overview

Add the status-chain guard and the review-date warning as pure functions in `scripts/catalog/lib.ts`, covered by a new colocated test file. No CLI behaviour changes yet.

### Changes Required:

#### 1. Snapshot status parse and backward-move guard

**File**: `scripts/catalog/lib.ts`

**Intent**: Read each slug's shipped status from a snapshot's VALUES, then report every step down in rank: between consecutive snapshots, and between the newest snapshot that ships a slug and its entry file.

**Contract**:

- `parseSnapshotStatuses(sql: string): { statuses: Map<string, CatalogStatus>; unreadable: string[] } | null`. Returns null when the snapshot has no manifest (reuse `parseSnapshotSlugs`). `unreadable` lists the manifest slugs without exactly one match.
- `findBackwardMoves(entries: readonly CatalogEntry[], snapshots: readonly Snapshot[]): string[]`. Snapshots are oldest first; entries are the valid ones from `loadEntries`.
- An explicit rank for draft < active < retired, so the ordering does not depend on the array position of `CATALOG_STATUSES`.
- Message for an entry file: `catalog/entries/<slug>.json: status: "<now>" moves back from "<was>" (shipped in <snapshot>); statuses move forward only: draft → active → retired`.
- Message for a snapshot: `<snapshot>: <slug>: status "<now>" moves back from "<was>" (in <previous snapshot>); if this snapshot is not on main, delete it, restore the status and run \`npm run catalog:migration\``.
- Unreadable status: `<snapshot>: cannot read the status of <slug>; snapshots must not be hand-edited`.
- Row start, per slug (the slug is `[a-z0-9-]`, so no regex escaping is needed beyond the literal):

  ```ts
  new RegExp(`^  \\(\\n    '${slug}',\\n    '(draft|active|retired)',$`, "gm");
  ```

#### 2. Review-date warning

**File**: `scripts/catalog/lib.ts`

**Intent**: List the active entries whose review is overdue or has no date, and format them for a terminal or for GitHub Actions without exceeding the annotation cap.

**Contract**:

- `ReviewWarning = { slug: string; kind: "overdue" | "missing"; due: string | null }`.
- `findReviewWarnings(entries: readonly CatalogEntry[], today: string): ReviewWarning[]`. `today` is `YYYY-MM-DD`. Only `status === "active"` entries are checked. `overdue` means `next_review_due < today` (string comparison of ISO dates); `missing` means `next_review_due` is null or undefined. The result is sorted by slug.
- `formatReviewWarnings(warnings: readonly ReviewWarning[], github: boolean): string[]`. The returned lines go to stdout.
  - One line per warning: `warning: catalog/entries/<slug>.json: next_review_due: review overdue since <due>; re-review and set a new stamp`, or `… next_review_due: missing on an active entry; set a review date`.
  - When `github` is true, also exactly one `::warning title=Catalog review due::<n> active catalog entries need review: <slug, slug, …>` (singular for one: `1 active catalog entry needs review: <slug>`).
  - An empty list returns `[]`.
- `renderReviewSummary(warnings): string`: a Markdown list for `$GITHUB_STEP_SUMMARY` (heading plus one bullet per entry); `[]` renders an empty string.
- Output carries only slugs and ISO dates, never entry free text, so workflow-command injection is impossible.

#### 3. Unit tests

**File**: `scripts/catalog/lib.test.ts` (new)

**Intent**: Pin both guards with fixtures built from real entries (`loadEntries()`, cloned with a changed `status`/`next_review_due`) and snapshots rendered by `renderSnapshotSql`, so the parse is tested against the real renderer.

**Contract**: the cases are listed under Testing Strategy. One case asserts that `findBackwardMoves(loadEntries().entries, listSnapshots())` returns `[]` on the committed tree.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the new `scripts/catalog/lib.test.ts`
- `npm run lint` passes with no errors in `scripts/catalog/`
- `npx astro sync && npx astro check` reports 0 errors
- `npm run catalog:check` still exits 0 (CLI unchanged in this phase)

**Implementation Note**: Phase 1 has no manual checks; continue to Phase 2 once the automated checks are green.

---

## Phase 2: Wire the guards into the CLIs and document them

### Overview

Make `catalog:check` fail on backward moves and print review warnings, make `catalog:migration` refuse backward moves, and document both.

### Changes Required:

#### 1. `catalog:check`

**File**: `scripts/catalog/check.ts`

**Intent**: Add `findBackwardMoves(entries, snapshots)` to `problems` right after `findDeletedSlugs`, before the drift check. Compute review warnings from `warsawToday(new Date())` and print them before the outcome, on both paths.

**Contract**:

- `github = process.env.GITHUB_ACTIONS === "true"`.
- When `github` is true, `warnings.length > 0` and `GITHUB_STEP_SUMMARY` is set, append `renderReviewSummary` to that file.
- The pass line becomes `catalog:check passed: <n> entries, <snapshot note>, <k> review warning(s)`.
- Exit code: 1 only when `problems` is non-empty; warnings never affect it.
- Update the header comment (`check.ts:1-2`) to name both new guards.

#### 2. `catalog:migration`

**File**: `scripts/catalog/migration.ts`

**Intent**: Refuse to write a snapshot when an entry moves backwards, through the existing refusal path.

**Contract**: push `findBackwardMoves(entries, snapshots)` into `problems` next to `findDeletedSlugs` (`migration.ts:24`). No review warnings here. Update the header comment.

#### 3. Docs

**File**: `catalog/README.md`

**Intent**: Turn the Lifecycle section into the documented transition rule, and tell the owner about the review warning.

**Contract**:

- Lifecycle (`README.md:9-17`):
  - Allowed: draft → active, active → retired, draft → retired; an unchanged status is always allowed.
  - A new slug may start with any status.
  - Refused: active → draft, retired → active, retired → draft. `catalog:check` and `catalog:migration` refuse these, comparing against every committed snapshot.
  - Retired is final and the check has no override. Reversing a wrong retirement needs a code change to the guard in `scripts/catalog/lib.ts`, recorded as an owner decision.
  - Keep the "Never delete an entry" paragraph unchanged.
- Add a short "Review dates" note: `catalog:check` warns, never fails, for each active entry past its `next_review_due` or without one. Under CI that is one annotation plus a step-summary list. Users still see the entry.
- Shipping changes, step 2: mention the warnings.

**File**: `CLAUDE.md`

**Intent**: Keep the agent-facing hard rule in sync.

**Contract**: in the "Screening catalog rows change only through …" bullet, keep "never delete an entry: set `"status": "retired"`" verbatim and add that a status never moves backwards (draft → active → retired; `catalog:check` refuses it).

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint` and `npx astro check` pass
- `npm run catalog:check` exits 0 on the committed tree and prints `0 review warning(s)`
- Demotion break: set `catalog/entries/colonoscopy-nfz-program.json` to `"status": "draft"`. `npm run catalog:check` exits 1 with the `moves back from "active"` message for that file, and `npm run catalog:migration` exits 1 without writing a file. In the same break, also set another active entry's `next_review_due` to `2026-01-01`: `catalog:check` still prints its `warning:` line, and the exit code is 1 because of the demotion alone (the warning is not listed among the problems). Restore with `git checkout -- catalog/entries`.
- Overdue break: set one active entry's `next_review_due` to `2026-01-01` and run `npm run catalog:migration`. Then `GITHUB_ACTIONS=true GITHUB_STEP_SUMMARY=<scratch file> npm run catalog:check` exits 0, prints one `warning:` line and exactly one `::warning` line, and writes the summary file. Restore: delete the generated snapshot and run `git checkout -- catalog/entries`. `git status` is clean afterwards.
- `npx prettier --check catalog/README.md CLAUDE.md` passes

#### Manual Verification:

- PR Manual checks: the PR's `ci` job is green, and its `catalog:check` step log shows the pass line with `0 review warning(s)`
- PR Manual checks: the owner reads the new Lifecycle and Review dates wording in `catalog/README.md` and confirms it matches the Q-02/Q-06 answers

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

`scripts/catalog/lib.test.ts`:

- `parseSnapshotStatuses`:
  - round-trips the statuses of `renderSnapshotSql(fixtures)`;
  - returns null without a manifest;
  - lists a slug as unreadable when its row is missing or duplicated.
- `findBackwardMoves` allows:
  - draft → active, active → retired, draft → retired;
  - an unchanged status;
  - a new slug that starts as active or as retired.
- `findBackwardMoves` refuses:
  - an entry going active → draft, retired → active or retired → draft against the newest snapshot (one message naming the entry file);
  - a demotion between snapshot 1 and snapshot 2 when the entries equal snapshot 2 (exactly one message, naming snapshot 2), so the newest-only blind spot is closed;
  - a demotion relative to an **older** snapshot when the slug is absent from the newest one, which the chain still catches.
- `findBackwardMoves` also:
  - skips a snapshot with no manifest (no duplicate of `findDeletedSlugs`);
  - reports an unreadable status;
  - returns `[]` on the committed repo tree.
- `findReviewWarnings`:
  - an active entry with due < today → `overdue`;
  - due == today and due > today → nothing;
  - an active entry with a null due → `missing`;
  - draft and retired entries past due → nothing.
- `formatReviewWarnings`:
  - `[]` → `[]`;
  - `github: false` → no line starts with `::`;
  - 19 warnings with `github: true` → exactly one `::warning` line ("19 active catalog entries need review") plus 19 `warning:` lines;
  - 1 warning with `github: true` → the singular "1 active catalog entry needs review".
- `renderReviewSummary`:
  - one heading plus one bullet per warning, naming the slug and its due date or "missing";
  - `[]` → empty string.

### Integration Tests:

- None beyond the CLI break checks in Phase 2 (pgTAP, smoke and e2e are untouched).

### Manual Testing Steps:

1. Read the PR's `ci` job log for the `catalog:check` step.
2. The owner proofreads the README Lifecycle and Review dates sections.

## Migration Notes

No migration and no snapshot. Entry files and `renderSnapshotSql` stay untouched, so the drift check keeps matching `20260929165522_screening_catalog_snapshot.sql`.

## References

- Research: `context/changes/catalog-check-guards/research.md`
- Decisions: `context/changes/catalog-check-guards/decisions.md`
- Pattern: `scripts/catalog/lib.ts:251-271` (`findDeletedSlugs`)
- Roadmap: `context/foundation/roadmap.md:89-100` (F-17)
- Owner answers: `context/domain/domain-distillation.md:262,266` (Q-02, Q-06)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pure guards with unit tests

#### Automated

- [ ] 1.1 `npm test` passes, including the new `scripts/catalog/lib.test.ts`
- [ ] 1.2 `npm run lint` passes with no errors in `scripts/catalog/`
- [ ] 1.3 `npx astro sync && npx astro check` reports 0 errors
- [ ] 1.4 `npm run catalog:check` still exits 0 (CLI unchanged in this phase)

### Phase 2: Wire the guards into the CLIs and document them

#### Automated

- [ ] 2.1 `npm test`, `npm run lint` and `npx astro check` pass
- [ ] 2.2 `npm run catalog:check` exits 0 on the committed tree and prints `0 review warning(s)`
- [ ] 2.3 Demotion break: `catalog:check` and `catalog:migration` both exit 1 for an active → draft entry; tree restored
- [ ] 2.4 Overdue break: `catalog:check` exits 0 with one `warning:` line, exactly one `::warning` line and a step summary; tree restored and clean
- [ ] 2.5 `npx prettier --check catalog/README.md CLAUDE.md` passes

#### Manual

- [ ] 2.6 PR Manual checks: the PR's `ci` job is green and the `catalog:check` log shows `0 review warning(s)`
- [ ] 2.7 PR Manual checks: owner confirms the README Lifecycle and Review dates wording matches Q-02/Q-06
