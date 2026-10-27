# Decisions — ai-code-review

## 2026-10-27 Review is advisory, not a merge gate

- Question: is the AI review a required check or advisory?
- Options: (a) advisory label + comment, job always green on provider failure; (b) required check.
- Choice: (a). A provider outage or rate limit leaves the job green with a "review unavailable" note; the job is not added to required checks (`ci`, `smoke` stay the only ones).
- Evidence: roadmap S-09 Unknowns default (`context/foundation/roadmap.md`, S-09); free models are rate-limited (20/min, 50/day).
- Decided-by: orchestrator

## 2026-10-27 Trigger and secret boundary

- Question: how to run with the API key without exposing it to untrusted code?
- Choice: `pull_request` (never `pull_request_target`); fork PRs get no secrets and skip cleanly. Never send secrets, `.env*`, lockfiles or generated files (e.g. `src/lib/database.types.ts`, `*_screening_catalog_snapshot.sql`).
- Evidence: change.md Notes; research.md "Fork and secret-less runs".
- Decided-by: orchestrator

## 2026-10-27 Research without sub-agents

- Question: dispatch sub-agents for /10x-research?
- Choice: none; the change touches 3 modules or fewer (`.github/workflows`, `scripts`, docs).
- Decided-by: worker (per orchestrator rule)

## 2026-10-27 Research open questions 1–6 and fixed choices

- Question: the six open questions in research.md plus the review's output and safety rules.
- Choice:
  1. Triggers `opened, synchronize, reopened, ready_for_review`; draft PRs skipped; per-PR concurrency with cancel-in-progress.
  2. Score 1–10; `>= 7` → `ai-cr:passed`, else `ai-cr:failed`; the opposite label is removed (404 tolerated). An unavailable run (no key, 429, 5xx, 200 without content, timeout) leaves labels unchanged, writes "review unavailable: <reason>" to the comment and the job log, and exits 0.
  3. Diff budget ~60,000 chars; files ordered code → tests → `context/**` and docs; truncated at the budget; omitted files listed in the comment.
  4. The job creates both labels idempotently (`POST /labels`, 422 `already_exists` = ok); no owner step.
  5. Pure core stays in `scripts/` as zero-dependency `.mjs`; vitest include extended to `scripts/**/*.test.ts`.
  6. `models: [<default free model>, "openrouter/free"]`, default model in a workflow env var.
  - Fixed: one sticky comment per PR (hidden marker, PATCH on later pushes); PR title/body/diff are untrusted (system prompt says so, model output is never executed or followed); @mentions in model output neutralised with a zero-width space; comment length capped; job-level permissions only (`contents: read`, `pull-requests: write`, `issues: write`); fork/secret-less runs exit 0 with a skip note; Phase 1 testable without network; the self-review on the PR is a PR Manual check.
- Evidence: research.md Open Questions 1–6.
- Decided-by: orchestrator

## 2026-10-27 Planning scope: complexity, questions, phases

- Choice: MEDIUM complexity, 0 interview questions (settled-input exception: every material decision was answered upstream), 2 phases: (1) pure core + unit tests, (2) runner + workflow + docs + fake-server integration tests.
- Decided-by: worker

## 2026-10-27 Default model: poolside/laguna-s-2.1:free

- Question: which currently listed free model is the default?
- Options: `poolside/laguna-s-2.1:free` (coding-agent model, 262k context, listed 2026-07-21), `cohere/north-mini-code:free` (3B active, 256k), `google/gemma-4-31b-it:free` (general, supports `response_format`), `nvidia/nemotron-3-ultra-550b-a55b:free` (large reasoning, slower).
- Choice: `poolside/laguna-s-2.1:free`, fallback `openrouter/free`. It is the newest code-specialised free model (118B total / 8B active, Terminal-Bench 2.1 70.2% per its OpenRouter description) with room for the 60k-char diff; structured output is not needed because the parser reads a `SCORE: N/10` line from free text.
- Evidence: `GET https://openrouter.ai/api/v1/models` on 2026-10-27.
- Decided-by: worker

## 2026-10-27 Failure classes and exit codes

- Question: which failures keep the job green?
- Choice: provider-side failures (no key, network error, timeout, non-2xx, `error` in a 200 body, empty content, no parseable score) → "review unavailable", exit 0. Fork PRs → skip note, exit 0, no API calls. GitHub API failures while commenting or labelling (our wiring: permissions, token) → exit 1, so a broken setup is visible; the job is not a required check, so this never blocks a merge. No retry on 429 (each retry spends the 50/day budget).
- Decided-by: worker

## 2026-10-27 Diff source and test seams

- Choice: the runner diffs the checked-out merge commit against its first parent (`git diff HEAD^1 HEAD`, checkout `fetch-depth: 2`, `persist-credentials: false`) with `--no-ext-diff --no-textconv`; exclusion is done by the pure core on parsed per-file chunks (old and new path of renames). Endpoints come from env (`AI_REVIEW_BASE_URL`, standard `GITHUB_API_URL`), so integration tests point both at one local fake server and run the real script against a temporary git repo — no test-only code path.
- Decided-by: worker

## 2026-10-27 Plan review scope

- Question: how to run /10x-plan-review for this change?
- Choice: deep mode with codebase verification done inline (no sub-agent; few, local claims), report saved to `context/changes/ai-code-review/plan-review.md` as the orchestrator asked, every finding left `PENDING` (no self-triage). Verdict REVISE: 8 warnings, 2 observations, all security/test-gate hardening, no rethink.
- Decided-by: orchestrator (path, no triage), worker (inline verification)

