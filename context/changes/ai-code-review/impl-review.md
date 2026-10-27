<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: AI Code Review in CI Implementation Plan

- **Plan**: context/changes/ai-code-review/plan.md (revised after plan-review F1–F10)
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Checks the orchestrator asked for

| Check                                         | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger and permissions                       | ✅     | `ai-review.yml:15-18`: `pull_request` only. `:20`: `permissions: {}` at workflow level. `:27-29`: the job has `contents: read` and `pull-requests: write` only. Locked by `workflow.test.ts:21-35`.                                                                                                                                                                                                                                                                         |
| Excluded files are never read                 | ✅     | `run.mjs:64` builds the file list from `git diff --name-status -z`, then `parseNameStatus` and `planFiles`. `:67-80` runs one `git diff` per allowed file, with `:(literal)` pathspecs and explicit `--src-prefix`/`--dst-prefix`. `planFiles` excludes a rename when either side is excluded (`core.mjs:119-124`). A runner test feeds sentinels for `.env`, the lockfile, the generated types and `src/my file.ts`.                                                       |
| Secrets redacted in comment, summary and logs | ✅     | `clean()` applies `redactSecrets` and then `sanitize` (`run.mjs:54-56`) to the provider error, the unparsed answer and runner errors. The parsed review and the served model name are redacted too (`:230`, `:233`). `run.test.ts:351-374` checks stdout, stderr, the summary file and every GitHub request body. One gap in what is tested: F1.                                                                                                                            |
| `::stop-commands::` wrapping                  | ✅     | Each run gets a fresh 16-byte token (`run.mjs:41-47`), and all model or provider text goes through `logUntrusted`. The runner's own `::error::` line is printed outside the block (`:256`). The spoof test `run.test.ts:335-349` covers `::error::`, `::add-mask::` and a nested `::stop-commands::evil`.                                                                                                                                                                   |
| Deliberate breaks reverted                    | ✅     | The `.env` rule (`core.mjs:73`), the `>= 7` threshold (`:243`) and the `planFiles` call (`run.mjs:64`) are all back in place, and the tree is clean. I re-ran two of the breaks during this review: dropping the `.env` rule fails 8 tests (6 core, 2 runner), and `> 7` fails `verdict › passes at 7 and fails at 6`. After `git checkout` all 92 `scripts/ai-review` tests are green.                                                                                     |
| Exit 0 on every unavailable path              | ✅     | Each of these is tested and exits 0 with a "review unavailable" comment and no label request (`run.test.ts:274-294`): no key, network or timeout, non-2xx, a body that cannot be read or decoded, an `error` object in a 200, empty content, and no score. Two more cases also exit 0: a fork or deleted fork (`:296-304`, no requests) and "no reviewable files" (`:306-313`). Only GitHub failures, a malformed event and a git error exit 1, which matches decisions.md. |

The pure core has no imports. The purity lint fires on `node:fs`, `fetch`, `process` and `import()` (probed with `eslint --stdin`); see F3. The runner tests run with a minimal, explicit env, and git's global and system config is turned off (`run.test.ts:101-112`).

The one change outside the plan is that a diff with no reviewable file skips the provider call. It is logged in decisions.md:89 and tested.

## Success criteria

| Row           | Command                                                    | Result                                                                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1, 2.1, 2.5 | `npx vitest run scripts/ai-review/`                        | ✅ 92/92                                                                                                                                                                                                                                                          |
| 1.2, 2.2      | `npm test`                                                 | ✅ 17 files, 330/330                                                                                                                                                                                                                                              |
| 1.3, 2.3      | `npm run lint`                                             | ✅ clean                                                                                                                                                                                                                                                          |
| 1.4, 2.4      | `npx astro check`                                          | ✅ 0 errors, 0 warnings, 0 hints                                                                                                                                                                                                                                  |
| 1.5           | `grep -E "^import" scripts/ai-review/core.mjs`             | ✅ prints nothing (a heuristic; the real gate is the lint block)                                                                                                                                                                                                  |
| 1.6, 2.10     | deliberate breaks                                          | ✅ recorded in Progress; 1.6 re-run during this review                                                                                                                                                                                                            |
| 2.6           | `git diff --quiet origin/main -- .github/workflows/ci.yml` | ✅ unchanged                                                                                                                                                                                                                                                      |
| 2.7–2.9       | Manual, on the PR run                                      | ⏳ left open on purpose: they need the real provider on the PR. 2.7 also settles whether `pull-requests: write` alone can create the labels (`POST /repos/{repo}/labels`). If it gets a 403, add `issues: write` per the workflow header (`ai-review.yml:12-13`). |

## Findings

