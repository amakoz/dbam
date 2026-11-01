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

- **F1 — Fix A.** The `failed` line is now pinned with `toEqual` in the rows that lacked it: appointment and nudge missing-id; due claim error, Resend 500 and missing-id. The due invalid-candidate row had the same gap and got the same assertion (one more than the review listed). The expected lines were written from the code and went green at the first run. **Reference commit for "unchanged since phase 1": `dc62600`.** Later phases diff the three job test files and `transcript.test-helper.ts` against it, not against 14f1302. The helper is unchanged since 14f1302. `plan.md` ("Guard first") says so.
- **F2 — left open.** Row 1.5 stays as it is. A reviewer pane is checking the pinned email copy independently; the orchestrator will send its verdict, and who confirmed is recorded then.
- **F3 — confirmed.** The `SITE` reinterpretation is now `decided-by: orchestrator`. Phase 4 §3 and row 4.3 carry: "absent apart from the vendor hit recorded in decisions.md (SITE build baseline)".
- **F4 — fixed.** Progress SHAs sit at the end of their row lines (1.12, 1.5, 2.4) and the blank line before `### Phase 3` is back. A regex bug of mine caused it (a `[^ ]` matched the newline).
- **F5 — fixed.** The four references to the pre-archive folder point at `context/archive/2026-10-27-reminders-refactor/…` (research, plan-review, decisions, and `follow-ups/td-5-job-list.md`). The archive was not touched.

## 2026-10-28 Row 1.5 confirmed by the reviewer pane (impl-review F2)

- Question: who confirms the pinned sent-transcript email copy (manual row 1.5)? The author wrote the expectations, so the author is not an independent check.
- Choice: the reviewer pane (Opus, independent of the author) verified the pinned copy in `appointment.test.ts`, `due-screening.test.ts` and `follow-up-nudge.test.ts` against today's `src/i18n/{pl,en}.ts` and the builders. It matches, and no email names an exam or holds health data. Row 1.5 stays `[x]`; F2's Decision is fixed.
- decided-by: orchestrator

## 2026-10-28 SHAs rebased

- PR A was rebased onto `origin/main` (a3d4b7e) before its first push, so every commit got a new SHA. The SHAs in `plan.md`, `impl-review.md` and this file are the post-rebase ones: phase 1 `14f1302`, phase 2 `ea0cc9c`, guard reference commit (F1) `dc62600`. Entries above that name a SHA were updated in place.
- decided-by: worker

## 2026-10-28 Phase 3 built on a local branch, not on PR A's branch