## 2026-10-27 Plan review triage (F1–F10)

- Question: how to resolve the 8 warnings and 2 observations in `plan-review.md`?
- Choice: all accepted with the fix each finding states; plan.md and plan-brief.md updated, each Decision marked in plan-review.md.
  - F1: model/provider-derived stdout wrapped in `::stop-commands::<random hex per run>`; spoof test (`::error::spoof`, `::add-mask::x`).
  - F2: Fix A — `--name-status -z` list → pure `parseNameStatus()` + `planFiles()`; only allowed files are diffed with literal pathspecs and explicit `--src-prefix/--dst-prefix`; excluded content is never read. Worker detail: one `git diff` per allowed file, which removes `splitDiff` and the pathspec-length blind spot.
  - F3: deliberate-break rows 1.6 and 2.10 (run, confirm red, revert, record).
  - F4: `redactSecrets()` with the `AI_REVIEW_API_KEY` and `GITHUB_TOKEN` values on every provider-derived string; no-leak test over stdout, stderr, step summary and every recorded GitHub request body.
  - F5: added `.envrc` (via `.env*` prefix), `.npmrc`, `.yarnrc(.yml)`, `.netrc`, SSH keys, `*.jks`/`*.keystore`/`*.p8`, `credentials*.json`, `service-account*.json`, `supabase/.temp/**`; case-insensitive basenames; one case per family; fail closed on basenames containing `secret`/`credential`/`private`.
  - F6: job permissions `contents: read` + `pull-requests: write` only — supersedes `issues: write` from the 2026-10-27 "Research open questions" entry; add it only if a real run 403s on `POST /labels`, then record why. Workflow-level `permissions: {}`. Header and README say GitHub's fork policy is the boundary.
  - F7: any exception reading/decoding the provider response → unavailable `bad response`; `head.repo == null` → fork; two runner cases, both exit 0.
  - F8: `run.mjs` and `git` spawned with a minimal explicit env, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, fixed author/committer, `GITHUB_STEP_SUMMARY` = temp file.
  - F9: ESLint block for `scripts/ai-review/core.mjs` (`fetch`/`process` off, restricted `node:child_process`, `node:http(s)`, `node:net`, `node:fs`, dynamic `import()` banned); grep row 1.5 kept as a heuristic. Row 2.5 becomes `scripts/ai-review/workflow.test.ts` with text assertions, so no test depends on the transitive `yaml` package.
  - F10: random per-run nonce on data-tag names, U+200B after `#` before digits (covers `owner/repo#N`), backtick-safe code spans for paths, plus the `renderComment` case.
- Evidence: `context/changes/ai-code-review/plan-review.md`.
- Decided-by: orchestrator (fix details marked "worker detail" decided by worker)

## 2026-10-27 Implementation details (worker)

- `@mention` neutralising skips an `@` preceded by a letter, digit or `_` (email-like `a@b.pl` stays readable, as the plan's unit case requires); every mention GitHub would link (start of text, after space, bracket, backtick, `/`) gets the U+200B.
- The runner prints and appends the rendered review to the log and step summary before it calls GitHub, so a failing comment or label call still leaves the review visible in the job.
- A diff with no reviewable file left (everything excluded, binary or empty) skips the provider call (it would spend the 50/day budget on nothing) and posts `review unavailable: no reviewable files in this diff`; labels unchanged, exit 0. Covered by a runner test.
- The runner test spawns `node run.mjs` asynchronously (the fake server lives in the test process) and casts its minimal env to `NodeJS.ProcessEnv`, which the project augments with required keys.
- Decided-by: worker

## 2026-10-27 Implementation review scope

- Question: how to run /10x-impl-review for this change?
- Choice: full plan (phases 1, 2), review done inline without sub-agents (6 code files, all read in full), report at `context/changes/ai-code-review/impl-review.md` as the orchestrator asked, every finding left `PENDING`. Rows 2.7–2.9 stay open on purpose (they need the real provider on the PR run). Deliberate breaks for the `.env` rule and the `>= 7` threshold were re-run during the review (8 and 1 red tests) and reverted with `git checkout`. Verdict APPROVED: 1 warning (no-leak test misses two output paths), 5 observations.
- Decided-by: orchestrator (path, no triage, 2.7–2.9 open), worker (inline review, re-run breaks)

## 2026-10-27 Impl-review triage (F1–F6)

- Question: how to resolve the 1 warning and 5 observations in `impl-review.md`?
- Choice: all accepted by the orchestrator with the fix each finding states; each Decision is marked in `impl-review.md`.
  - F1: third no-leak run with secrets in an answer that has no `SCORE:` line.
  - F2: `git()` captures stderr; on failure it is logged through `logUntrusted(clean())` and the error is rethrown.
  - F3: `globalThis` banned in the core's lint block (`no-restricted-globals`).
  - F4: score regex anchored to a line start with a `\b` after `10`.
  - F5: `GH-123` and github.com issue/PR URLs neutralised with U+200B.
  - F6: `collectDiff` skips diffing once the budget is spent (worker detail: `DIFF_BUDGET` exported from the core; proved with `GIT_TRACE`).
- Evidence: `context/changes/ai-code-review/impl-review.md`.
- Decided-by: orchestrator (fixes), worker (details). Each new test was broken once and went red.
