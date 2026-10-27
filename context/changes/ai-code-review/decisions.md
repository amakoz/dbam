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
