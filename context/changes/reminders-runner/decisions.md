# Decisions — reminders-runner

## 2026-10-28 No new research or plan-review

- Question: run /10x-research or /10x-plan-review before implementing?
- Options: (a) re-run both; (b) reuse the F-13 plan as is.
- Choice: (b). The plan was researched and reviewed in F-13 (`reminders-refactor`); only docs have merged to `main` since, so the code it describes is unchanged.
- Evidence: `git log` since the plan: F-14, S-09, F-15, Q-01–Q-10 are docs/CI only.
- decided-by: orchestrator

## 2026-10-28 Plan copied from the archive

- The archived plan and brief were copied into this folder with the "implementation is parked" lines replaced; the archive is untouched.
- decided-by: orchestrator

## 2026-10-28 `SITE` build baseline (plan phase 1, item 4)

- Question: does today's build inline `import.meta.env.SITE` in the server output? Phase 4 compares against this.
- Method: `npm run build` on the phase 1 tree, then over the whole of `dist/`.
- Result:
  - `grep -rl "https://dbam.amadeuszkozlowski.workers.dev" dist/` → 20 files (18 under `dist/server/`, 2 sitemaps). **Present.**
  - `grep -rl "import.meta.env.SITE" dist/` → **1 file**, `dist/server/chunks/dist_*.mjs`. The hit is Astro's own deprecation warning text ("Use import.meta.env.SITE instead"), not our code. In our code the expression is **absent**.
  - The job code sits in `dist/server/entry.mjs` (`dbam-appointment-reminder` at line ~490). The URL is inlined there as `const site = "https://dbam.amadeuszkozlowski.workers.dev"` at three sites (lines ~536, 827, 915), one per job's builder.
- Consequence for phase 4: the plan's "expression absent" check will see exactly this one vendor hit. Phase 4 passes when that is still the only hit (the same file, the same warning text) and the URL is still inlined into `entry.mjs` where `reminderDeps` ends up. Any other hit, or a `new URL(..., undefined)`-shaped site, fails the baseline.
- decided-by: orchestrator (confirmed in the PR A impl-review triage, F3; the worker proposed the vendor-hit reading). Phase 4 §3 and row 4.3 of `plan.md` now carry the same exception.

## 2026-10-28 Characterization harness: design choices (plan phase 1)

- `REMINDER_TEST_TO` is mocked as a sentinel (`heartbeat.sentinel@example.test`) via `astroEnvModule()`; a reminder body or log containing it fails the `sent` and gate tests (I4).
- The `astro:env/server` mock lives in the helper (`astroEnvModule()` plus `emailEnv.dryRun`), loaded lazily from each test's `vi.mock` factory. No `vi.hoisted` literal is repeated in three files.
- Log lines are compared as parsed objects; the catalog's plain-text `console.error` is kept raw and asserted in the due test.
- Email copy is pinned from `src/i18n/{pl,en}.ts` by hand (written before running), not copied from output; sha256 batch keys were computed independently with `node`.
- decided-by: worker

## 2026-10-28 PR A impl-review triage

Review: `impl-review.md` (PR A, phases 1–2). Decided by the orchestrator; applied by the worker.

- **F1 — Fix A.** The `failed` line is now pinned with `toEqual` in the rows that lacked it: appointment and nudge missing-id; due claim error, Resend 500 and missing-id. The due invalid-candidate row had the same gap and got the same assertion (one more than the review listed). The expected lines were written from the code and went green at the first run. **Reference commit for "unchanged since phase 1": `780f23a`.** Later phases diff the three job test files and `transcript.test-helper.ts` against it, not against 3599ba2. The helper is unchanged since 3599ba2. `plan.md` ("Guard first") says so.
- **F2 — left open.** Row 1.5 stays as it is. A reviewer pane is checking the pinned email copy independently; the orchestrator will send its verdict, and who confirmed is recorded then.
- **F3 — confirmed.** The `SITE` reinterpretation is now `decided-by: orchestrator`. Phase 4 §3 and row 4.3 carry: "absent apart from the vendor hit recorded in decisions.md (SITE build baseline)".
- **F4 — fixed.** Progress SHAs sit at the end of their row lines (1.12, 1.5, 2.4) and the blank line before `### Phase 3` is back. A regex bug of mine caused it (a `[^ ]` matched the newline).
- **F5 — fixed.** The four references to the pre-archive folder point at `context/archive/2026-10-27-reminders-refactor/…` (research, plan-review, decisions, and `follow-ups/td-5-job-list.md`). The archive was not touched.

## 2026-10-28 Row 1.5 confirmed by the reviewer pane (impl-review F2)

- Question: who confirms the pinned sent-transcript email copy (manual row 1.5)? The author wrote the expectations, so the author is not an independent check.
- Choice: the reviewer pane (Opus, independent of the author) verified the pinned copy in `appointment.test.ts`, `due-screening.test.ts` and `follow-up-nudge.test.ts` against today's `src/i18n/{pl,en}.ts` and the builders. It matches, and no email names an exam or holds health data. Row 1.5 stays `[x]`; F2's Decision is fixed.
- decided-by: orchestrator