- Question: where does the phase 3 commit live while PR #99 (phases 1–2) waits on CI and must merge first?
- Options: (a) commit on `feat/reminders-runner` (risk: a later push of that branch adds phase 3 to PR #99); (b) a local branch `feat/reminders-runner-p3` off PR A's head.
- Choice: (b). Nothing is pushed. When #99 has merged, rebase `feat/reminders-runner-p3` onto `origin/main` (its parent commits are PR A's, which the squash or merge makes redundant) and open PR B from it.
- decided-by: worker

## 2026-10-28 Phase 3 gate notes

- `runner.test.ts` reuses the phase 1 recorder (`fakeClient`, `record`, `expectNoLeak`) and still has no `astro:*` mock. Its one `vi.mock` is `@/lib/schedule`, wrapping the real `isDailySendRun` so a scenario can make the send gate throw, as the job tests do.
- Phase 1 guards are unchanged since the reference commit (F1): `git diff 8410cdb -- <the 3 job tests and the helper>` is empty (it was `dc62600` before the squash; see the triage below).
- Break (mark before the dry-run check in `runner.ts`) failed `runner.test.ts` on "resolves `dry-run` … and never marks"; the file was restored from the staged version.
- decided-by: worker

## 2026-10-28 PR B (phase 3) impl-review triage

Review: `impl-review.md`, section "PR B — phase 3" (APPROVED, two low-impact warnings about git history). Decided by the orchestrator; applied by the worker.

- **F1 — fixed.** PR A was squash-merged as 8410cdb, so the phase 3 branch still carried PR A's five pre-squash commits. `git rebase --onto origin/main 8bf4efb feat/reminders-runner-p3` (the branch had never been pushed) moved it onto `main`. `git diff --stat origin/main...HEAD` lists only phase 3 files: `runner.ts`, `runner.test.ts`, `deps.ts`, the `eslint.config.js` line, and `plan.md`, `decisions.md`, `impl-review.md`. The rebase gave the phase 3 commit a new SHA: `44d25d5` (it was `bdff91e`); Progress rows 3.1–3.4 carry the new one.
- **F2 — fixed.** The reference for "unchanged since phase 1" is now `8410cdb`, the squash commit of #99 on `main`; `plan.md` ("Guard first") and the phase 3 gate note above say so. The Progress SHAs `14f1302` (phase 1) and `ea0cc9c` (phase 2) were squashed into 8410cdb and stay in the rows as history. `dc62600`, the earlier guard reference, is likewise squashed into 8410cdb. Entries in `impl-review.md` that name pre-squash SHAs (including `bdff91e`) are the review's record and were left as written.
- **Branching rule for the remaining phases.** Start each next phase branch from `origin/main` after its predecessor merges; do not stack phase branches.

## 2026-10-28 Phase 4 gate notes (appointment job on the runner)

- **SITE gate, against the phase 1 baseline.** After `npm run build`: the URL is present in 20 files, as in the baseline; `import.meta.env.SITE` is still in exactly one file, `dist/server/chunks/dist_CXvK08EP.mjs`, with the same Astro deprecation text (the vendor hit recorded above); and the URL is inlined in the chunk that holds `reminderDeps` (`dist/server/entry.mjs:438`, `site: "https://dbam.amadeuszkozlowski.workers.dev"`). The appointment builder's own `const site = …` literal is gone; the two others (due, nudge) remain until phases 5 and 6. Result equals the baseline, so the phase continues.
- **Guard.** `appointment.test.ts`, the other two job tests and the helper are unchanged since 8410cdb and pass on the refactored job. The appointment transcript, the `failed` lines and the key are identical.
- **Break.** Moving the mark above the dry-run check in `runner.ts` failed `runner.test.ts` ("resolves `dry-run` … never marks") and `appointment.test.ts` ("claims, sends nothing and marks nothing on a dry run"); restored exactly from the staged tree.
- **Signature.** `runAppointmentReminders` is no longer `async`: it returns the runner's promise, so `reminderDeps()` runs before the runner's `try`. It only binds references and reads the inlined `SITE`, so it cannot throw; the old `async` wrapper had nothing to await.
- **Manual row 4.6 stays open.** It needs the next 10:00 Warsaw production run after deploy, and it gates phase 5.
- decided-by: worker

## 2026-10-28 PR C (phase 4) rebased onto main

- Phase 3 merged as e64dc3c (#100). The phase 4 branch was rebased with `git rebase --onto origin/main feat/reminders-runner-p3 feat/reminders-runner-p4` (never pushed). `git diff --stat origin/main...HEAD` lists only phase 4 files: `appointment.ts`, one `eslint.config.js` line, and `plan.md`, `decisions.md`, `impl-review.md`. The phase 4 commit is now `2450540` (it was `2dacbb5`); Progress rows 4.1–4.5 carry the new SHA. The review's own text keeps the pre-rebase SHA. The guard reference stays `8410cdb`.
- decided-by: worker

## 2026-10-28 Phase 5 gate notes (follow-up nudge on the runner)

- **Built ahead of the gate, on a local branch.** The plan says to start phase 5 only after the phase 4 production check (row 4.6) has passed. At the orchestrator's request phase 5 is built and committed locally on `feat/reminders-runner-p5` (off `feat/reminders-runner-p4`) and is **not pushed**; PR D must not open until row 4.6 has passed on the deployed PR C. The rebase rule for the remaining phases is unchanged: start each phase branch from `origin/main` after its predecessor merges.
- **Guard.** The three job tests and the helper are unchanged since 8410cdb and pass on the refactored job.
- **Break.** Moving the mark above the dry-run check in `runner.ts` failed `runner.test.ts`, `appointment.test.ts` and `follow-up-nudge.test.ts` (one dry-run case each); restored exactly from the staged tree.
- **`p_limit` and the budget.** The spec's `select` receives `budget: number | undefined`, and the runner has already skipped a run with `budget <= 0`, so the nudge `select` reads `Math.min(budget ?? 0, MAX_BATCH_SIZE)`. The `?? 0` is unreachable when the runner calls it with a number; the claim arguments are otherwise exactly today's (TD-6 stays).
- **Build.** The whole-output `SITE` check still equals the baseline (`import.meta.env.SITE` only in the vendor hit), and the nudge builder's own `const site = …` literal is gone from `entry.mjs`; only the due job's remains.
- **Manual row 5.5 stays open.** It needs the next 10:00 Warsaw production run after deploy and gates phase 6.
- decided-by: worker

## 2026-10-29 Row 4.6 confirmed by the owner; PR D rebased onto main

- **Row 4.6 (appointment job on the runner, production).** The owner confirmed that after the 2026-10-29 10:00 Warsaw run, Workers Logs show the `appointment-reminder` line with unchanged fields and no `error` line. PR C (phase 4) was deployed as 5fa7716 (#102). Row 4.6 is marked done with that SHA, which unblocks phase 5 (PR D).
- **Rebase.** PR C merged, so `feat/reminders-runner-p5` (never pushed) was rebased with `git rebase --onto origin/main feat/reminders-runner-p4 feat/reminders-runner-p5`. `git diff --stat origin/main...HEAD` lists only phase 5 files: `follow-up-nudge.ts`, one `eslint.config.js` line, and `plan.md`, `decisions.md`, `impl-review.md`. The phase 5 commit is now `0d5cfed` (it was `4140ba4`); Progress rows 5.1-5.4 carry the new SHA. The review's own text keeps the pre-rebase SHA.
- **Migrations.** This PR changes none, so the pgTAP suite was not part of its gates (CI's `smoke` job runs it on every PR).
- **Slip, for the record.** An unquoted heredoc in my first attempt let the shell run the backticked commands in this very entry: a second, stray `git rebase` (aborted with `git rebase --abort`; the branch was left exactly as after the first rebase) and one `npx supabase test db` run without taking the DB lock. The pgTAP run is transaction-scoped and no lock was held by anyone; the gate results of that attempt were discarded and every gate was re-run on the clean tree.
- decided-by: orchestrator (the owner's confirmation of 4.6); worker (the rebase).

## 2026-11-01 Row 5.5 confirmed by the owner; phase 6 branch

- **Row 5.5 (follow-up nudge on the runner, production).** The owner confirmed on 2026-11-01 that the 10:00 Warsaw run after PR D logged the `follow-up-nudge` line with unchanged fields and no `error` line. PR D (phase 5) is merged as 87c499f (#107). Row 5.5 is marked done with that SHA, which unblocks phase 6.
- **Branch.** `feat/reminders-runner-p6` starts from `origin/main` (6f6cec2), as the branching rule says.
- decided-by: orchestrator (the owner's confirmation of 5.5); worker (the branch).

## 2026-11-01 Phase 6 gate notes (due-screening job on the runner)

- **Guard.** `due-screening.test.ts`, the other two job tests and the helper are unchanged against `origin/main` and pass on the refactored job. Against the reference commit 8410cdb, `due-screening.test.ts` differs by 2 lines: that is S-11 (#110, English copy wording on `main`), not this change.
- **Select.** The three `none` exits collapse into the runner's one exit with `fields: { candidates: n }`, and the lines are identical (`candidates` sits between `scheduledAt` and `due`). The candidates → parse → catalog → decide → claim order and arguments are as before. As in phase 5, `budget ?? 0` is unreachable: the runner has already skipped a run with `budget <= 0`.
- **Signature.** `runDueScreeningReminders` is no longer `async` (as phase 4's job): it returns the runner's promise, and `reminderDeps()` only binds references.
- **Perf.** `due.perf.test.ts` passes unchanged. No zod or `Intl.Collator` added (I12).
- **Build.** `import.meta.env.SITE` is still in exactly one file (the vendor hit), the URL is in 20 files as in the baseline, and the only `site: "https://…"` literal left in `entry.mjs` is `reminderDeps` (line 438); no job builder has its own `const site` literal now.
- **Break.** Moving the mark above the dry-run check in `runner.ts` failed `runner.test.ts` and the dry-run case of each of the three job test files; restored exactly from the staged tree.
- **Manual rows 6.6 and 6.7 stay open** (the owner's production check after deploy: the `due-screening-reminder` line and its CPU time). They go into the PR's Manual checks.
- decided-by: worker

## 2026-11-01 PR E (phase 6) impl-review triage

Review: `impl-review.md`, section "PR E — phase 6" (APPROVED, one low-impact warning about plan bookkeeping). Decided by the orchestrator; applied by the worker.

- **F1 — Fix A.** The guard reference for "unchanged since phase 1" moves from 8410cdb to **6f6cec2** (S-11 on `main`, #110). S-11 rewrote 2 pinned English lines in `due-screening.test.ts` to follow the copy change in `src/i18n/en.ts`, so the diff against 8410cdb is no longer empty. The three job tests and the helper are unchanged against 6f6cec2. `plan.md` ("Guard first") says so, with the reason.
- **Rule for later copy changes.** The `sent` transcripts pin real email copy, so a copy change on `main` legitimately edits them. Any later such change moves the reference to its commit on `main` the same way, and the phase's gate note says so.
- decided-by: orchestrator

## 2026-11-01 Phase 7 gate notes (appointment builder extracted)

- **Move.** `buildAppointmentMessage(row, site)` now lives in `appointment-message.ts`, verbatim from the job's private `buildMessage`. Its row type is a minimal `AppointmentRow` (`email`, `locale`, `appointment_dates`, `reminder_ids`), which the claimed row satisfies structurally. `appointment.ts` imports it as the spec's `message`; `APPOINTMENT_REMINDER_LEAD_DAYS` stays there. The module imports `@/i18n`, `formatDay` and a type from `@/lib/email`: no `astro:*`, and the test has no `vi.mock`.
- **Guard.** The three job tests and the helper are unchanged against the reference 6f6cec2 (`git diff` empty) and pass; the appointment `sent` transcript is byte-identical.
- **Builder test.** The expected texts in `appointment-message.test.ts` (pl and en, the date conjunction, plurals) were written from `src/i18n/{pl,en}.ts` before running, and went green on the first run. It covers the no-exam-name rule with a leaky row (slug, name, user id).
- **Break.** Appending a slug to the builder's text failed 3 cases in `appointment-message.test.ts` and the appointment `sent` transcript in `appointment.test.ts`; `appointment-message.ts` was restored exactly from the staged tree.
- **Build.** `npm run build` succeeds. No Manual rows in this phase; the three-line production check is row 8.5.
- decided-by: worker

## 2026-11-01 Owner decision: finalize without waiting on production checks

- Question: phase 8 follows the plan's rule that each passing production check gates the next job phase (rows 4.6, 5.5 and 6.6/6.7). Row 6.6/6.7 (the `due-screening-reminder` line and its CPU time after #111) has not run yet.
- Choice: the owner decided to finalize the change without waiting on production checks. Rows 6.6 and 6.7 stay open in `plan.md` and move to the final PR's Manual checks, together with row 8.5. This overrides the plan's "each passing check gates the next job phase" for phase 8 only.
- Evidence: the three job phases (4, 5, 6) are merged, 4.6 and 5.5 passed in production, and phase 8 moves only a builder verbatim into a pure module (no change to the runner or the job's select).
- decided-by: owner (relayed by the orchestrator)

## 2026-11-01 Phase 8 gate notes (due-screening builder extracted)

- **Move.** `buildDueScreeningMessage(row, site)` now lives in `due-screening-message.ts`, verbatim from the job's private `buildMessage`. Its row type is a minimal `DueScreeningRow` (`email`, `locale`, `reminder_ids`), which the claimed row satisfies structurally. `due-screening.ts` imports it as the spec's `message`. The module imports only `@/i18n` and a type from `@/lib/email`: no `astro:*`, and its test has no `vi.mock`.
- **Guard.** The three job tests and the helper are unchanged against the reference 6f6cec2 (`git diff` empty) and pass; the due `sent` transcript is byte-identical.
- **Builder test.** The expected pl and en texts in `due-screening-message.test.ts` were written from `src/i18n/{pl,en}.ts` before running, and went green on the first run. It also covers plurals, links, the locale fallback and the no-exam-name rule with a leaky row (slug, name, due month).
- **Break.** Appending a slug to the builder's text failed 3 cases in `due-screening-message.test.ts` and the due `sent` transcript in `due-screening.test.ts`; the file was restored exactly from the staged tree.
- **Left open.** Row 8.5 (the production check of all three job lines) and, by the owner decision above, rows 6.6 and 6.7 go to the final PR's Manual checks. Because they stay open, `change.md` keeps `status: impl_reviewed`; it flips to `implemented` once they are confirmed.
- decided-by: worker

## 2026-11-01 PR G (phase 8) impl-review triage

Review: `impl-review.md`, section "PR G — phase 8" (one observation about docs). Decided by the orchestrator; applied by the worker.

- **F1 — Fix A, shipped in this PR.** `README.md` (Scheduled jobs) now says the three jobs share `src/lib/reminders/runner.ts` and that `src/lib/reminders/deps.ts` binds the real client, sender and site. `CLAUDE.md` "Testing Guidelines" names the job transcript tests (`src/lib/reminders/*.test.ts`) and the rule that a copy change on `main` edits the `sent` transcripts. No other doc text changed.
- decided-by: orchestrator
