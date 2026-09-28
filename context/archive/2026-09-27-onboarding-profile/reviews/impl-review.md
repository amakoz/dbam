<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Onboarding Profile

- **Plan**: context/changes/onboarding-profile/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence:

- **Diff reviewed**: `6a4035d..6f1a980` (PR #30 for phases 1–2 and PR #35 for phases 3–4). PR #36 (a CI-only retry) is outside this plan.
- **Plan adherence**: every planned item in Phases 1–4, including the F3/F4 addenda, is a MATCH. There are no MISSING items and no "What We're NOT Doing" violations.
- **Automated criteria**, re-run on `e7921c9` (merged `main`):
  - lint: PASS
  - `astro check`: 0 errors
  - build: PASS
  - `supabase test db`: 29/29
  - `db:types`: no diff
  - full local smoke: PASS
  - read-only smoke: PASS
- **Manual rows**:
  - All manual rows except 4.8 are ticked, each one confirmed by the owner in conversation before its commit.
  - 4.8 (the production walkthrough) was also confirmed by the owner, but is left unticked until this review is triaged.
- **Pre-existing phase-1 report**: `reviews/impl-review-phase-1.md`. Its fixes were verified as not regressed.

## Findings

### F1 — Direct consent UPDATE bypasses withdrawal: forged timestamp, health data survives

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260927190303_onboarding_profile.sql:37-47
- **Detail**:
  - `grant update (withdrawn_at) … to authenticated` plus the active→withdrawn policy let a client PATCH `withdrawn_at` directly, bypassing `withdraw_health_data_consent()`.
  - Reproduced locally in a rolled-back transaction: `withdrawn_at` was set to `2099-01-01` and the profile row survived with no active consent. A new consent then makes that old profile count as onboarded again.
  - Only the user's own rows are affected, but it breaks two things: the integrity of the consent proof, and the promise that withdrawing deletes health data.
  - Today the anon key is server-only, but Supabase treats it as public, so that is not a security boundary.
  - Related: a withdrawal racing a concurrent profile upsert under READ COMMITTED could still insert a profile afterwards, because the RLS check reads a stale snapshot. That needs the user racing two tabs.
- **Fix A ⭐ Recommended**: new additive migration.
  - Revoke `UPDATE (withdrawn_at)` from `authenticated`.
  - Make `withdraw_health_data_consent()` `security definer`, with `search_path = ''` and every statement scoped to `auth.uid()`.
  - Add pgTAP cases: a direct UPDATE is refused, and withdrawal leaves no profile.
  - Strength: one withdrawal path, enforced in the database; the timestamp is always `now()`.
  - Tradeoff: a definer function runs with elevated rights, so its body must stay trivially scoped to `auth.uid()`.
  - Confidence: HIGH — a small function and a standard Supabase pattern.
  - Blind spot: does not close the two-tab race on its own; that needs a `for share` lock on the consent row in the profile write path.
- **Fix B**: keep the grant and add triggers.
  - A BEFORE UPDATE trigger on consents forces `new.withdrawn_at := now()`.
  - An AFTER UPDATE trigger deletes the caller's profile.
  - Strength: every withdrawal path deletes the data, including a direct PATCH.
  - Tradeoff: two triggers of hidden behaviour, and the RPC becomes redundant.
  - Confidence: MED — trigger ordering with RLS needs its own pgTAP proof.
  - Blind spot: same race caveat.
- **Decision**: FIXED via Fix A — migration 20260928061623_harden_consent_withdrawal.sql: UPDATE(withdrawn_at) revoked, withdraw policy dropped, withdraw_health_data_consent() is security definer pinned to auth.uid(); pgTAP: direct UPDATE refused (42501). Two-tab race (withdraw vs concurrent profile save) remains open — queued in follow-ups.

### F2 — `authenticated` keeps TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on both tables

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260927190303_onboarding_profile.sql:45, 124
- **Detail**:
  - The migration revokes only insert/update/delete. Supabase default privileges leave `has_table_privilege('authenticated', …, 'TRUNCATE') = t` on both tables (reproduced).
  - TRUNCATE ignores RLS and would wipe every user's consent proof and health data.
  - PostgREST and pg_graphql can't issue TRUNCATE today, so this is defense in depth.
- **Fix**: in the same new migration as F1, `revoke truncate, trigger, references, maintain on public.health_data_consents, public.profiles from authenticated;` and assert it in pgTAP.
- **Decision**: FIXED — same migration revokes TRUNCATE/TRIGGER/REFERENCES (+ MAINTAIN on PG17+); pgTAP asserts none are held

### F3 — A user who consented but has no profile yet cannot withdraw

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/profile.astro:18-22, src/pages/onboarding.astro (needs_profile view)
- **Detail**:
  - `/profile` sends every state except `complete` to `/onboarding`, and the `needs_profile` view there shows only the form and sign-out.
  - The consent text promises withdrawal "at any time on the 'Your profile' page". GDPR Art. 7(3) requires withdrawing to be as easy as giving consent.
  - No health data exists in this state, but the consent stays active with no UI to withdraw it.
  - This is a blind spot in the plan, not drift.
- **Fix**: render the existing withdraw form, with confirmation posting to `/api/consent/withdraw`, on the `needs_profile` step of `/onboarding`, and add one smoke step.
- **Decision**: FIXED — WithdrawConsentForm component on /profile and on the onboarding profile step (from=onboarding keeps errors on that page); 3 new smoke steps

### F4 — Gated pages return a bare 500 on a database error

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:17, src/pages/onboarding.astro:18, src/pages/profile.astro:19; src/lib/consent.ts:21,34
- **Detail**:
  - `getOnboardingState` throws on a PostgREST error, and the pages don't catch it. There is no `500.astro`.
  - `/dashboard` is where users land after sign-in, so a transient Supabase hiccup looks like broken sign-in, as an untranslated blank 500.
  - The endpoints, by contrast, redirect with `?error=`.
- **Fix**: catch the error in the three pages and render a translated "temporarily unavailable, try again" state with a retry link, or add a translated `src/pages/500.astro`. Never log the payload.
- **Decision**: FIXED — translated src/pages/500.astro with retry link, no error details (verified with a simulated PostgREST failure)

### F5 — Health-data pages are cacheable after sign-out

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/middleware.ts (PROTECTED_ROUTES responses)
- **Detail**: `/dashboard` and `/profile` send no `Cache-Control` (checked on local and production). On a shared device, the back button after sign-out can show the cached health data.
- **Fix**: in the middleware, set `Cache-Control: private, no-store` on responses for `PROTECTED_ROUTES`.
- **Decision**: FIXED — middleware sets Cache-Control: private, no-store on PROTECTED_ROUTES responses (verified on /onboarding, /dashboard)

### F6 — Consent text overstates what's kept and how fast data is gone

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/i18n/pl.ts / en.ts `onboarding.consent.withdraw`, `profile.withdraw.kept`, `profile.withdraw.deleted`; src/lib/consent.ts:7
- **Detail**:
  - The text says only *when* consent was given and withdrawn is kept, but the row also stores `consent_version` and `locale`.
  - "Immediately and permanently deleted" doesn't account for Supabase backup/PITR retention.
  - Account deletion cascades and removes the consent proof too; this is acceptable minimisation, but undocumented.
  - Rewording the consent text requires bumping `HEALTH_DATA_CONSENT_VERSION`. The current date-only format collides if it's bumped twice in one day.
- **Fix A ⭐ Recommended**: reword now and add a follow-up for the legal gate.
  - Wording: "…when, and under which version and language, consent was given and withdrawn".
  - Soften "permanently" to reflect backup retention.
  - Bump to `2026-09-27.1`.
  - Add the cascade and backup questions to #27.
  - Strength: the text matches the data before real users arrive.
  - Tradeoff: final legal wording may still change at #27, which means another bump.
  - Confidence: HIGH — copy-only change plus one constant.
  - Blind spot: the exact backup retention on the project's Supabase plan is unverified.
- **Fix B**: leave the text and record all points on #27 only.
  - Strength: no copy churn before the lawyer's review.
  - Tradeoff: production keeps showing a slightly inaccurate consent text until then.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Decision**: FIXED via Fix A — PL/EN consent + withdraw copy states version/language kept and backup retention; HEALTH_DATA_CONSENT_VERSION bumped to 2026-09-28 (date changed, so no .1 suffix needed); cascade/backup questions posted on #27

### F7 — Consent version is client-writable and never re-checked

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260927190303_onboarding_profile.sql:46; src/lib/consent.ts:14-23; src/pages/api/consent/grant.ts:20
- **Detail**:
  - `grant insert (consent_version)` lets a client store any string; a probe stored `'totally-forged-version'`.
  - `grant.ts` records the server's current constant, not the version that was actually rendered.
  - `hasActiveConsent` ignores the version, so a version bump never triggers re-consent.
  - Low risk today, since the proof only concerns the user themselves, but it matters once the text changes (see F6).
- **Fix**: decide the re-consent rule when the consent text first changes materially.
  - Now: add a hidden `version` field to the consent form and reject a mismatch in `grant.ts`.
  - Later: a version check in `hasActiveConsent` if re-consent is required.
- **Decision**: FIXED — consent form posts a hidden version; grant.ts rejects a mismatch with ?error=consent_outdated (smoke step). Re-consent rule for existing users (version check in hasActiveConsent) deferred to the first material text change — queued in follow-ups.

### F8 — Docs drift after the change

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md (Hard rules, Testing Guidelines, Commands), README.md (Translations)
- **Detail**:
  - The `?error=` rule and the README describe only `errors.auth.<code>`/`auth-errors.ts`, not the generic `errors.<code>` + `errorMessageKey` (`src/lib/errors.ts`) that non-auth endpoints use.
  - "Testing Guidelines" still says no test suite exists, though pgTAP now does.
  - Smoke is still called an "auth-flow" test.
- **Fix**: update those three spots, touching only lines outside the user's 10x-cli block in CLAUDE.md.
- **Decision**: FIXED — CLAUDE.md (error-code rule incl. errors.<code>/readForm, smoke + pgTAP commands, Testing Guidelines) and README Translations

### F9 — Progress SHAs point at pre-squash branch commits

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/onboarding-profile/plan.md `## Progress`
- **Detail**:
  - `ad3b864`, `edabdb0`, `d2b0f43` and `86bfbb4` are pre-squash branch commits and aren't ancestors of `main`.
  - Their remote branches are deleted, so the SHAs survive only in local branches.
  - Only 2.6–2.9 point at the main squash `670912f`.
- **Fix**: let `/10x-archive` repoint the rows to the main squash commits (`670912f` for Phases 1–2, `6f1a980` for Phases 3–4), using its approved SHA-repoint step, when the change is archived.
- **Decision**: ACCEPTED — deferred to /10x-archive's approved SHA-repoint step (670912f for phases 1–2, 6f1a980 for phases 3–4); queued in follow-ups

### F10 — Hardening nits

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/*.ts (formData), src/components/auth/FormField.tsx:42-55, migration:128, src/pages/api/health.ts, src/components/profile/ProfileForm.tsx:55
- **Detail**:
  - A non-form POST (e.g. JSON) makes `request.formData()` throw, giving a 500. This is the existing auth-endpoint pattern, now repeated in 4 endpoints; it is not a CSRF hole.
  - `FormField` sets no `aria-invalid`/`aria-describedby` for its error text.
  - `grant update (user_id)` on `profiles` is unnecessary, since RLS pins it anyway.
  - `/api/health` can't report the deployed build SHA, which would have pinpointed the #35 rollout race.
  - `cn()` is used to join aria ids; it works, but it's not the right tool.
- **Fix**: batch as one follow-up.
  - Catch `formData()` and redirect with `?error=`.
  - Add aria attributes to `FormField`.
  - Drop the grant in the F1 migration.
  - Optionally add the build SHA to `/api/health`.
- **Decision**: FIXED — readForm() in all 6 form endpoints (JSON POST now redirects), aria-invalid/aria-describedby on FormField, plain aria-id join in ProfileForm, UPDATE(user_id) revoked in the F1 migration; build SHA in /api/health left out
