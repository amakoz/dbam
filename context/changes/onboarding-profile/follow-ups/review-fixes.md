# Review fixes queued for later phases

## From `reviews/impl-review-phase-1.md`

- **F3 (plan addendum, Phase 3):** use a generic `errorMessageKey(code)` over a shared `errors.<code>` namespace, with `errors.unknown` as the fallback, for non-auth `?error=` codes. `src/lib/auth-errors.ts` wraps it instead of duplicating it. `parseProfileForm` field errors are typed `MessageKey`. Recorded in `plan.md`, Phase 3 §1.
- **F4 (plan addendum, Phase 4):** remove the user-visible Supabase config banner. `/api/health` (200 ok / 503 misconfigured) replaces the banner as the read-only smoke signal and as the post-deploy health-check target. `errors.auth.not_configured` stops naming Supabase. Recorded in `plan.md`, Phase 4 §4, Progress 4.9/4.10.

## From `reviews/impl-review.md` (full plan, 2026-09-28)

- **F1 residual — withdrawal vs. concurrent profile save race:** under READ COMMITTED a profile upsert racing `withdraw_health_data_consent()` (same user, two tabs) can still insert a profile after the consent is withdrawn, because the RLS `exists(...)` check reads a stale snapshot. Close it with a `select … for share` on the active consent row in the profile write path (or a profiles trigger). Low likelihood; needs the user racing themselves.
- **F7 — re-consent rule:** decide at the first material change of the consent text whether existing users must re-consent (then `hasActiveConsent` checks `consent_version`).
- **F9 — Progress SHAs:** at `/10x-archive`, repoint phase rows to the `main` squash commits (`670912f` for phases 1–2, `6f1a980` for phases 3–4) via the approved SHA-repoint step.
- **F6 — legal gate (#27):** confirm Supabase backup retention for the plan in use, and whether the consent proof should survive account deletion (today `on delete cascade` removes it; Art. 17(3)(e) could argue for keeping it).
