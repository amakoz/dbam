<!-- PLAN-REVIEW-REPORT -->

# Plan Review: AI Code Review in CI Implementation Plan

- **Plan**: context/changes/ai-code-review/plan.md
- **Mode**: Deep (codebase verification done inline: the claims are few and local, so no sub-agent)
- **Date**: 2026-10-27
- **Verdict**: REVISE
- **Findings**: 0 critical, 8 warnings, 2 observations
- **Focus (orchestrator)**: security of the trigger, permissions, fork and secret handling, path exclusion, prompt injection, advisory status, a core that tests without network, and a deliberate-break proof

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

What already holds: the trigger is `pull_request`, never `pull_request_target`. The job sits in its own workflow and is not one of the required checks (`gh api …/required_status_checks` → `["ci","smoke"]`). The secret goes into step-level `env` only. `persist-credentials: false` is set. Title and body are read from `$GITHUB_EVENT_PATH` and never interpolated into `run:`. Label names are fixed and the score is a parsed integer. Every provider failure listed exits 0. The core is pure, and the privacy-guard test feeds a sentinel through each exclusion family. A threshold regression (`verdict(7)` / `verdict(6)`) is caught.

## Grounding

Paths: 9 of 9 exist (`ci.yml`, `vitest.config.ts`, `eslint.config.js`, `README.md`, `scripts/ui-check.mjs`, `scripts/catalog/draft-core.ts`, `src/lib/database.types.ts`, `worker-configuration.d.ts`, `catalog/entry.schema.json`, generated per `catalog/README.md:5`).

Symbols: 6 of 6 match.

- `scriptsConfig` globals: `eslint.config.js:133-138`
- Vitest include: `vitest.config.ts:7`
- `## CI`: `README.md:458`
- `allowJs`: astro base tsconfig line 27
- `yaml@2.9.1`: present, but only as a transitive dependency
- No `permissions:` in `ci.yml`

Repo settings: `default_workflow_permissions: read`, fork PR approval `first_time_contributors`. No `.github/dependabot.yml`.

Brief and plan: consistent.

Research and plan: research.md:35 proposed a job-level `if:` fork guard plus a "skipped: no API key" note. The plan moves the fork guard into `run.mjs` and posts "unavailable: no API key" instead, which matches decisions.md (see F6).

Progress and phases: consistent. 5 Phase 1 rows and 9 Phase 2 rows, numbered 1.1–1.5 and 2.1–2.9; phase blocks have no checkboxes.

## Findings

### F1 — Model and PR text printed to stdout can run workflow commands

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 Runner, steps 3 and 6; Phase 1 §1 `sanitize`
- **Detail**: Step 6 prints the rendered comment to stdout. Step 3 logs the "sanitised raw text" when parsing fails. The runner reads every stdout line of a `run:` step for workflow commands. Model output is steered by PR content, so a line such as `::add-mask::…`, `::error file=…::`, `::stop-commands::<token>` or `::group::` would be acted on. `set-env` and `add-path` are disabled, but annotation spoofing still works, and so does hiding the runner's own later `::error::` behind `stop-commands`. `sanitize` removes control characters, HTML comments and @mentions, but nothing that starts with `::`. This is the one place where "model output is never executed" does not hold yet.
- **Fix**: Before writing model- or provider-derived text to stdout, wrap it with `::stop-commands::<random hex>` … `::<random hex>::`, using a fresh token per run, or prefix every line that matches `^\s*::` in the log copy. Add a core or runner test where the fake provider returns `::error::spoof` and `::add-mask::x`, and assert that stdout never shows them as bare commands.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — model/provider-derived stdout wrapped in `::stop-commands::<random hex per run>` … `::<token>::`; spoof test (`::error::spoof`, `::add-mask::x`) added to run.test.ts.

