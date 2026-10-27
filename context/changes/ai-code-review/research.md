---
date: 2026-10-27T21:33:44+0100
researcher: Claude (Dbam worker, feat-ai-code-review)
git_commit: 74c2d1619c9fe5969f480ced47bdb9ee61858cd9
branch: feat/ai-code-review
repository: amakoz/dbam
topic: "S-09 ai-code-review: advisory AI review job on every PR to main, free model, comment + label"
tags: [research, ci, github-actions, openrouter, ai-code-review]
status: complete
last_updated: 2026-10-27
last_updated_by: Claude (Dbam worker)
---

# Research: S-09 AI code review in CI

**Date**: 2026-10-27T21:33:44+0100
**Git Commit**: 74c2d16
**Branch**: feat/ai-code-review
**Repository**: amakoz/dbam (public)

## Research Question

How should a visible, advisory CI job send a PR's title, body and filtered diff to a free model (OpenRouter `:free`, Gemini drop-in), post a scored comment plus an `ai-cr:passed`/`ai-cr:failed` label, stay green on provider failure, skip fork PRs, and never send secrets, `.env`, lockfiles or generated files — without touching the `ci`/`smoke` gates or adding a runtime dependency?

Scope: `.github/workflows/`, `scripts/`, lint/test config, README CI section, roadmap S-09. No sub-agents (change touches ≤3 modules: workflows, scripts, docs).

## Summary

