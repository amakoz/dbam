# Onboarding Profile — Plan Brief

> Full plan: `context/changes/onboarding-profile/plan.md`

## What & Why

Roadmap slice S-01 (#19): a signed-in user gives explicit, separate consent to storing health data, fills in a minimal profile (birth year, sex at birth, smoking history), and lands on their dashboard. S-02 (the north star recommendations list) needs this profile. This is also the first slice that stores GDPR Art. 9 health data, so consent, withdrawal and per-user isolation have to land here.

## Starting Point

Supabase email/password auth works, and `/dashboard` is a protected placeholder. There are no tables, no path for migrations to reach production (`main` auto-deploys code only), and the UI is hard-coded English.

## Desired End State

A fresh visitor sees the app in Polish and can switch to English. After sign-in, a user without consent goes to `/onboarding`: an unticked consent step, then the profile form, then the dashboard with a profile summary. On `/profile` they can edit their answers or withdraw consent, which deletes their health data but keeps the consent record as proof. The tables are in production, created by a CI job that runs before every deploy, and RLS is proven by pgTAP tests in CI.

## Key Decisions Made

| Decision            | Choice                                                                  | Why (1 sentence)                                                                                 |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Migration delivery  | CI `migrate` job (`supabase db push --db-url`); `deploy` needs it       | The schema always lands before the code that needs it, with no human step to forget.             |
| Consent storage     | Separate `health_data_consents` log plus a `profiles` table             | Proof of consent (Art. 7(1)) survives deleting the health data on withdrawal.                    |
| Smoking data        | never/current/former; packs/day × years → pack-years; years since quit  | This is what the LDCT rule needs, and the calculator spares users the arithmetic.                |
| Sex field           | Female/male at birth only                                               | Matches NFZ program rules; the organ override is parked with FR-010.                             |
| Scope extras        | Profile editing and consent withdrawal included                         | The NFR requires withdrawal, and editing makes mistakes fixable.                                 |
| Language            | Translation system (typed PL/EN dictionaries), Polish default, English kept | The product is Poland-first and valid consent needs understandable text; English stays available. |
| Locale selection    | `lang` cookie + switcher in Layout; URLs unchanged                      | No changes to routes, protected prefixes, smoke paths or Supabase redirect URLs.                 |
| Isolation testing   | pgTAP tests via `supabase test db` in the smoke job                     | Tests RLS at the database, where the guarantee lives, and blocks merges on regression.           |
| Consent enforcement | RLS: profile writes require an active consent; one active consent per user | Integrity holds even if an endpoint has a bug.                                                |
| Age floor           | 18+ (validated in the form and the endpoint)                            | The product serves adults; this avoids child-consent rules.                                      |

## Scope

**In scope:**

- A translation system, with every existing screen moved onto it and auth errors turned into codes
- Two tables with RLS, a withdraw function, pgTAP tests, the CI `migrate` job, and generated DB types
- `/onboarding` (consent step, then the profile form), the dashboard gate, and the post-login redirect to `/dashboard`
- `/profile` (edit, withdraw) and smoke coverage for all new flows

**Out of scope:** recommendations (S-02), last-exam dates, organ override and other optional refiners, account deletion and export, URL-prefixed locales, translating Supabase emails, legal sign-off of the consent text (launch gate #27), reminder opt-in (S-04).

## Architecture / Approach

The middleware resolves `locale` from a cookie next to `user`, and pages and islands translate through `createT(locale)`. Forms POST to SSR endpoints that redirect with `?error=<code>`, following the existing auth pattern. `getOnboardingState()` decides whether a user belongs on `/onboarding` or `/dashboard`. The database enforces the rest: RLS scopes rows to `auth.uid()`, profile writes require an active consent, and `withdraw_health_data_consent()` deletes the profile and stamps the consent in one transaction.

## Phases at a Glance

| Phase                                   | What it delivers                                                   | Key risk                                                              |
| --------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1. Translation system with Polish default | PL/EN dictionaries, switcher, all existing screens translated      | Changing banner text breaks read-only smoke; Polish plurals           |
| 2. Schema, RLS, migration delivery      | Tables, RLS, withdraw fn, pgTAP in CI, `migrate` → `deploy`        | Missing or wrong `SUPABASE_DB_URL` blocks deploy (safe failure)       |
| 3. Consent and onboarding flow          | Consent step, profile form, gating, dashboard summary              | Consent text accuracy; form validation edge cases                     |
| 4. Profile editing and withdrawal       | `/profile` edit and withdraw, with deletion of health data         | Withdrawal must delete data and keep the proof                        |

**Prerequisites:** the owner adds the `SUPABASE_DB_URL` secret (session pooler) to the GitHub `production` environment before the Phase 2 PR merges. Local Supabase via `npx supabase start`.
**Estimated effort:** ~4 sessions, one PR per phase.

## Open Risks & Assumptions

- The consent text is drafted by the agent and reviewed by the owner, not by a lawyer. Legal review, a DPIA and the MDR memo stay pre-launch gates (#27).
- The production Supabase region isn't verified yet. It's checked in Phase 2 because the consent text states it.
- Trans and intersex users get less accurate recommendations until the organ override lands (FR-010).
- `supabase test db` adds a container pull to the smoke job, which slows CI a little.

## Success Criteria (Summary)

- A new user can go from sign-up through consent and profile to their dashboard, in Polish by default.
- A user can edit their profile or withdraw consent, and withdrawal deletes their health data.
- CI proves that no user can read or change another user's health data, and migrations reach production before the code that uses them.