### F2 — Exclusion depends on parsing `diff --git` headers and fails open

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details (diff command); Phase 1 §1 `splitDiff` / `excludeReason`
- **Detail**: The exclusion rule only sees the paths that `splitDiff` pulls from `diff --git a/… b/…` headers. Several git behaviours can change those headers:
  - A path with a space makes the header ambiguous (`diff --git a/x b/y.ts b/x b/y.ts`).
  - Non-ASCII or special names are C-quoted (`"a/za\305\274.env"`) under the default `core.quotePath=true`.
  - A user or system `diff.noprefix` / `diff.mnemonicPrefix` setting drops or changes the `a/` and `b/` prefixes. The runner passes neither `--src-prefix` nor `--dst-prefix`.

  When a path is misparsed, `excludeReason` gets a string that matches no rule, so the chunk is sent. That is fail-open on exactly the path the orchestrator asked about: "excluded before anything leaves the runner". The test list covers no quoted or spaced paths.

- **Fix A ⭐ Recommended**: Filter on exact names before any content is read.
  - Approach: the runner gets the file list with `git diff --name-status -z --find-renames HEAD^1 HEAD` and passes `[{status, oldPath, newPath}]` to a pure `planFiles()` in the core. It then diffs only the allowed files, using literal pathspecs (`-- ':(literal)<path>'…`) and explicit `--src-prefix=a/ --dst-prefix=b/`.
  - Strength: excluded content never enters the runner's memory, so no parser bug can leak it. The exclusion logic stays pure and unit-tested on NUL-separated input.
  - Tradeoff: the diff is built in two steps, and `splitDiff` is still needed to measure the budget.
  - Confidence: MED — the git flags are standard, but the runner flow changes.
  - Blind spot: the pathspec length when a PR touches hundreds of files has not been measured; it can be fed in batches.
- **Fix B**: Keep the single diff, pin the format and fail closed.
  - Approach: add `-c core.quotePath=false --src-prefix=a/ --dst-prefix=b/ --find-renames`. Read paths from the `rename from/to`, `---` and `+++` lines rather than the `diff --git` line. Exclude any chunk whose paths cannot be parsed unambiguously (reason `unparsable path`). Add tests for a spaced path, a non-ASCII `.env` path and a quoted name.
  - Strength: the smallest edit to the current contract.
  - Tradeoff: safety still rests on the parser being right in every edge case. Failing closed limits the damage but does not remove the class of bug.
  - Confidence: HIGH — the change is small and easy to test.
  - Blind spot: other git config keys that change the header format have not been surveyed.
- **Decision**: ACCEPTED Fix A (orchestrator, 2026-10-27) — `--name-status -z` file list → pure `parseNameStatus()` + `planFiles()`; only allowed files are diffed, one literal pathspec per call with explicit `--src-prefix=a/ --dst-prefix=b/`; excluded content is never read. Per-file calls replace `splitDiff` and avoid the pathspec-length blind spot.

### F3 — No deliberate break proves the tests catch a filter or label regression

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 and Phase 2 Success Criteria; Progress
- **Detail**: No success criterion breaks the code and checks that a test turns red. The tests are designed so they would catch a regression: one sentinel per family, `verdict(6)` / `verdict(7)`, and a runner check that no label request is made when the review is unavailable. But nothing shows they do. A test that never fails, for example a sentinel that is never emitted because the fixture diff is malformed, would pass 1.1 and 2.1 unnoticed. The orchestrator's focus asks for this proof explicitly.
- **Fix**: Add automated rows 1.6 and 2.10 to the phases and to Progress. Each one runs the break, confirms red, reverts and records the result in Progress.
  - 1.6: drop the `.env` rule from `excludeReason` → the privacy-guard and `excludeReason` tests fail. Change `>= 7` to `> 7` → the `verdict(7)` test fails.
  - 2.10: make the runner skip `selectDiff` and send the whole diff → the runner's sentinel assertion fails. Make it add the label on an unavailable review → the "no label request" case fails.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — deliberate-break rows 1.6 and 2.10 added as stated (run, confirm red, revert, record).

### F4 — Secret no-leak test covers only stdout and stderr

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 step 3 (provider `error.message`), §2 last case
- **Detail**: Provider error text (`error.message`, sanitised, ≤200 chars) goes into the PR comment and the step summary as well as the log. GitHub masks secrets only in log output. Text sent through the REST API, such as the comment body, is posted verbatim. The plan's only no-leak case checks stdout and stderr. The accepted lesson "Grep gates are heuristics; privacy tests are the guard" says to add a case for every output path. Here those paths are the provider payload, stdout, the step summary file and the comment body.
- **Fix**: In `run.mjs`, replace the exact values of `AI_REVIEW_API_KEY` and `GITHUB_TOKEN` with `***` in every provider-derived string before `sanitize`. Then extend the no-leak case: the fake provider answers 401 with `error.message` containing the key. Assert that the key is absent from stdout, stderr, the step-summary file and every recorded GitHub request body.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — `redactSecrets()` replaces the `AI_REVIEW_API_KEY` and `GITHUB_TOKEN` values in every provider-derived string; no-leak test covers stdout, stderr, step summary and every recorded GitHub request body.