- **Put the job in a new workflow file** (e.g. `.github/workflows/ai-review.yml`), not in `ci.yml`. Branch protection on `main` requires exactly the contexts `ci` and `smoke` (`gh api …/branches/main/protection` → `contexts: ["ci","smoke"]`, strict false), so a separate job named e.g. `ai-review` stays advisory by construction. `ci.yml` has no `permissions:` key (`.github/workflows/ci.yml:1-12`) and the repo default token permission is `read` (`gh api …/actions/permissions/workflow` → `default_workflow_permissions: "read"`), so the new workflow must declare `contents: read`, `pull-requests: write` (and `issues: write`, see below) itself; a separate file keeps those write scopes away from `ci`/`smoke`/`deploy`.
- **Small zero-dependency Node script** (`scripts/ai-review.mjs`) using built-in `fetch` (Node 22) for both OpenRouter and the GitHub REST API. This matches the repo's convention for CI-side scripts (`scripts/ui-check.mjs:2` "Zero dependencies on purpose", `scripts/stop-lint.mjs:2`) and needs no `npm ci` in the job. Third-party review actions exist (nashif/action-prrev, nlvedwin/ai-code-reviewer, qodo-ai/pr-agent) but each would receive the write-scoped token and the API key; none is needed for one HTTP call plus three REST calls.
- **OpenRouter**: `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer`, OpenAI-shaped body/response. Free variants: 20 req/min; 50 req/day with <10 credits purchased, 1000/day with ≥10 (Context7 `/websites/openrouter_ai`, api_reference/limits). Errors: HTTP status = `error.code` for request errors (400/401/402/403/408/429/502/503), but **some model errors arrive with HTTP 200 and an `error` object in the body** — the script must treat "200 without `choices[0].message.content`" as unavailable too. A `models: [...]` array gives in-request fallback. 16 `:free` models listed on 2026-10-27 plus the `openrouter/free` router (prompt price 0, 200k context).
- **Gemini drop-in**: Gemini exposes an OpenAI-compatible endpoint at `https://generativelanguage.googleapis.com/v1beta/openai/` with `Authorization: Bearer $GEMINI_API_KEY` (ai.google.dev/gemini-api/docs/openai). So the script only needs `base URL + model + key` as inputs to switch providers.
- **Permissions**: the fine-grained permission table lists `POST /issues/{n}/comments`, `PATCH /issues/comments/{id}`, `POST /issues/{n}/labels`, `DELETE /issues/{n}/labels/{name}` and `POST /labels` under **both** "Issues" and "Pull requests" write (docs.github.com permissions-required-for-fine-grained-personal-access-tokens). `pull-requests: write` alone should therefore suffice for comment + label on a PR; declaring `issues: write` too (as the orchestrator suggested) is harmless and guards against the label endpoints behaving as issue-scoped.
- **Labels do not exist yet**: `gh label list` shows 12 labels, none `ai-cr:*`. The REST docs do not say whether "Add labels to an issue" auto-creates a missing label (not verified, no write probe made). Plan should create both labels idempotently (`POST /labels`, treat 422 "already_exists" as OK) or have the job do it before labelling; `DELETE …/labels/{name}` returns 404 when the label is not on the PR, so removing the opposite label must tolerate 404.
- **Fork and secret-less runs**: with `pull_request`, fork PRs get no secrets and a read-only token. Guard the job with `if: github.event.pull_request.head.repo.full_name == github.repository` and additionally exit 0 with a "skipped: no API key" note when `OPENROUTER_API_KEY` is empty (also covers Dependabot-style runs). All 5 most recent merged PRs (#89–#93) are same-repo (`isCrossRepository: false`), so the real path is the same-repo one.
- **Excluded paths** (git pathspec `:(exclude)` on a local `git diff`, or a filter on the PR files API): `.env*`, `.dev.vars*`, `package-lock.json` (only lockfile tracked), `src/lib/database.types.ts`, `worker-configuration.d.ts`, `supabase/migrations/*_screening_catalog_snapshot.sql` (3 tracked), `catalog/entry.schema.json` (generated by `npm run catalog:schema`, `scripts/catalog/schema.ts:1`), and binaries (51 tracked `*.png`, e.g. committed screenshots). Mirrors the existing generated-file list in ESLint ignores (`eslint.config.js:143,145`).

## Detailed Findings

### CI structure today (`.github/workflows/ci.yml`)

- Triggers: `push` to main, `pull_request` to main, `workflow_dispatch` (`ci.yml:3-8`).
- Jobs: `ci` (`:14`), `smoke` (`:34`, S-08 appended Playwright cache/install/run/upload steps ending at `:118-121`), `migrate` (`:124`) and `deploy` (`:145`), the last two gated on `main` push/dispatch and `needs: [ci, smoke]`.
- Each of `ci`/`smoke` uses per-PR concurrency `group: <job>-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true` (`:16-18`, `:36-38`). The new job should copy this pattern (`ai-review-<pr number>`) so a quick re-push cancels the older review and saves the 50/day budget.
- No workflow-level or job-level `permissions:` anywhere in the file; repo default is `read`.
- Required status checks on `main`: `ci`, `smoke` only (GitHub API, observed 2026-10-27). Adding a job to `ci.yml` would not make it required either, but a separate workflow file isolates the write permissions and the secret.
- README `## CI` (`README.md:458-467`) documents each job; the new workflow needs a bullet there.

### Script conventions (`scripts/`)

- Existing CI-facing scripts are `.mjs`, header comment explaining purpose + "Zero dependencies on purpose" (`scripts/ui-check.mjs:1-5`, `scripts/stop-lint.mjs:1-7`).
- ESLint for `scripts/**/*.mjs` (`eslint.config.js:133-138`): type-checking disabled, `no-console` off, globals limited to `console, process, fetch, URL, URLSearchParams`. Using `AbortSignal.timeout`, `setTimeout`, `Buffer` or `Response` in the script needs those added to that globals list (or `import { setTimeout } from "node:timers/promises"`).
- Vitest only collects `src/**/*.test.ts` (`vitest.config.ts:7`). Unit tests for the script's pure parts (path filter, diff truncation, score/verdict parsing, comment rendering) need either an extra include (e.g. `scripts/**/*.test.ts`) or the pure logic in a module the tests can import. `scripts/catalog/draft-core.ts:12-13` is the precedent: pure response handling separated from I/O "so unit tests can cover it later".
- `@anthropic-ai/sdk` is a devDependency used only by `scripts/catalog/draft*.ts` (local tool, not CI); not relevant to a free provider.

### OpenRouter (Context7 `/websites/openrouter_ai`, live `/api/v1/models` on 2026-10-27)

- Request: `fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer …", "Content-Type": "application/json", "HTTP-Referer"?, "X-OpenRouter-Title"? }, body: { model | models[], messages, … } })`. Attribution headers are optional (`X-Title` still accepted).
- Rate limits for `:free`: 20 RPM; daily 50 (<10 credits) / 1000 (≥10 credits), counter resets at UTC midnight. 429 → honour `Retry-After`; for a CI job a single short retry at most, then "review unavailable".
- Error body `{ error: { code, message, metadata? } }`; HTTP 200 can also carry an `error` (model output errors). Treat any non-2xx, any `error` key, a missing/empty `choices[0].message.content`, a timeout or a network failure as "unavailable" → job green.
- `:free` models on 2026-10-27 (16): e.g. `google/gemma-4-31b-it:free` (262k ctx, `response_format` supported), `nvidia/nemotron-3-ultra-550b-a55b:free` (1M), `cohere/north-mini-code:free` (256k), `poolside/laguna-s-2.1:free` (262k), plus the `openrouter/free` router. The free list churns; the model must be a workflow input/env with a default, and the `models` fallback array (e.g. default + `openrouter/free`) reduces single-model outages. `response_format` / structured outputs are supported only by some free models (7 of 16 report `response_format`), so the parser should extract a JSON object or a `Score: N/10` line from free text rather than rely on structured output.
- Prompt logging: free endpoints may log/train on prompts (the roadmap's risk, `roadmap.md` S-09 Risk). The repo is public; mitigation is the path exclusion list and never sending env/secrets.

### GitHub API side

- PR context without extra calls: `$GITHUB_EVENT_PATH` JSON has `pull_request.title`, `.body`, `.number`, `.base.sha`, `.head.sha`, `.head.repo.full_name`. Read title/body from that file or via `env:` — never interpolate `${{ github.event.pull_request.title/body }}` into a `run:` script (script injection).
- Diff: either `actions/checkout` with `fetch-depth: 0` and `git diff <base.sha>...<head.sha> -- . ':(exclude)…'` (pathspec exclusion is native, no API size limits), or `GET /pulls/{n}/files` (paginated, `patch` omitted for large/binary files). The local git diff is simpler for exclusions; `git diff --no-binary` style handling is automatic (binary shows as "Binary files differ").
- Comment: `POST /repos/{o}/{r}/issues/{n}/comments`; to avoid one comment per push, find the previous one by a hidden marker (`<!-- ai-code-review -->`) via `GET …/issues/{n}/comments` and `PATCH /issues/comments/{id}`. GitHub comment body limit is 65,536 characters — truncate.
- Logs: print the review to stdout and append to `$GITHUB_STEP_SUMMARY` so it is visible in the job page (roadmap outcome "the job logs show the review").
- Token: `${{ secrets.GITHUB_TOKEN }}` / `github.token` with the job's `permissions:` block.

### Prompt / scoring shape (design inputs for the plan)

- Inputs: PR title, body, filtered diff (truncated to a char budget well under the model context, with a note listing excluded and truncated files).
- Output asked from the model: score 0–10 (or 1–5), short summary, findings list. Pass threshold (e.g. score ≥ 7 → `ai-cr:passed`, else `ai-cr:failed`) is a plan decision. Unavailable → no verdict label change (or remove both) plus "review unavailable" comment; the plan should pick one.
- Prompt injection from the diff/body can sway the score; acceptable because the review is advisory.

## Code References

- `.github/workflows/ci.yml:3-8` — triggers (pull_request to main included)
- `.github/workflows/ci.yml:14-18`, `:34-38` — `ci`/`smoke` jobs and per-PR concurrency pattern
- `.github/workflows/ci.yml:107-121` — S-08 e2e steps inside `smoke`
- `.github/workflows/ci.yml:124-130`, `:145-152` — migrate/deploy, main-only
- `eslint.config.js:133-138` — scripts lint config and allowed globals
- `eslint.config.js:143,145` — generated-file ignores (`database.types.ts`, `worker-configuration.d.ts`)
- `vitest.config.ts:7` — test include limited to `src/**/*.test.ts`
- `scripts/ui-check.mjs:1-5`, `scripts/stop-lint.mjs:1-7` — zero-dependency script convention
- `scripts/catalog/draft-core.ts:12-13` — pure-core/I-O split precedent
- `scripts/catalog/schema.ts:1` — `catalog/entry.schema.json` is generated
- `README.md:458-467` — CI section to extend
- `context/foundation/roadmap.md:183-196` — S-09 slice, unknowns resolved, risk

## Architecture Insights

- Gates vs advice: only `ci` and `smoke` gate merges and deploys; anything advisory belongs outside them and must exit 0 on every provider-side failure path. Real script bugs (e.g. a crash before calling the provider) are a judgment call for the plan: failing loudly surfaces bugs, but the orchestrator's decision is "provider outage or rate limit must leave the job green".
- Secret boundary: `pull_request` + same-repo guard means the key only ever runs with code pushed by a collaborator; fork PRs never see it. No `pull_request_target`.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md` (S-09 unknowns, resolved 2026-10-27): GitHub Models retired 2026-07-30; CodeRabbit parked/superseded because it runs outside CI and shows no job — supported, it is why the job must be a visible workflow run.
- Roadmap "Parked" entry for CodeRabbit (`roadmap.md:226`) and the shared-toolkit alternative (`roadmap.md:229`) — consistent with this slice.

## Related Research

Not applicable (no prior research on CI review bots in `context/changes/` or `context/archive/`).

## Open Questions (for /10x-plan)

1. Triggers: `opened, synchronize, reopened, ready_for_review` (every push reviewed, budget 50/day) vs. skipping drafts. Recommend all four with per-PR `cancel-in-progress` and skipping draft PRs.
2. Score scale and pass threshold; what label state an "unavailable" run leaves.
3. Diff budget (chars) and whether `context/**` docs count toward it (large plan/research diffs may crowd out code).
4. Whether label creation happens in the job (idempotent) or as a one-time owner step.
5. Test location for the pure core (`scripts/**/*.test.ts` include vs. module under `src/`).
6. Default model id (free list churns) — recommend `models: [<default>, "openrouter/free"]`.
