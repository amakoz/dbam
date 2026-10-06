# Decisions — unit-test-suite

## 2026-10-05 Planning complexity and question budget

- **Question:** Is LOW complexity with a 4-question budget right?
- **Options:** (a) LOW, 4 questions (b) higher (c) lower
- **Choice:** (a) LOW, 4 questions
- **Evidence:** `research.md` answered the toolchain and fixture questions, leaving only convention and scope choices.
- **Decided by:** orchestrator

## 2026-10-05 Test scope

- **Question:** What should the first suite cover?
- **Options:**
  - (a) only the catalog rules (`recommend.ts`, `wording.ts`)
  - (b) those plus the `src/lib/screenings/rules.ts` recurrence cases
  - (c) those plus other pure modules
- **Choice:** (a). The `rules.ts` recurrence cases are deferred to a follow-up and listed in plan.md "What We're NOT Doing".
- **Evidence:**
  - The F-03 outcome names exactly these two files (`context/foundation/roadmap.md:119`).
  - `rules.ts:264` consumes `resolveInterval`, which (a) covers.
- **Decided by:** orchestrator

## 2026-10-05 Test file location

- **Question:** Where do test files live?
- **Options:** (a) colocated `src/**/*.test.ts` with an explicit Vitest `include` (b) a top-level `tests/` dir
- **Choice:** (a)
- **Evidence:**
  - `tsconfig.json:3` and the type-aware ESLint config (`eslint.config.js:16-40`) already cover `src/**`.
  - The reminders import ban (`eslint.config.js:83-104`) does not touch `src/lib/**`.
- **Decided by:** orchestrator

## 2026-10-05 Wording assertions

- **Question:** How exact should the wording tests be?
- **Options:** (a) full expected strings in pl and en (b) substring checks
- **Choice:** (a). Avoid formatted numbers of 5+ digits, which use a non-breaking space.
- **Evidence:**
  - These are user-facing strings.
  - CI pins Node 22 (`.github/workflows/ci.yml:21-24`).
  - The outputs were probed on Node 22.16.0.
- **Decided by:** orchestrator

## 2026-10-05 Fixtures

- **Question:** How are test inputs built?
- **Choice:** Typed factories inline in the test files, not parsed through `CatalogEntrySchema`, and not loaded from `catalog/entries/`.
- **Evidence:**
  - The schema rejects an active entry without a reviewer (`src/lib/catalog/schema.ts:193-200`), which is the launch-gate case under test.
  - The schema checks source `accessed` dates against the clock.
  - `npm run catalog:check` already validates the real entries in CI.
- **Decided by:** worker (accepted by orchestrator)

## 2026-10-05 Coverage and pre-commit

- **Question:** Coverage threshold, or tests in the husky pre-commit hook?
- **Choice:** Neither. Tests run in CI's `ci` job and through `npm test` locally.
- **Evidence:** No PRD or roadmap item asks for either (`context/foundation/prd.md:142`, `roadmap.md:117-128`).
- **Decided by:** worker (accepted by orchestrator)

## 2026-10-06 Phase split

- **Question:** How should the plan be phased?
- **Choice:** Two phases:
  1. runner, config, CI step and `recommend.test.ts`;
  2. `wording.test.ts` and the docs.
- **Evidence:** The orchestrator delegated the phase split ("your call, keep it small"). Phase 1 proves the runner end to end in CI on the rule engine before the wording strings are pinned.
- **Decided by:** worker

## 2026-10-06 Plan-review triage (plan-review.md F1–F4)

- **Question:** How to resolve the four plan-review findings (verdict SOUND: 2 warnings, 2 observations)?
- **Options:** accept or reject each finding
- **Choice:** all four accepted.
  - **F1:** add an `lte` and null case (`years_since_quitting lte 15`: 15 → match, 16 → no, null → no) to Phase 1 and Testing Strategy.
  - **F2:** drop Progress 1.7 from Phase 1. The CI-log check becomes Phase 2 Manual 2.7, done after the PR is open (stage 10 of the orchestrated chain). Phase 1 pauses after its automated checks only.
  - **F3:** add a `npm test` bullet to the README "Available Scripts" list.
  - **F4:** reword the ICU risk to "a Node update (minor or major)" and add a re-probe/re-pin line to the CLAUDE.md Testing Guidelines edit.