### F5 — Denylist misses common secret files and case variants

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 `excludeReason`
- **Detail**: Exclusion is a denylist, and the plan rules out content scanning. The secret families it does not cover:
  - `.envrc` (direnv): it does not match `.env` or `.env.*`.
  - Auth-token files: `.npmrc`, `.yarnrc.yml`, `.netrc`.
  - SSH keys: `id_rsa` / `id_ed25519` (no extension).
  - Keystores: `*.jks`, `*.keystore`, `*.p8`.
  - Service-account files: `credentials*.json`, `service-account*.json`.
  - Supabase CLI state under `supabase/.temp/` (project ref, pooler URL).

  Matching is not stated to be case-insensitive either, so `.ENV` and `Package-Lock.json` would get through. These files are not in the repo today. The rule exists for the accidental commit, and a denylist misses exactly that case.

- **Fix**: Add the families above, plus `.env*` written as a prefix rule so that `.envrc` is covered. Match basenames case-insensitively. Add one `excludeReason` case per new family. Optionally, have `selectDiff` fail closed on any path whose basename contains `secret`, `credential` or `private`.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — listed families added, `.env*` as a prefix rule, case-insensitive basenames, one test case per family, fail closed on basenames containing `secret`/`credential`/`private`.

### F6 — Workflow permissions are wider than the plan's own evidence requires

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 §3 Workflow; Key Discoveries
- **Detail**:
  - Both scopes: Key Discoveries says that either "Issues" or "Pull requests" write covers the PR comment and label endpoints. The job still asks for both, and nothing records why both are needed.
  - No workflow-level default: the plan says "no workflow-level `permissions`". A second job added to this file later would then inherit the repo default instead of nothing. The default is read today, but that is a repo setting, not part of this file.
  - The fork skip is PR-controlled: under `pull_request`, `run.mjs` and the workflow itself come from the PR's merge commit, so a fork can edit or remove the skip. The real boundary is GitHub withholding secrets and giving forks a read-only token, plus the `first_time_contributors` approval policy (verified). The plan presents the skip as the guard. Research suggested a job-level `if:`, which the plan dropped.
- **Fix**:
  - Keep only `pull-requests: write` alongside `contents: read`, unless a run shows a 403 on `POST /labels`. If `issues: write` turns out to be needed, record why in decisions.md.
  - Add `permissions: {}` at workflow level and make the 2.5 assertion check it.
  - State in the workflow header and README that the fork skip is a convenience and GitHub's fork policy is the boundary. Optionally add the job-level `if: github.event.pull_request.head.repo.full_name == github.repository` alongside the runner check.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — job permissions `contents: read` + `pull-requests: write` only (`issues: write` only if a real run 403s on `POST /labels`, then recorded); workflow-level `permissions: {}`; header and README state that GitHub's fork policy is the boundary.

### F7 — Some provider failures still turn the job red

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §1 steps 1 and 3; §2 cases
- **Detail**: Step 3 lists non-2xx, network or timeout, `error` in the body and missing content as "unavailable". Two cases are missing:
  - A 200 whose body is not JSON (an HTML page from a proxy or a Cloudflare challenge, or a truncated body) makes `res.json()` throw.
  - When the fork behind a PR has been deleted, `pull_request.head.repo` is `null` in the event, so `head.repo.full_name` throws a TypeError in step 1.

  Both end as uncaught exceptions with exit 1. The first breaks the orchestrator's rule that the job exits 0 when the provider is unavailable.

- **Fix**: In step 3, any exception while reading or decoding the provider response maps to unavailable `bad response`. In step 1, `head.repo == null` is treated as a fork. Add two runner cases: a 200 with `text/html` and an event with `head.repo: null`. Both expect exit 0.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — any exception reading/decoding the provider response = unavailable `bad response`; `head.repo == null` treated as a fork; two runner cases, both exit 0.