### F1 — No-leak test misses two of the runner's output paths

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ai-review/run.test.ts:351-374 (paths at scripts/ai-review/run.mjs:236 and :258)
- **Detail**: The no-leak test covers two paths: a 401 whose `error.message` contains the key, and a valid review that echoes both secrets. Two other paths print provider-derived text and have no test that puts a secret through them:
  - the "answer without a score" log (`run.mjs:236`, `logUntrusted(clean(answer.content))`);
  - the generic runner-error log (`run.mjs:258`).

  Both call `clean()` today, so nothing leaks. But the accepted lesson "Grep gates are heuristics; privacy tests are the guard" asks for a case on every output path, and if `run.mjs:236` changed to `logUntrusted(sanitize(answer.content))`, no test would fail.

- **Fix**: In the no-leak test, add a third run in which the fake provider returns `Looks fine, key ${API_KEY}, token ${GH_TOKEN}` with no `SCORE:` line. Then call `leaks()` on that run too.
- **Decision**: PENDING

### F2 — git's stderr reaches the job log outside any stop-commands block

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ai-review/run.mjs:58-60
- **Detail**: `execFileSync("git", args, { encoding, maxBuffer })` has no `stdio` option, and Node then passes the child's stderr straight to the parent's stderr. Git warnings and errors (for example `fatal: …` on a bad pathspec) are printed as-is, without the `logUntrusted` wrapper. The Actions runner reads workflow commands from that output too. The text is git's own, and same-repo authors are trusted, so the risk is small. Still, it is the one path that bypasses the F1 rule from the plan review.
- **Fix**: Pass `stdio: ["ignore", "pipe", "pipe"]` in `git()`. On failure, print `err.stderr` through `logUntrusted(clean(…))` before rethrowing.
- **Decision**: PENDING

### F3 — Purity lint does not catch `globalThis.fetch` or `globalThis.process`

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: eslint.config.js (`aiReviewCoreConfig`)
- **Detail**: The probe with `eslint --stdin --stdin-filename scripts/ai-review/core.mjs` showed that `globalThis.fetch("x")` passes. Only the bare `fetch`, `process`, the restricted imports and `import()` are flagged. The plan made this lint block the purity gate, in place of the 1.5 grep, so it should also catch the obvious way around it.
- **Fix**: Add `no-restricted-properties` entries for `globalThis.fetch` and `globalThis.process` to `aiReviewCoreConfig`, or disallow `globalThis` there with `no-restricted-globals`.
- **Decision**: PENDING

### F4 — Score regex accepts `8/100` and a score anywhere in the text

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ai-review/core.mjs:227
- **Detail**: `/SCORE:\s*(\d{1,2})\s*\/\s*10/i` has no boundary after `10`, so `SCORE: 8/100` parses as 8. It is also not anchored to the start of a line, so a `score: 9/10` that the model quotes from the PR body or diff, before its own line, is taken as the result. The plan only asks for the "first match", so this does not drift from the plan. Tightening it is cheap and makes the label harder to steer.
- **Fix**: Use `/^\s*SCORE:\s*(\d{1,2})\s*\/\s*10\b/im`. Add `parseReview` cases for `SCORE: 8/100` (expect no score) and for a quoted mid-line `score: 9/10` that comes before the real `SCORE:` line.
- **Decision**: PENDING

### F5 — Other GitHub cross-reference forms are left live

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ai-review/core.mjs:277-278
- **Detail**: `sanitize` neutralises `@user`, `#123` and `owner/repo#123`. GitHub also links `GH-123`, and a full `https://github.com/<owner>/<repo>/issues/<n>` (or `/pull/<n>`) URL in a bot comment adds a "mentioned this" event to that issue's timeline, including in other repos. This follows on from plan-review F10, which named only `#N`.
- **Fix**: Insert U+200B after `GH-` when a digit follows. For GitHub issue and PR URLs, break the autolink, for example by putting a ZWSP after `github.com`, or render them as code. Add one `sanitize` case for each.
- **Decision**: PENDING

### F6 — Every allowed file is diffed even after the budget is spent

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/ai-review/run.mjs:67-84
- **Detail**: `collectDiff` runs one synchronous `git diff` per allowed file and reads each whole patch (`maxBuffer` 256 MiB) before `selectDiff` drops everything past 60,000 chars. On a large PR, such as a mass rename or a vendored directory, that means hundreds of process starts, and possibly very large patches held in memory, only to list the files as "omitted". This is not a correctness problem, and the job has a 10-minute timeout.
- **Fix**: Keep a running total in `collectDiff`. Once the budget is used up, push the remaining allowed `displayPath`s straight to `omitted` without diffing them; a binary file among them is simply listed as omitted.
- **Decision**: PENDING
