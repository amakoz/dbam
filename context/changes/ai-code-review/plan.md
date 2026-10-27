# AI Code Review in CI Implementation Plan

## Overview

Add an advisory GitHub Actions job that, on every non-draft pull request to `main`, sends the PR title, body and a filtered, size-capped diff to a free OpenRouter model, then posts one sticky scored review comment and an `ai-cr:passed` / `ai-cr:failed` label. Provider trouble never turns the job red, and the job is never a required check. Delivers roadmap S-09 (PRD MS-08).

## Current State Analysis

- One workflow, `.github/workflows/ci.yml`, with jobs `ci`, `smoke`, `migrate`, `deploy`; no `permissions:` key anywhere (`ci.yml:1-12`). The repo's default workflow token is read-only (`default_workflow_permissions: "read"`).
- Required status checks on `main` are exactly `ci` and `smoke` (branch protection API, 2026-10-27). A job in another workflow file is advisory by construction.
- `ci`/`smoke` use per-PR concurrency `<job>-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true` (`ci.yml:16-18`, `:36-38`).
- CI-side scripts are zero-dependency `.mjs` with a purpose header (`scripts/ui-check.mjs:1-5`, `scripts/stop-lint.mjs:1-7`). ESLint for `scripts/**/*.mjs` disables type-checking and allows only the globals `console, process, fetch, URL, URLSearchParams` (`eslint.config.js:133-138`).
- Vitest collects only `src/**/*.test.ts` (`vitest.config.ts:7`). TypeScript has `allowJs: true` (astro base tsconfig), so `.ts` tests can import `.mjs` modules; JSDoc types keep the type-checked lint on the test files clean.
- Pure-core / I-O split precedent: `scripts/catalog/draft-core.ts:12-13`.
- `OPENROUTER_API_KEY` is set as a repo secret (2026-10-27). Labels `ai-cr:passed` / `ai-cr:failed` do not exist yet. The repo is public; recent PRs are all same-repo.

## Desired End State

- `.github/workflows/ai-review.yml` runs a job `ai-review` on `pull_request` (`opened, synchronize, reopened, ready_for_review`) to `main`, skipped for drafts, with job-level `permissions: { contents: read, pull-requests: write, issues: write }`.
- On a same-repo PR with a working provider, the PR has exactly one bot comment starting with the hidden marker `<!-- ai-code-review -->`, showing `N/10`, the verdict, the review, the model used, the reviewed commit and the lists of excluded and omitted files; it has exactly one of the two `ai-cr:*` labels; the job log and step summary show the same review.
- On a later push the same comment is edited, not duplicated.
- When the provider is unavailable, the comment says `review unavailable: <reason>`, labels are unchanged, the job is green.
- Fork PRs: the job logs a skip note and exits 0 without calling any API.
- Verified by `npm test` (unit + fake-server integration tests), `npm run lint`, `npx astro check`, and the job reviewing its own PR (PR Manual checks).

### Key Discoveries:

- OpenRouter returns some model errors as HTTP 200 with an `error` object (Context7 `/websites/openrouter_ai`, errors-and-debugging) — "200 without content" must count as unavailable.
- Both "Issues" and "Pull requests" write cover PR comment and label endpoints (GitHub fine-grained permission table); `DELETE /issues/{n}/labels/{name}` returns 404 when the label is absent.
- Free `:free` limits: 20 req/min, 50 req/day with <10 credits purchased. No retries.
- Gemini's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`, Bearer key) makes a provider switch a matter of base URL + model + key env, with fallback models left empty.
- Lesson "Grep gates are heuristics; privacy tests are the guard" (`context/foundation/lessons.md`): the "never send excluded files" rule is gated by tests that feed excluded files through the prompt builder and the real script and assert they are absent from the provider payload — not by a grep.

## What We're NOT Doing

- Not a required check, not in `ci.yml`, no change to `ci`/`smoke`/`migrate`/`deploy`.
- No `pull_request_target`, no review of fork PRs, no secrets for forks.
- No inline (line-level) review comments or GitHub "review" objects — one issue comment only.
- No retries on 429/5xx, no paid models, no new npm dependency, no third-party review action.
- No secret-content scanning of diffs (path-based exclusion only; the repo is public and the diff is already public).
- No roadmap status change (done by `/10x-archive`).

## Implementation Approach

