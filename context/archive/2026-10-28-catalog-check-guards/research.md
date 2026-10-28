---
date: 2026-10-28T09:46:04+0100
researcher: Claude (worker, Opus 5.5)
git_commit: de5ef64
branch: feat/catalog-check-guards
repository: 10xdevs (Dbam)
topic: "catalog:check guards: forward-only status moves and an advisory review-date warning (F-17)"
tags: [research, codebase, catalog, scripts-catalog, ci]
status: complete
last_updated: 2026-10-28
last_updated_by: Claude (worker, Opus 5.5)
---

# Research: catalog:check guards (F-17)

**Date**: 2026-10-28T09:46:04+0100
**Researcher**: Claude (worker, Opus 5.5)
**Git Commit**: de5ef64
**Branch**: feat/catalog-check-guards
**Repository**: 10xdevs (Dbam)

## Research Question

Roadmap F-17 (`context/foundation/roadmap.md:89-100`): `catalog:check` must fail on a backward status move (anything other than draft → active → retired), the allowed moves must be documented in `catalog/README.md`, and CI must print a warning, never a failure, for every entry past its `next_review_due`. Owner answers: Q-02 "Catalog entries move forward only … `catalog:check` should refuse backward moves (B-14)" (`context/domain/domain-distillation.md:262`) and Q-06 "Flag to the owner (`catalog:check` warning in CI, B-15); do not hide from users" (`domain-distillation.md:266`).

Questions to answer:

1. Where does `catalog:check` get each entry's **previous** status, given that CI has no database and a shallow checkout?
2. How do you show a warning in CI that stays visible but does not fail the job?
3. Where should the pure logic live so that "now" is a parameter and it can be unit-tested?
4. What existing guarantees must stay intact (the never-delete rule, the drift check, the snapshot format)?

## Summary

- **Baseline = the committed snapshot chain.** Each `*_screening_catalog_snapshot.sql` stores every entry's full row, `status` included, in a fixed layout. Walk each slug's statuses through the snapshots (oldest first), then the current entry file, and fail at the first step down in rank (draft 0 < active 1 < retired 2). You need the chain, not just the newest snapshot. A demotion committed **together with** its regenerated snapshot leaves the newest snapshot equal to the entry files, so a newest-only comparison passes it (`scripts/catalog/check.ts:29-38` compares only `newest`).
- **Git history and the DB can't serve as baseline.** CI checks out at depth 1 (`.github/workflows/ci.yml:20`, `actions/checkout@v4` with no `fetch-depth`), and the `ci` job that runs `catalog:check` (`ci.yml:26`) has no Supabase.
- **History is clean today.** In all 3 snapshots, the row-start pattern `  (\n    '<slug>',\n    '<status>',` matches exactly 20 rows, one for each of the 20 manifest slugs. The status sequence for each slug is identical across the three: 19 `active`, 1 `draft` (`lung-ldct-nfz-program`). Entry files today have the same statuses. A chain check would pass on `main` as it stands, so no grandfathering list is needed.
- **Parse the status from the VALUES; don't change the snapshot format.** Any change to `renderSnapshotSql()` changes its bytes. The drift check would then flag the current newest snapshot (`check.ts:33`), and this PR would have to ship a no-op catalog migration to production. The renderer's layout is deterministic (`scripts/catalog/lib.ts:182-185`: slug first, status second, one value per line). Text fields may contain newlines (`src/lib/catalog/schema.ts:28-32`), so require **exactly one** row-start match per manifest slug and report a snapshot that doesn't fit.
- **Warning:** print `::warning file=…,title=…::…` when `GITHUB_ACTIONS === "true"`, and plain text otherwise; the exit code stays 0. GitHub keeps **at most 10 warning annotations per step** (community-documented, see External evidence). All 19 active entries share `next_review_due` = `2027-09-29`, so they will all go overdue on the same day. Emit one summary annotation, list every entry in the log, and optionally write them to `$GITHUB_STEP_SUMMARY`.
- **"Today":** `warsawToday(now: Date)` already exists (`src/lib/screenings/rules.ts:55`). A pure `findOverdueReviews(entries, today)` in `scripts/catalog/lib.ts` keeps the date rule unit-testable. Vitest already collects `scripts/**/*.test.ts` (`vitest.config.ts`), but there is no catalog-script test file yet.
- **`catalog:migration` should share the guard.** It already refuses on `findDeletedSlugs` (`scripts/catalog/migration.ts:22-27`); adding the transition check there stops a demoting snapshot from being generated at all.

## Detailed Findings

### How the catalog tooling works today

