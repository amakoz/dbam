---
change_id: ai-code-review
title: Advisory AI code review job that comments and labels every PR to main
status: implemented
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Roadmap M-02 S-09 (PRD MS-08): every pull request to main triggers a visible CI job that sends the PR title, body and diff to a review agent, which posts a scored review comment on the PR (and an ai-cr:passed / ai-cr:failed label). The job logs show the review, and the model provider costs nothing. Provider: OpenRouter `:free` model (20 req/min, 50/day), key in repo secret OPENROUTER_API_KEY (already set by the owner); the model is a job input so a Gemini free-tier key is a drop-in fallback. Decided by orchestrator (roadmap default, log it): advisory only (label + comment, NOT a required check; a provider outage or rate limit must leave the job green with a "review unavailable" note). Risks: free providers may log prompts; the repo is public so the diff is already public, but the job must never send secrets, .env files, lockfiles or generated files (e.g. src/lib/database.types.ts, *_screening_catalog_snapshot.sql). Fork PRs get no secrets: skip cleanly. Use pull_request (not pull_request_target) so untrusted PR code never runs with the secret.