Two zero-dependency modules under `scripts/ai-review/`: `core.mjs` (pure: diff parsing, path rules, ordering, budget, prompt, response parsing, verdict, comment rendering, sanitising) and `run.mjs` (I/O: event file, `git diff`, OpenRouter call, GitHub REST calls, log and step summary). Phase 1 builds and unit-tests the core with no network. Phase 2 adds the runner, the workflow and docs, and tests the runner end-to-end against a local fake HTTP server standing in for both OpenRouter and GitHub, using a temporary git repo.

## Critical Implementation Details

- **Untrusted input in the workflow**: never interpolate `${{ github.event.pull_request.title }}`/`body` into `run:`; the runner reads them from `$GITHUB_EVENT_PATH`.
- **Sticky comment ownership**: match the marker only on comments by `github-actions[bot]`, and strip the marker (and any HTML comment) from model output, so neither a human nor the model can make the bot edit or spoof a different comment.
- **Diff command**: `git diff --no-color --no-ext-diff --no-textconv HEAD^1 HEAD` on the `pull_request` merge commit (checkout `fetch-depth: 2`); a `.gitattributes` diff driver must not run.

## Phase 1: Pure review core

### Overview

All decision logic as pure functions with unit tests; no network, no filesystem, no process access.

### Changes Required:

#### 1. Core module

**File**: `scripts/ai-review/core.mjs` (new)

**Intent**: Hold every rule the review applies so it is unit-testable: which files may be sent, in what order and how much, what the model is told, how its answer is read, which label follows, and what the comment looks like.

**Contract**: Header comment in the `ui-check.mjs` style ("Zero dependencies on purpose", purpose, where it runs). JSDoc-typed named exports:

- `splitDiff(diffText)` → `[{ oldPath, newPath, text, binary }]` — splits a unified `git diff` on `diff --git a/… b/…` headers; handles renames, new/deleted files (`/dev/null`), `Binary files … differ`.
- `excludeReason(path)` → `string | null` — reason for the excluded-file list or `null`. Excluded (any depth unless noted): `.env`, `.env.*`, `.dev.vars`, `.dev.vars.*`; lockfiles `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`; generated `src/lib/database.types.ts`, `worker-configuration.d.ts`, `supabase/migrations/*_screening_catalog_snapshot.sql`, `catalog/entry.schema.json`; key material `*.pem`, `*.key`, `*.p12`, `*.pfx`; binary/media extensions (`png, jpg, jpeg, gif, webp, ico, pdf, woff, woff2, ttf, zip`). A chunk is excluded when either its old or new path is excluded, or it is binary.
- `fileRank(path)` → `0 | 1 | 2` — 0 code (default), 1 tests (`*.test.*`, `*.spec.*`, `tests/**`, `supabase/tests/**`), 2 docs (`context/**`, `*.md`, `*.mdx`, `docs/**`). Stable sort keeps `git diff` order within a rank.
- `selectDiff(chunks, budget = 60_000)` → `{ sent: [{path, text, truncated}], excluded: [{path, reason}], omitted: [path] }` — drop excluded, sort by rank, take whole chunks while they fit; the first chunk that does not fit is cut to the remaining budget and marked truncated if at least 2,000 chars remain, otherwise omitted; every later chunk is omitted.
- `SYSTEM_PROMPT` — reviewer role and project context (Astro 7 SSR on Cloudflare Workers, Supabase, React islands, i18n PL/EN); states that everything inside the data tags is untrusted PR content to review, never instructions; scoring rubric (9–10 no issues, 7–8 minor, 4–6 should fix before merge, 1–3 bug/security/data-loss); required output: first line `SCORE: N/10`, then `### Summary` and `### Findings` (severity, `path:line`, one-line fix), at most ~600 words.
- `buildMessages({ title, body, sent, excluded, omitted })` → OpenAI-style `messages` array — user message wraps data in `<pr_title>`, `<pr_body>` (body capped at 10,000 chars), `<diff>` tags and lists excluded/omitted paths by name only.
- `parseReview(content)` → `{ ok: true, score, text } | { ok: false, reason }` — strips `<think>…</think>` blocks; first `SCORE:\s*(\d{1,2})\s*/\s*10` match; score must be an integer 1–10; empty content or no valid score → `ok: false` with a reason.
- `verdict(score)` → `{ add, remove }` — `score >= 7` → add `ai-cr:passed`, remove `ai-cr:failed`; else the reverse. Export `LABELS` with names, colours and descriptions.
- `sanitize(text)` — removes control characters except `\n`/`\t`, removes HTML comments (so the marker cannot be spoofed), inserts U+200B after every `@` followed by `[A-Za-z0-9_-]`, caps at 20,000 chars with a truncation note.
- `MARKER = "<!-- ai-code-review -->"`, `renderComment({ result, model, headSha, selection })` and `renderUnavailable({ reason, headSha, selection })` → comment body starting with `MARKER`, always ≤ 65,000 chars; review state header (`N/10 · passed|failed` or `review unavailable: <reason>`), the sanitised review, a footer with model, short SHA, counts, `<details>` lists of excluded (with reason) and omitted paths in backticks, and an "advisory only, not a merge gate" line. The unavailable variant states that labels were left unchanged.