### F8 — Runner integration tests are not isolated from CI and the developer machine

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 §2 Integration tests
- **Detail**: `run.test.ts` runs inside the CI `ci` job's `npm test` step. The plan does not say which environment the spawned `run.mjs` and `git` processes get, and the defaults cause four problems:
  - `GITHUB_STEP_SUMMARY` is set in that step, so any env var not overridden leaks through, and fake reviews would be appended to the real `ci` job summary.
  - A developer's shell `AI_REVIEW_*` or `GITHUB_TOKEN` could leak in, so tests that are meant to run with no key would run with one.
  - The temp repo's `git commit` needs an identity. GitHub runners have none configured, so it fails.
  - A local `commit.gpgsign`, `diff.noprefix` or similar setting changes the behaviour. With `diff.noprefix`, the privacy assertions would test a different diff format than CI uses.
- **Fix**: Spawn `run.mjs` and `git` with a minimal explicit env (`PATH`, `HOME` set to the temp dir), not a copy of `process.env`. Set `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_AUTHOR_NAME/EMAIL` and `GIT_COMMITTER_NAME/EMAIL`. Set `GITHUB_STEP_SUMMARY` to a temp file that the tests read back, which also serves F4.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — `run.mjs` and `git` spawned with a minimal explicit env, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, fixed author/committer, `GITHUB_STEP_SUMMARY` set to a temp file.

### F9 — Purity and workflow gates rest on fragile checks

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 criterion 1.5; Phase 2 criterion 2.5
- **Detail**:
  - 1.5 ("core imports nothing but `node:`") is a grep. It passes a dynamic `import()` and any use of the global `fetch` or `process`, and `scriptsConfig` allows those globals for every `scripts/**/*.mjs`. Under the accepted lesson this is a heuristic, not proof that the core runs without network.
  - 2.5 relies on `yaml`, which is a transitive dependency of `@astrojs/check` and `vite` only, not a declared dependency.
- **Fix**:
  - Add an ESLint block for `scripts/ai-review/core.mjs` that sets the `fetch` and `process` globals to `off` and adds `no-restricted-imports` for `node:child_process`, `node:http(s)` and `node:fs`. Alternatively, have `core.test.ts` call `vi.stubGlobal("fetch", () => { throw … })` around every case.
  - List the grep as a heuristic.
  - For 2.5, make the assertion a test in `run.test.ts` that parses the YAML, or note that `yaml` is transitive.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — ESLint block for `scripts/ai-review/core.mjs` (`fetch`/`process` globals off, `no-restricted-imports` for `node:child_process`, `node:http(s)`, `node:fs`, plus dynamic `import()` banned); grep 1.5 stays a heuristic; 2.5 becomes `workflow.test.ts` with dependency-free text assertions.

### F10 — Prompt-injection leftovers: tag break-out, cross-references, backticks in paths

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §1 `buildMessages`, `sanitize`, `renderComment`
- **Detail**: Score steering is an accepted risk for an advisory job. Three cheap gaps remain:
  - A PR body or diff containing `</pr_body>` or `</diff>` closes the data tag, and the text after it reads as if it came from outside the untrusted block.
  - `sanitize` neutralises @mentions but not `#123` or `owner/repo#123`. A bot comment with those creates "mentioned this" backlinks in other issues and in other repos' timelines.
  - Excluded and omitted paths are rendered inside backticks. A file name containing a backtick ends the code span, so a following `@user` becomes a live mention, because `sanitize` runs on model text only.
- **Fix**:
  - Use a random per-run suffix on the data tag names (`<diff_ab12cd>`), or escape `</` inside the data.
  - Insert U+200B after `#` before a digit and in `owner/repo#` references in model text.
  - Escape backticks in rendered paths (or use a fenced block), and add a `renderComment` case with a path containing a backtick and an @mention.
- **Decision**: ACCEPTED (orchestrator, 2026-10-27) — random per-run data-tag suffix, U+200B after `#` before digits (covers `owner/repo#N`), backtick-safe code spans for rendered paths, plus the `renderComment` case.