- `check.ts` validates the entries (`loadEntries`), checks that the published JSON Schema is current (`check.ts:17-22`), reports deleted slugs across **all** snapshots (`check.ts:24-25`), then compares the rendered SQL byte for byte with the **newest** snapshot only (`check.ts:27-38`). It has no output channel for warnings: it prints problems to stderr and calls `exit(1)` (`check.ts:40-43`), or prints one pass line to stdout (`check.ts:45-46`).
- `migration.ts` refuses on invalid or deleted entries (`migration.ts:22-27`) and when nothing changed (`migration.ts:32-34`). Otherwise it writes a new snapshot with the current UTC time as its version (`migration.ts:36-43`; it takes `new Date()` inline).
- `lib.ts` has no side effects on import (`lib.ts:12`) and keeps the pure helpers that both CLIs share: `parseSnapshotSlugs` (`lib.ts:217-221`, which reads the header manifest only) and `findDeletedSlugs(fileSlugs, snapshots)` (`lib.ts:251-271`, whose inputs are data, which is the shape the new guard should copy). `listSnapshots()` returns snapshots oldest first (`lib.ts:229-238`).
- Each snapshot sets `status = excluded.status` in an `on conflict … do update` (`supabase/migrations/20260929165522_screening_catalog_snapshot.sql:530`). That is the unguarded overwrite behind drift D-02 (`domain-distillation.md:216`).

### Why the status matters to users (consequence of a demotion)

- The RLS read policy exposes only `status in ('active', 'retired')` (`supabase/migrations/20260928153742_screening_catalog.sql:67`). Entries a user's plan or done record points at load through `getCatalogEntries`, which filters `.in("status", ["active", "retired"])` (`src/lib/catalog/read.ts:50`). Recommendations and the cron read `active` only (`read.ts:35`, `read.ts:77`). After active → draft, the entry disappears from all three reads. After retired → active, a retired entry starts being recommended again. Q-02 forbids both moves.
- The table constraint only checks that the status value is valid (`20260928153742_screening_catalog.sql:34`); the database has no transition guard. A DB trigger is out of scope: the roadmap names `catalog:check` as the guard (`roadmap.md:91`).

### Baseline options for "previous status"

| Option                                                                                | Works in CI?                           | Catches demotion + regenerated snapshot in one PR?  | Notes                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Snapshot chain: statuses parsed from every snapshot's VALUES, then the entry files | yes, file-only                         | yes                                                 | no format change; layout fixed by `lib.ts:182-185`                                                                                                                                                |
| B. Newest snapshot vs entry files only                                                | yes                                    | **no**: newest == entries after `catalog:migration` | too weak                                                                                                                                                                                          |
| C. Add status to the manifest (`-- catalog-slug: <slug> <status>`)                    | yes                                    | yes, with a chain walk                              | changes `renderSnapshotSql` → the newest snapshot drifts (`check.ts:33`), a no-op snapshot ships to prod; old snapshots still need A; `MANIFEST_LINE` (`lib.ts:27`) and `draft.ts:181` change too |
| D. `git show origin/main:catalog/entries/…`                                           | **no**: depth-1 checkout (`ci.yml:20`) | depends on remote state                             | rejected                                                                                                                                                                                          |
| E. Production DB                                                                      | **no**: the `ci` job has no DB         | —                                                   | rejected                                                                                                                                                                                          |

Recommended: **A**. A row starts with `  (` followed by the slug literal and then the status literal, each on its own line indented 4 spaces (`lib.ts:185`, observed at `20260929165522_…:49-51`). Slugs match `[a-z0-9-]` (`lib.ts:299`), so the slug literal needs no escaping. Running that regex on each of the 3 snapshots gives exactly 20 matches, one per manifest slug (inspected 2026-10-28).

Chain semantics:

- A slug's first appearance can have **any** status. A new entry has no previous status, which avoids the roadmap risk of "block[ing] legitimate first activations" (`roadmap.md:99`).
- Each later step must keep or raise the rank.
- If the drop is in an entry file, report it against `catalog/entries/<slug>.json`.
- If the drop is between two snapshots, report it against the later snapshot file. The fix is the existing "delete your unshipped snapshot and regenerate" flow (`catalog/README.md`, "When two catalog PRs overlap"). A demoting snapshot that already reached production could never be fixed by editing, because snapshots are immutable. Today none exists (see Summary), and the guard in `catalog:migration` keeps it that way.
- Retired is terminal: no retired → active move. This follows Q-02's "forward only" (`domain-distillation.md:262`).

### Review-date warning

- `next_review_due` is a nullable ISO date (`schema.ts:34`, `schema.ts:248`). The review stamp requires only `reviewed_by` and `last_reviewed` on active entries (`schema.ts:194-204`). Nothing reads `next_review_due` for a decision (D-08, `domain-distillation.md:222`).
- Current data (20 entry files): 19 are `active`, all with `last_reviewed 2026-09-29` and `next_review_due 2027-09-29`. One is `draft` (`lung-ldct-nfz-program`) with all three review fields null. Today (2026-10-28) no entry is overdue.
- The "today" helper exists: `warsawToday(now: Date): string` (`src/lib/screenings/rules.ts:55`). The schema already reads the clock implicitly (`latestToday()`, `schema.ts:39-41`), but the new rule should take `today` as a parameter, per CLAUDE.md's Testing Guidelines ("passing 'now'/`currentYear` as a parameter").
- CI shape: `ci.yml` already emits `::warning::` (`ci.yml:189`) and `::error::` (`ci.yml:76,84,177,193`) with `echo`. The `ci` job runs on `pull_request` and on `push` to `main` (`ci.yml:3-8`), with no schedule. So the warning appears on every PR's `ci` run, not on a timer.
- Output text is safe for workflow commands: a warning carries only the slug (`[a-z0-9-]`) and the ISO date, never free text from the entry. (`scripts/ai-review/run.test.ts:340` shows the repo already guards against workflow-command injection from free text.)