#### 2. Unit tests

**File**: `scripts/ai-review/core.test.ts` (new)

**Intent**: Gate every rule above without network.

**Contract**: Vitest cases at least for: `splitDiff` on modified, added, deleted, renamed and binary chunks; `excludeReason` for each excluded family including nested `.env.local`, `.env.example` (excluded on purpose: every `.env*` name is, template or not) and the snapshot-migration glob, and `null` for `src/pages/index.astro`; rename from an excluded path is excluded; ordering code → tests → docs; budget: exact-fit, cut-with-truncated-flag, below-2,000-remaining omitted, everything after the cut omitted; **privacy guard**: a diff containing `.env`, `.dev.vars`, `package-lock.json`, `src/lib/database.types.ts` and a snapshot migration, each with a unique sentinel string, run through `splitDiff → selectDiff → buildMessages`, asserts no sentinel appears in the serialised messages while the code file's sentinel does; system prompt contains the untrusted-input instruction; `parseReview` for `SCORE: 8/10`, `Score: 7 / 10`, `<think>SCORE: 2/10</think>SCORE: 9/10` (→ 9), `SCORE: 0/10`, `SCORE: 11/10`, missing score, empty; `verdict(7)` passes and `verdict(6)` fails; `sanitize` neutralises `@user` and `@org/team`, leaves `a@b` email-like text readable, strips the marker and control chars, caps length; `renderComment` starts with `MARKER`, contains no un-neutralised `@` mention from model text, and stays ≤ 65,000 chars for a 100k-char review and 500 omitted paths.

#### 3. Test discovery

**File**: `vitest.config.ts`

**Intent**: Let Vitest collect tests next to scripts.

**Contract**: `include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]`.

### Success Criteria:

#### Automated Verification:

- Core unit tests pass, including the privacy-guard case: `npx vitest run scripts/ai-review/core.test.ts`
- Full unit suite still passes: `npm test`
- Lint is clean: `npm run lint`
- Type check is clean: `npx astro check`
- The core module imports nothing but `node:` built-ins (and in practice nothing at all): `grep -E "^import" scripts/ai-review/core.mjs` prints no non-`node:` import

**Implementation Note**: After automated verification passes, continue to Phase 2 (no manual rows in this phase).

---

## Phase 2: Runner, workflow and docs

### Overview

Wire the core to the real world: read the PR event, diff, call the provider, update the sticky comment and labels, log; add the workflow; document it; test the runner end-to-end against a local fake server.

### Changes Required:

#### 1. Runner

**File**: `scripts/ai-review/run.mjs` (new)

**Intent**: The single entry point the workflow runs. It keeps every provider failure green and every wiring failure visible.

**Contract**: Env inputs: `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, `GITHUB_API_URL` (default `https://api.github.com`), `GITHUB_TOKEN`, `GITHUB_STEP_SUMMARY` (optional), `AI_REVIEW_API_KEY`, `AI_REVIEW_BASE_URL` (default `https://openrouter.ai/api/v1`), `AI_REVIEW_MODEL` (default `poolside/laguna-s-2.1:free`), `AI_REVIEW_FALLBACK_MODELS` (comma list, default `openrouter/free`; empty → send `model` instead of `models`, for Gemini), `AI_REVIEW_TIMEOUT_MS` (default 120,000). Flow:

