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