- **Evidence:**
  - `context/changes/unit-test-suite/plan-review.md`.
  - F1: `catalog/entries/lung-ldct-nfz-program.json` uses `years_since_quitting lte 15`.
  - F2: CI runs only on PRs and pushes to `main` (`ci.yml:3-8`).
  - F3: `README.md:52-64`.
  - F4: CI's `node-version: 22` (`ci.yml:23`) floats to the newest 22.x.
- **Decided by:** orchestrator

## 2026-10-06 Phase 1 execution mode and ritual prompts

- **Question:** How to run Phase 1 (subagent or in this context), and how to answer the skill's interactive prompts (commit message, dirty paths) in a worker session where AskUserQuestion is disabled?
- **Options:** (a) delegate to a subagent (b) implement in context; for prompts: ask via QUESTIONS or take the skill's recommended option
- **Choice:** (b) in context (one config file and one test file, small enough that a subagent re-read would cost more than it saves). For prompts, take the recommended option: stage only the planned set and use the proposed commit message.
- **Evidence:** the worker protocol says AskUserQuestion is disabled and "your call" means take the recommended option.
- **Decided by:** worker

## 2026-10-06 Roadmap flip left unstaged

- **Question:** Stage the F-03 `in-progress` flip in `context/foundation/roadmap.md` with Phase 1?
- **Choice:** No. The file already carried uncommitted edits (the `planning` flip and the `updated:` bump) before implementation started, so per the skill the flip stays in the working tree for the orchestrator or human to commit. Also ran prettier on it, which re-aligned the At a glance table.
- **Decided by:** worker

## 2026-10-06 Phase 1 findings

- `resolve.tsconfigPaths: true` resolves `@/*` under Vitest 5.0.3 and Vite 8.3.0, so the `resolve.alias` fallback was not needed (research Open Question 7 closed).
- `npm run lint` fails with `no-unsafe-*` errors in `src/pages` and middleware until `npx astro sync` has generated `.astro/` types. CI already runs `astro sync` before lint; locally run it first on a fresh worktree.

## 2026-10-06 Impl-review execution

- **Question:** Where should the report go, and how should the review run?
- **Choice:**
  - The report goes to `context/changes/unit-test-suite/impl-review.md`, as the orchestrator asked, instead of the skill's default `reviews/impl-review.md`.
  - The drift and safety passes ran in this context instead of two sub-agents. The diff is 8 non-doc files, and reading them directly was cheaper.
  - No triage was done; every finding is left `PENDING` for the orchestrator.
- **Evidence:** the orchestrator prompt ("Write the report to …", "Triage nothing yourself").
- **Decided by:** orchestrator (path, triage) and worker (inline review)

## 2026-10-06 Impl-review triage

- **Question:** How to resolve impl-review findings F1–F3 (`context/changes/unit-test-suite/impl-review.md`)?
- **Choice:**
  - **F1 — Fix B.** Adding a roadmap slice is a human decision, so the deferred recurrence cases (`rules.ts` `nextDueMonth`, `addMonths`/`addYears`, `partitionDashboard`, Warsaw midnight, Feb 29; `format.ts` `describeLastDone`) go to `follow-ups/recurrence-tests.md`. `change.md` Notes require the PR description to link it. Roadmap slices not edited (Fix A rejected).
  - **F2 — Accept.** F-03 Risk reworded to "Resolved by F-03" with the path repointed to `context/archive/2026-09-28-screening-recommendations/plan.md`. Status not flipped to `done`; archive handles it.
  - **F3 — Accept.** `tie-b` gets `name_en: "Bbb"` so the en `low`/`tie-b` order no longer rests on sort stability.
- **Evidence:** impl-review F1–F3; source of the deferred cases `context/archive/2026-09-30-record-appointment-date/plan.md:430-439`.
- **Decided by:** orchestrator

## 2026-10-06 Archive with Progress 2.7 pending

- **Question:** Archive the change while Progress 2.7 (the `ci` job shows `npm test` running and passing on the PR) is still unchecked?
- **Options:** (a) archive now (b) wait for the PR and tick 2.7 first (c) cancel
- **Choice:** (a). Row 2.7 stays unchecked in the archived plan. The PR's `ci` check confirms it instead, and the archive is not edited afterwards. The PR description links the follow-up at its archived path, `context/archive/2026-10-05-unit-test-suite/follow-ups/recurrence-tests.md`.
- **Evidence:** /10x-archive warnings: 0 automated and 1 manual row pending; impl-review covers phases 1 and 2; no PR exists yet, so no SHA repointing.
- **Decided by:** orchestrator
