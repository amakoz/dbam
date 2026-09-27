# Review fixes queued for later phases

## From `reviews/impl-review-phase-1.md`

- **F3 (plan addendum, Phase 3):** use a generic `errorMessageKey(code)` over a shared `errors.<code>` namespace, with `errors.unknown` as the fallback, for non-auth `?error=` codes. `src/lib/auth-errors.ts` wraps it instead of duplicating it. `parseProfileForm` field errors are typed `MessageKey`. Recorded in `plan.md`, Phase 3 §1.
- **F4 (plan addendum, Phase 4):** remove the user-visible Supabase config banner. `/api/health` (200 ok / 503 misconfigured) replaces the banner as the read-only smoke signal and as the post-deploy health-check target. `errors.auth.not_configured` stops naming Supabase. Recorded in `plan.md`, Phase 4 §4, Progress 4.9/4.10.
