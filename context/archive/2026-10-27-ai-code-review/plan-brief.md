# AI Code Review in CI — Plan Brief

> Full plan: `context/changes/ai-code-review/plan.md`
> Research: `context/changes/ai-code-review/research.md`
> Plan review: `context/changes/ai-code-review/plan-review.md` (F1–F10 accepted, folded in)

## What & Why

Every non-draft pull request to `main` gets an advisory AI review from a visible CI job: the PR title, body and a filtered diff go to a free OpenRouter model, and the job posts one scored comment plus an `ai-cr:passed` / `ai-cr:failed` label. This delivers roadmap S-09 (PRD MS-08) at zero model cost, without ever blocking a merge.

## Starting Point

`ci.yml` holds `ci`, `smoke`, `migrate`, `deploy`; only `ci` and `smoke` are required on `main`, and the workflow token defaults to read-only. CI scripts are zero-dependency `.mjs` files; Vitest collects only `src/**/*.test.ts`. `OPENROUTER_API_KEY` is already a repo secret; the `ai-cr:*` labels do not exist yet.

## Desired End State

A separate `AI review` workflow runs job `ai-review` on each push to a PR. The PR shows one sticky comment (`N/10`, verdict, findings, model, commit, excluded/omitted files) that is edited on later pushes, and exactly one `ai-cr:*` label. If the provider is down or rate-limited, the comment says `review unavailable: <reason>`, labels stay as they were, and the job is green. Fork PRs (and deleted forks) are skipped with a log note; GitHub's fork policy is the real boundary. Excluded files are never read, model text cannot act as a workflow command, and no secret value reaches the log, summary or PR.

## Key Decisions Made

| Decision          | Choice                                                                                                                                                                                                                                      | Why (1 sentence)                                                                         | Source                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------- |
| Gate or advice    | Advisory: label + comment, not a required check                                                                                                                                                                                             | Free models are rate-limited and a provider outage must not block a release              | Orchestrator                |
| Trigger           | `pull_request` (opened, synchronize, reopened, ready_for_review), drafts skipped, per-PR cancel-in-progress                                                                                                                                 | Untrusted fork code never runs with the secret; re-pushes save the 50/day budget         | Orchestrator                |
| Placement         | New workflow file, job `ai-review`; `ci.yml` untouched                                                                                                                                                                                      | Keeps write permissions away from gate/deploy jobs; advisory by construction             | Research                    |
| Score → label     | 1–10; `>= 7` → `ai-cr:passed`, else `ai-cr:failed`, opposite removed (404 ok)                                                                                                                                                               | Simple, visible threshold                                                                | Orchestrator                |
| Unavailable       | No key / 429 / 5xx / 200 without content / non-JSON body / timeout / no score → comment + log note, labels unchanged, exit 0                                                                                                                | Provider trouble must stay green                                                         | Orchestrator                |
| Wiring failures   | GitHub API errors while commenting/labelling → exit 1                                                                                                                                                                                       | A broken setup should be visible; the job is non-required anyway                         | Plan                        |
| Diff              | `--name-status -z` list → pure `planFiles()` → one literal-pathspec `git diff` per allowed file; case-insensitive denylist + fail-closed `secret`/`credential`/`private` names; code → tests → docs, ~60k-char budget, omitted files listed | Excluded content is never read, so no parser bug can leak it; code gets the budget first | Orchestrator + Review F2/F5 |
| Model             | `poolside/laguna-s-2.1:free` with fallback `openrouter/free`; env-configurable, Gemini via base URL + empty fallbacks                                                                                                                       | Newest code-specialised free model; one env swap changes provider                        | Orchestrator + Plan         |
| Comment           | One sticky comment by `github-actions[bot]` with a hidden marker; `@` and `#N` neutralised; backtick-safe paths; capped length                                                                                                              | No spam per push; the bot cannot ping people, cross-reference issues or be spoofed       | Orchestrator + Review F10   |
| Permissions       | Workflow `permissions: {}`; job `contents: read` + `pull-requests: write` (`issues: write` only after a real 403)                                                                                                                           | Narrowest token that covers comments and labels                                          | Review F6                   |
| Injection & leaks | Nonce-suffixed data tags; model/provider stdout inside `::stop-commands::<random>`; API key and token redacted in every provider-derived string                                                                                             | PR content steers the model, so its output is treated as hostile text                    | Review F1/F4/F10            |
| Proof             | Deliberate breaks 1.6 and 2.10; ESLint purity block for the core; isolated test env; workflow text test                                                                                                                                     | Tests must be shown to turn red, and must not depend on the dev machine                  | Review F3/F8/F9             |
| Code shape        | Zero-dep `scripts/ai-review/core.mjs` (pure) + `run.mjs` (I/O); tests in `scripts/**/*.test.ts`                                                                                                                                             | Matches script conventions; core testable without network                                | Orchestrator                |

## Scope

**In scope:** pure core + unit tests; runner; `.github/workflows/ai-review.yml`; fake-server integration tests; workflow text test; vitest include; ESLint purity block and script globals; README CI + CLAUDE.md notes.

**Out of scope:** required check; `pull_request_target`/fork reviews; inline line comments; retries; paid models; new dependencies; secret-content scanning; roadmap status.

## Architecture / Approach

Workflow → `node scripts/ai-review/run.mjs` → reads `$GITHUB_EVENT_PATH` → `git diff --name-status -z` → core (`parseNameStatus → planFiles`) → one `git diff` per allowed file → core (`selectDiff → buildMessages` with a per-run nonce) → OpenRouter `chat/completions` (`models: [default, openrouter/free]`) → core (`parseReview → verdict → renderComment`) → GitHub REST (upsert comment, ensure + set labels) → stdout (inside a stop-commands block) + step summary. Endpoints come from env, so tests swap both for a local fake server.

## Phases at a Glance

| Phase                        | What it delivers                                                                                                                             | Key risk                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1. Pure review core          | File planning/budget, prompt, parser, verdict, redaction, comment renderer + unit tests incl. privacy guard; ESLint purity; deliberate break | Exclusion rules miss a path family (mitigated by the fail-closed name rule) |
| 2. Runner, workflow and docs | Runner, `ai-review.yml`, fake-server integration + workflow tests, docs; deliberate break; self-review on its own PR                         | Free model output format drifts (no `SCORE:` line) → frequent "unavailable" |

**Prerequisites:** `OPENROUTER_API_KEY` repo secret (done). No owner step for labels.
**Estimated effort:** ~1–2 sessions across 2 phases.

## Open Risks & Assumptions

- Free model list churns; the default may disappear. Mitigation: `openrouter/free` fallback and an env-only model swap.
- Free providers may log prompts; the repo is public and exclusions keep secrets/env/generated files out.
- PR content can try to steer the score (prompt injection); accepted because the review is advisory.
- 50 free requests/day across all PRs; heavy push days end in "review unavailable".

## Success Criteria (Summary)

- Every non-draft same-repo PR to `main` shows a green `ai-review` job, one scored sticky comment and one `ai-cr:*` label.
- A provider outage or rate limit produces a "review unavailable" note and a green job; forks are skipped cleanly.
- Tests prove that `.env*`, lockfiles and generated files are never read or sent, that secrets never leak to any output, and that model text cannot run workflow commands; deliberate breaks prove those tests turn red.