1. Read the event JSON. If `pull_request.head.repo.full_name !== GITHUB_REPOSITORY` → print `ai-review skipped: fork PR (no secrets)` to log and step summary, exit 0, no network.
2. `git diff --no-color --no-ext-diff --no-textconv HEAD^1 HEAD` (cwd = repo) → `splitDiff` → `selectDiff`.
3. No key → unavailable `no API key`. Otherwise `POST {base}/chat/completions` with `Authorization: Bearer`, `messages`, `model`/`models`, `max_tokens: 8192`, `temperature: 0.2`, `AbortSignal.timeout`, plus `HTTP-Referer`/`X-OpenRouter-Title` only when the base URL is OpenRouter. Non-2xx → unavailable `HTTP <status>` (+ provider `error.message`, sanitised, ≤200 chars); network/timeout → unavailable `timeout`/`network error`; `error` in body or no `choices[0].message.content` → unavailable `no content`; `parseReview` failure → unavailable with its reason (log the sanitised raw text).
4. Upsert the sticky comment: list `GET /repos/{repo}/issues/{n}/comments?per_page=100&page=k` until a short page; the first comment with `user.login === "github-actions[bot]"` and body starting with `MARKER` is `PATCH`ed, else `POST` a new one.
5. Only on a parsed review: `POST /repos/{repo}/labels` for both labels (201 or 422 = ok), `POST /issues/{n}/labels` with the verdict label, `DELETE /issues/{n}/labels/{opposite}` (200 or 404 = ok).
6. Print the rendered comment to stdout and append it to `GITHUB_STEP_SUMMARY`. Exit 0. Any GitHub API failure in 4–5 → `::error::` line with method, path and status, exit 1.

The API key and token are never printed; error text from the provider passes through `sanitize`.

#### 2. Integration tests

**File**: `scripts/ai-review/run.test.ts` (new)

**Intent**: Prove the runner's contract — green on provider failure, correct GitHub calls, nothing excluded leaves the runner — without touching the internet.

**Contract**: Each test creates a temp git repo (two commits; the second adds `src/app.ts`, `.env`, `package-lock.json`, `src/lib/database.types.ts`, each with a unique sentinel), writes an event JSON, starts one `node:http` fake server on a random port that records requests and serves both the provider and GitHub routes, and spawns `node scripts/ai-review/run.mjs` with `cwd` = temp repo and env pointing `AI_REVIEW_BASE_URL`/`GITHUB_API_URL` at it. Cases:

- success `SCORE: 8/10` → exit 0; provider request body contains the `src/app.ts` sentinel and none of the excluded sentinels; `models` = `[default, "openrouter/free"]`; comment POSTed with `MARKER`; labels created, `ai-cr:passed` added, `ai-cr:failed` DELETE answered 404 and tolerated.
- existing bot comment with `MARKER` → PATCH, no POST; a human comment containing the marker is ignored.
- `SCORE: 4/10` → `ai-cr:failed` added, `ai-cr:passed` removed.
- provider 429, provider 503, 200 with `{ error }`, 200 with empty content, provider never answers with `AI_REVIEW_TIMEOUT_MS=200`, no `AI_REVIEW_API_KEY` → exit 0, comment contains `review unavailable:`, no label request recorded.
- fork event → exit 0, zero requests recorded, stdout has the skip note.
- GitHub comment POST answers 403 → exit 1 with `::error::`.
- empty `AI_REVIEW_FALLBACK_MODELS` → body has `model`, no `models`.
- the API key value never appears in stdout/stderr.

#### 3. Workflow

**File**: `.github/workflows/ai-review.yml` (new)

**Intent**: The visible advisory job.

**Contract**: `name: AI review`; `on.pull_request` with `branches: [main]`, `types: [opened, synchronize, reopened, ready_for_review]`; no `pull_request_target`; no workflow-level `permissions`. One job `ai-review` (name must not be `ci` or `smoke`): `if: ${{ !github.event.pull_request.draft }}`; `permissions: { contents: read, pull-requests: write, issues: write }`; `concurrency: { group: ai-review-${{ github.event.pull_request.number }}, cancel-in-progress: true }`; `timeout-minutes: 10`; steps: `actions/checkout@v4` with `fetch-depth: 2`, `persist-credentials: false`; `actions/setup-node@v4` with `node-version: 22` (no cache, no `npm ci`); `run: node scripts/ai-review/run.mjs` with `env` `AI_REVIEW_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}`, `GITHUB_TOKEN: ${{ github.token }}`, and job-level `env` `AI_REVIEW_MODEL`, `AI_REVIEW_FALLBACK_MODELS`, `AI_REVIEW_BASE_URL` with a comment explaining the Gemini switch (base URL `https://generativelanguage.googleapis.com/v1beta/openai`, a Gemini model id, empty fallbacks, key secret swapped). A short header comment says: advisory, not a required check, provider failures stay green, forks skipped.

#### 4. Lint globals

**File**: `eslint.config.js`

**Intent**: Allow the Node globals the runner uses.

**Contract**: Add only the globals actually used (expected `AbortSignal`) to `scriptsConfig.languageOptions.globals` (`eslint.config.js:136`), or import from `node:` modules instead.

#### 5. Docs

**Files**: `README.md`, `CLAUDE.md`

**Intent**: Make the job and the new test location discoverable.