### Docs that must change

- `catalog/README.md:9-17` (Lifecycle): add the allowed moves (draft → active, draft → retired?, active → retired; same status allowed; new slug any status) and say that `catalog:check` refuses the rest. Keep the "Never delete an entry" paragraph (`README.md:17`) unchanged. Step 2 of "Shipping changes" should mention the review-date warning.
- `CLAUDE.md` (Hard rules, catalog bullet): the "never delete an entry: set `"status": "retired"`" rule stays as it is. Adding "and never move a status backwards" is optional.

## Code References

- `scripts/catalog/check.ts:24-38`: deleted-slug check over all snapshots; drift check against the newest snapshot only
- `scripts/catalog/check.ts:40-46`: exit paths (no warning channel)
- `scripts/catalog/migration.ts:22-27`: refusal on problems; the place to add the transition guard
- `scripts/catalog/lib.ts:177-211`: `renderSnapshotSql`, the deterministic row layout (slug, then status)
- `scripts/catalog/lib.ts:217-221`: `parseSnapshotSlugs` (header only)
- `scripts/catalog/lib.ts:229-238`: `listSnapshots`, oldest first
- `scripts/catalog/lib.ts:251-271`: `findDeletedSlugs`, the pure-guard pattern to copy
- `src/lib/catalog/schema.ts:194-204,247-248`: review stamp; `next_review_due` nullable
- `src/lib/screenings/rules.ts:55`: `warsawToday(now)`
- `src/lib/catalog/read.ts:35,50,77`: status filters that make a demotion user-visible
- `supabase/migrations/20260928153742_screening_catalog.sql:34,67`: status check constraint, RLS read predicate
- `supabase/migrations/20260929165522_screening_catalog_snapshot.sql:530`: `status = excluded.status`
- `.github/workflows/ci.yml:3-8,20,26`: triggers, shallow checkout, `catalog:check` step
- `vitest.config.ts`: `include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]`

## Architecture Insights

- Catalog CLIs split pure helpers (`lib.ts`, data in, messages out) from I/O orchestration (`check.ts`, `migration.ts`). The two new guards fit as `findBackwardMoves(entries, snapshots)` and `findOverdueReviews(entries, today)` in `lib.ts`, with `check.ts` adding `warsawToday(new Date())`. The names are suggestions.
- Snapshots are append-only and immutable (`catalog/README.md`, "Shipping changes" step 3; CLAUDE.md hard rule), so their sequence is a committed, file-only status history. That is what makes option A sound without git or the DB.
- Messages follow `<repo-relative file>: <field>: <problem>; <fix>` (e.g. `lib.ts:265-266`).

## Historical Context (from prior changes)

- `context/archive/2026-09-28-screening-catalog-v1/plan.md:61`: the review fields stayed null until sign-off. That is superseded for 19 entries, which now carry the owner's stamp (entry files, inspected 2026-10-28), and still holds for the draft entry.
- `context/foundation/roadmap.md:121-125` (F-19): sequenced after F-17 because both edit the catalog scripts. F-19 adds the broad catalog-script tests. F-17 should still ship tests for its own new pure functions, because the change note makes "now as a parameter so the date rule is unit-testable" a requirement.
- `context/foundation/backlog.md:86`: B-14 and B-15 were merged into F-17 on 2026-10-28.

## External evidence

- GitHub annotation caps: 10 warning and 10 error annotations per step, 50 per job. The extras are dropped silently. Sources: [community discussion #26680](https://github.com/orgs/community/discussions/26680) (a GitHub staff answer), [#68471](https://github.com/orgs/community/discussions/68471). The official [workflow-commands docs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands) document the `::warning file=…,title=…::` syntax but not the cap. Treat the cap as community-documented; designing for ≤ 10 is safe either way.
- Context7 was not used: no Astro, Supabase, Cloudflare, Tailwind, React or shadcn API is involved.

## Related Research

- `context/archive/2026-09-28-screening-catalog-v1/research.md`: the original catalog tooling design (snapshot and manifest).

## Open Questions

1. Is **draft → retired** (skipping active) allowed? The order is draft < active < retired, so it is "forward". The roadmap says "anything other than draft → active → retired", which can be read either way. Recommended: allow it. It hides nothing new, because RLS shows retired, and it lets an unsourced shipped draft be closed out.
2. Which statuses get the review-date warning? Recommended: `active` only, since retired entries aren't recommended and drafts have no stamp.
3. Should an `active` entry with **no** `next_review_due` also warn? Otherwise it could never be flagged. Recommended: yes, as an advisory "no review date" warning.
4. Can a warning annotation cap of 10 per step drop warnings? Recommended: one summary `::warning` plus a full list in the log or `$GITHUB_STEP_SUMMARY`. Not an owner question; the plan's call.