**Contract**: README `## CI` (`README.md:458`): a bullet for the `AI review` workflow — what it sends and never sends, model env and Gemini switch, labels, sticky comment, advisory/green-on-outage, fork skip, 50/day budget. CLAUDE.md `npm test` bullet: Vitest also collects `scripts/**/*.test.ts`; one line in Build/Test listing that `ai-review` is advisory and must not be added to required checks.

### Success Criteria:

#### Automated Verification:

- Runner integration tests pass against the fake server: `npx vitest run scripts/ai-review/run.test.ts`
- Full unit suite passes: `npm test`
- Lint is clean: `npm run lint`
- Type check is clean: `npx astro check`
- The workflow parses and keeps its guarantees: `node -e` with the installed `yaml` package asserts `on.pull_request` (types as planned, no `pull_request_target`), job `ai-review` with exactly `contents: read, pull-requests: write, issues: write`, `persist-credentials: false`, no `${{ github.event.pull_request.title` / `.body` in any `run:`
- `ci.yml` is unchanged: `git diff --quiet origin/main -- .github/workflows/ci.yml`

#### Manual Verification:

- On this change's own PR, the `AI review / ai-review` job runs, its log and step summary show the review, the PR gets one marker comment with `N/10` and exactly one `ai-cr:*` label (PR Manual checks)
- A second push to the PR edits the same comment instead of adding one (PR Manual checks)
- The PR's merge box lists `ai-review` as a non-required check; `ci` and `smoke` stay the only required ones (PR Manual checks)

**Implementation Note**: The manual rows need the open PR; they go to the PR description's Manual checks list, not to a local pause.

---

## Testing Strategy

### Unit Tests:

- Core rules (Phase 1 §2): diff splitting, exclusion families, ordering, budget edges, prompt content, score parsing edges, verdict boundary 6/7, sanitising, comment caps.
- Privacy guard: sentinels in excluded files never reach the provider messages (core) or the provider request body (runner).

### Integration Tests:

- Runner against a local fake OpenRouter + GitHub server and a temp git repo (Phase 2 §2): success, re-run PATCH, fail verdict, six unavailable causes, fork skip, GitHub 403, Gemini-style no-fallback body, no key leak.

### Manual Testing Steps:

1. Open the PR; watch `AI review / ai-review`; read the review in the job log and step summary.
2. Check the PR comment (marker, score, model, SHA, excluded `package-lock.json` etc. if touched) and the label.
3. Push a follow-up commit; confirm the same comment updates and the label follows the new score.

## Performance Considerations

One provider call per non-draft push, cancelled by the next push; at most ~60k chars of diff plus prompt (~20k tokens). The job needs no `npm ci`, so it finishes in well under a minute plus model latency (timeout 120 s, job timeout 10 min). The 50/day free budget is shared by all PRs; exhaustion yields "review unavailable", not a red job.

## Migration Notes

Not applicable: no schema, no deploy change. Rollback = delete the workflow file; the labels stay harmlessly.

## References

- Research: `context/changes/ai-code-review/research.md`
- Decisions: `context/changes/ai-code-review/decisions.md`
- Script conventions: `scripts/ui-check.mjs:1-5`, `scripts/catalog/draft-core.ts:12-13`
- CI structure: `.github/workflows/ci.yml:3-18`
- Lint scope: `eslint.config.js:133-138`; tests: `vitest.config.ts:7`
- Roadmap slice: `context/foundation/roadmap.md` (S-09)
- Lesson: `context/foundation/lessons.md` ("Grep gates are heuristics; privacy tests are the guard")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pure review core

#### Automated

- [ ] 1.1 Core unit tests pass, including the privacy-guard case
- [ ] 1.2 Full unit suite still passes
- [ ] 1.3 Lint is clean
- [ ] 1.4 Type check is clean
- [ ] 1.5 The core module imports nothing but node: built-ins

### Phase 2: Runner, workflow and docs

#### Automated

- [ ] 2.1 Runner integration tests pass against the fake server
- [ ] 2.2 Full unit suite passes
- [ ] 2.3 Lint is clean
- [ ] 2.4 Type check is clean
- [ ] 2.5 The workflow parses and keeps its guarantees
- [ ] 2.6 ci.yml is unchanged

#### Manual

- [ ] 2.7 On this change's own PR, the AI review job runs, logs the review, posts one marker comment with N/10 and exactly one ai-cr label (PR Manual checks)
- [ ] 2.8 A second push to the PR edits the same comment instead of adding one (PR Manual checks)
- [ ] 2.9 The PR's merge box lists ai-review as a non-required check; ci and smoke stay the only required ones (PR Manual checks)
