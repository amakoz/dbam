# Onboarding Profile Implementation Plan

## Overview

Roadmap slice S-01 (`onboarding-profile`, issue #19): a signed-in user gives explicit, separate consent to storing their health data, completes a minimal profile (birth year, sex at birth, smoking history), and lands on their dashboard. They can later edit the profile or withdraw consent, which deletes their health data. Profiles are readable only by their owner. The slice also introduces the app's first database tables, so it adds the CI path that ships migrations to production, and it adds a translation system with Polish as the default language and English kept as a second one.

## Current State Analysis

- Auth works end to end: sign-up, sign-in, sign-out and the confirmation-email callback (`src/pages/api/auth/*.ts`). Sign-in and callback both redirect to `/` (`src/pages/api/auth/signin.ts:19`, `src/pages/api/auth/callback.ts:28`).
- Route protection is a prefix list, `PROTECTED_ROUTES = ["/dashboard"]` (`src/middleware.ts:4`), checked against `context.locals.user`.
- `src/pages/dashboard.astro` is a starter placeholder that shows the user's email.
- There are no tables and no `supabase/migrations/`. README says no tables are needed (`README.md:115`).
- CI's `smoke` job runs `supabase start`, which applies local migrations, then builds, previews and runs `scripts/smoke.mjs` (`.github/workflows/ci.yml:29-54`). Nothing applies migrations to the production Supabase project, yet `deploy` ships green `main` automatically. `context/changes/deployment/deployment-plan.md:466` defers "Supabase migrations pipeline … Trigger: first table", and this change is that trigger.
- The UI is hard-coded English in Astro pages and React islands (`SignInForm.tsx`, `SignUpForm.tsx`, `PasswordToggle.tsx`, `Topbar.astro`, `Welcome.astro`, `confirm-email.astro`). Only the config banner is Polish (`src/lib/config-status.ts:15`), and read-only smoke asserts on it (`scripts/smoke.mjs:51`).
- Auth endpoints put Supabase's raw English `error.message` into `?error=`, and pages render it verbatim.
- No unit or DB test suite exists. `smoke.mjs` is zero-dependency and runs its account steps only against local servers.

## Desired End State

- A fresh visitor sees the app in Polish. A PL/EN switcher on every page sets a `lang` cookie, and every user-facing string (including auth errors) comes from typed PL/EN dictionaries.
- After sign-in or email confirmation the user goes to `/dashboard`. If they have no active consent they are sent to `/onboarding`, which first shows a separate, unticked consent step. After consent it shows the profile form. Saving the profile lands them on `/dashboard`, which shows their profile summary and a placeholder where S-02 recommendations will go.
- `/profile` lets the user edit their answers and withdraw consent. Withdrawal deletes the profile row, stamps `withdrawn_at` on the consent record (the record is kept as proof), and returns them to `/onboarding`.
- Tables `health_data_consents` and `profiles` exist in production, created by a CI `migrate` job that `deploy` depends on. Row-level security (RLS) lets a user touch only their own rows, and it lets them write a profile only while they have an active consent. pgTAP tests prove this in CI.

Verify by running the full local smoke (onboarding, edit and withdraw steps included), `supabase test db`, and a manual walkthrough in both languages.

### Key Discoveries:

- `src/middleware.ts:4`: protection is `startsWith` over a prefix list. New pages and their API prefixes are added there (CLAUDE.md hard rule).
- `scripts/smoke.mjs:88-92`: location matching is exact on the path with a prefix match on the query, so `?error=<code>` and `?withdrawn=1` assertions work unchanged.
- `scripts/smoke.mjs:51`: read-only smoke fails if `nie jest skonfigurowany` appears. The Polish banner text must survive the move into dictionaries unchanged.
- `context/foundation/screening-catalog-research.md` §3: birth year (not a full date), sex at birth (female/male), and smoking never/current/former with pack-years and years since quitting (the LDCT rule needs both).
- Research §4 and PRD NFR: Art. 9 consent must be explicit, separate from terms, never pre-ticked, and withdrawable. Art. 7(1) requires proof that consent was given.
- `context/foundation/infrastructure.md:83,98`: a Worker rollback never undoes a migration, so migrations stay additive-first.
- `.github/workflows/ci.yml:36`: the Supabase CLI is pinned at `2.118.0` (F23). Reuse that pin.

## What We're NOT Doing

- No screening recommendations on the dashboard. That's S-02; the dashboard only gets a placeholder section.
- No organ override ("I have a cervix / breasts / prostate") or other optional refiners. Parked with FR-010.
- No last-exam dates in the profile. They belong to S-03/S-05.
- No account deletion or data export (only consent withdrawal, which deletes health data).
- No URL-prefixed locales (`/en/...`) and no Accept-Language detection. The language comes from a cookie that defaults to Polish.
- No translation of Supabase auth emails or dashboard-configured templates.
- No legal sign-off on the consent text, DPIA, or MDR memo. These are launch gates (#27), not part of this slice.
- No manual `supabase db push` to production and no `supabase config push` (CLAUDE.md hard rule).
- No reminder opt-in (S-04).

## Implementation Approach

The translation system goes first, so every new screen is built on it and nothing needs retrofitting. The schema and migration delivery ship next as their own additive PR. That makes the `migrate` → `deploy` ordering prove itself on an inert change before any code reads the tables. Onboarding (consent, profile, gating) follows, then edit and withdraw.

Integrity lives in the database, not just the endpoints. RLS scopes every row to `auth.uid()`, a profile insert/update requires an active consent, a partial unique index allows one active consent per user, and withdrawal is a single transactional function. Endpoints follow the existing auth pattern: form POST, then a redirect carrying `?error=<code>` (now a translatable code, not English text).

## Critical Implementation Details

- **Deploy ordering:** `deploy` must `need` the `migrate` job. If the `SUPABASE_DB_URL` secret is missing, `migrate` fails and blocks `deploy`, which is the safe failure. The owner adds the secret before the Phase 2 PR merges.
- **Consent versioning:** `HEALTH_DATA_CONSENT_VERSION` must be bumped whenever the consent text changes in either dictionary. Each consent row records the version and the locale that was shown.
- **Polish plurals:** Polish has one/few/many forms (1 znak, 2 znaki, 5 znaków). Plural messages go through `Intl.PluralRules`, not a `count !== 1` check like `SignUpForm.tsx:57`.
- **Production DB connection:** GitHub runners are IPv4-only and Supabase direct connections are IPv6, so `SUPABASE_DB_URL` must be the session-pooler connection string, with the password URL-encoded.

## Phase 1: Translation system with Polish default

### Overview

Add typed PL/EN dictionaries, cookie-based locale resolution with a switcher, and move every existing user-facing string onto them. Auth errors become codes.

### Changes Required:

#### 1. Dictionaries and helpers

**File**: `src/i18n/pl.ts`, `src/i18n/en.ts`, `src/i18n/index.ts`

**Intent**: A single source for all UI strings, with Polish as the default. A key missing from English fails the type check.

**Contract**: `pl.ts` exports a flat `pl` record (`"auth.signin.title": "Zaloguj się"`, …). `en.ts` exports `en: Record<MessageKey, string>` where `MessageKey = keyof typeof pl`. `index.ts` exports `LOCALES = ["pl", "en"] as const`, `type Locale`, `DEFAULT_LOCALE = "pl"`, `LOCALE_COOKIE = "lang"`, `resolveLocale(value: string | undefined): Locale`, `isMessageKey(key: string): key is MessageKey`, and `createT(locale)`. `createT` returns `t(key, params?)` with `{name}` interpolation and `t.plural(baseKey, count)` that picks `${baseKey}_${Intl.PluralRules(locale).select(count)}`. Dictionaries are plain data, safe to import from islands.

#### 2. Locale in request context and switcher

**File**: `src/env.d.ts`, `src/middleware.ts`, `src/pages/api/locale.ts`, `src/components/LanguageSwitcher.astro`, `src/layouts/Layout.astro`

**Intent**: Resolve the locale once per request and let the user switch it without JavaScript.

**Contract**: `App.Locals.locale: Locale` is set in middleware from the `lang` cookie before the auth check. `POST /api/locale` takes form fields `lang` and `next`, sets the cookie (path `/`, 1 year, `sameSite: "lax"`), and redirects to `next` only when it starts with `/` and not `//`, otherwise to `/`. Layout renders `<html lang={locale}>`, a small PL/EN switcher form (`aria-pressed` on the current locale), and a translated default title.

#### 3. Auth error codes

**File**: `src/lib/auth-errors.ts`, `src/pages/api/auth/signin.ts`, `signup.ts`, `callback.ts`

**Intent**: Endpoints redirect with a stable code, and pages translate it.

**Contract**: `authErrorCode(error: { code?: string }): string` returns the Supabase `code` when a matching `errors.auth.<code>` key exists, otherwise `"unknown"`. Local codes are `not_configured`, `missing_code`, and `link_invalid` (callback link errors). Redirect shape stays `?error=<code>`. Covered Supabase codes: `invalid_credentials`, `email_not_confirmed`, `user_already_exists`, `weak_password`, `over_email_send_rate_limit`, `over_request_rate_limit`, `validation_failed`.

#### 4. Translate existing screens

**File**: `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/dashboard.astro`, `src/components/auth/{SignInForm,SignUpForm,PasswordToggle}.tsx`, `src/components/{Topbar,Welcome}.astro`, `src/lib/config-status.ts`

**Intent**: No hard-coded user-facing English left. Islands receive `locale` as a prop and build `t` themselves. Pages translate the `?error=` code before passing it to `ServerError`.

**Contract**: `SignInForm`/`SignUpForm` get a new prop `locale: Locale`, and `serverError` stays the translated string. The password hint uses `t.plural`. Config-status messages become dictionary keys, and the Polish banner text stays byte-identical (`scripts/smoke.mjs:51`).

#### 5. Docs

**File**: `CLAUDE.md`, `README.md`

**Intent**: Record the convention so later slices follow it.

**Contract**: CLAUDE.md "Coding Style": user-facing strings go through `src/i18n` (add the key to `pl.ts` and `en.ts`). The Hard-rules auth bullet says `?error=` carries a translatable code. README gets a short "Translations" note.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes, including EN dictionary completeness: `npx astro check`
- Build passes: `npm run build`
- Full local smoke passes against `npm run preview` with local Supabase: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- A fresh browser (no `lang` cookie) shows home, sign-in, sign-up, confirm-email and dashboard in Polish with `<html lang="pl">`
- The switcher toggles every page to English and back, keeps the current page, and survives reload
- Wrong password, existing email, and a broken callback link each show a translated message in both languages
- The sign-up password hint uses correct Polish plural forms (1 znak / 2 znaki / 5 znaków)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Health-data schema, RLS, and migration delivery

### Overview

Create the two tables, their RLS, and the withdrawal function. Prove isolation with pgTAP in CI, and ship migrations to production through a `migrate` job that gates `deploy`. The change is additive and nothing reads the tables yet.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_onboarding_profile.sql` (create with `npx supabase migration new onboarding_profile`)

**Intent**: Store consent proof separately from health data so the proof survives withdrawal. Enforce ownership and consent at the database level.

**Contract**:
- `health_data_consents`: `id bigint identity pk`, `user_id uuid not null default auth.uid() references auth.users on delete cascade`, `consent_version text not null`, `locale text not null check in ('pl','en')`, `granted_at timestamptz not null default now()`, `withdrawn_at timestamptz null` (`>= granted_at`). A partial unique index on `(user_id) where withdrawn_at is null` allows one active consent per user.
- `profiles`: `user_id uuid pk default auth.uid() references auth.users on delete cascade`; `birth_year smallint not null check between 1900 and 2100`; `sex text not null check in ('female','male')`; `smoking_status text not null check in ('never','current','former')`; `packs_per_day numeric(4,2)` (> 0, ≤ 10); `smoking_years smallint` (1–100); `years_since_quitting smallint` (0–100); `pack_years numeric generated always as (packs_per_day * smoking_years) stored`; `created_at`/`updated_at timestamptz default now()` with an `updated_at` trigger. A consistency check requires: `never` → all smoking fields null; `current` → packs and years set, quit null; `former` → all three set.
- RLS is enabled on both tables. All privileges are revoked from `anon`. Policies compare against `(select auth.uid())`:
  - consents: select own; insert own with `withdrawn_at is null`; update own only from active to withdrawn (`using withdrawn_at is null`, `with check withdrawn_at is not null`); no delete policy. `authenticated` may update only the `withdrawn_at` column.
  - profiles: select/delete own. Insert/update require own row and `exists` an active consent for `auth.uid()`.
- `public.withdraw_health_data_consent() returns void`, `security invoker`, `set search_path = ''`. In one transaction it deletes the caller's profile and stamps `withdrawn_at = now()` on their active consent. Execute is granted to `authenticated` only.

#### 2. RLS tests

**File**: `supabase/tests/database/onboarding_profile.test.sql`

**Intent**: Prove the PRD guardrail ("never exposed to another user") where it's enforced.

**Contract**: A pgTAP transaction that seeds two users in `auth.users` as `postgres`, then impersonates each one. Assertions:
- A cannot insert a profile without consent (`42501`).
- A can insert consent and then a profile.
- A cannot insert a second active consent (`23505`).
- B sees zero of A's profile/consent rows, and B's update/delete of A's rows changes nothing (verified as `postgres`).
- B cannot insert a consent row for A.
- `anon` sees nothing.
- A `never` smoker with `packs_per_day` is rejected.
- After A calls `withdraw_health_data_consent()`: the profile is gone, `withdrawn_at` is set, a new profile insert fails, and setting `withdrawn_at = null` fails.

The test starts with `create extension if not exists pgtap with schema extensions;`. Impersonation pattern:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-a-uuid>","role":"authenticated"}';
```

#### 3. CI: tests and migrate job

**File**: `.github/workflows/ci.yml`

**Intent**: Run the DB tests on every PR, and apply migrations to production before any deploy that may depend on them.

**Contract**:
- `smoke` job: add `supabase test db` right after "Start local Supabase".
- New `migrate` job: `needs: [ci, smoke]`, the same `if` as `deploy`, `environment: production`, `concurrency: { group: production-migrate, cancel-in-progress: false }`. Steps: checkout, `supabase/setup-cli@v1` pinned `2.118.0`, then `supabase db push --db-url "$SUPABASE_DB_URL"` with `SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}`. Never `--include-seed` or `--include-roles`, and no `config push`.
- `deploy`: `needs: [ci, smoke, migrate]`.

#### 4. Typed client

**File**: `package.json`, `src/lib/database.types.ts`, `src/lib/supabase.ts`

**Intent**: Queries in later phases are type-checked against the schema.

**Contract**: npm script `db:types` = `supabase gen types typescript --local > src/lib/database.types.ts`. The generated file is committed. `createClient` returns `createServerClient<Database>(…)`.

#### 5. Docs

**File**: `CLAUDE.md`, `README.md`

**Intent**: Replace "no tables" with the migration workflow and its rule.

**Contract**: New CLAUDE.md hard rule: migrations reach production only through the CI `migrate` job (never a manual `supabase db push` against prod); migrations must be additive-first because a Worker rollback doesn't undo them; regenerate types with `npm run db:types` after a schema change. README line 115 becomes a short "Database" section (tables, `supabase db reset`, `supabase test db`, the `SUPABASE_DB_URL` secret).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly from scratch: `npx supabase db reset`
- RLS tests pass: `npx supabase test db`
- Generated types are current: `npm run db:types && git diff --exit-code src/lib/database.types.ts`
- Lint, type check and build pass: `npm run lint && npx astro check && npm run build`
- PR checks `ci` and `smoke` are green (smoke now includes `supabase test db`)

#### Manual Verification:

- Before merge, the owner adds the `SUPABASE_DB_URL` secret (session pooler, URL-encoded password) to the GitHub `production` environment
- After merge, `migrate` runs green on `main` before `deploy`, and `deploy` plus the read-only smoke are green
- In the production Supabase dashboard, both tables exist with RLS enabled and the withdraw function is present
- The owner notes the production project's region for the consent text in Phase 3

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Consent and onboarding flow

### Overview

Wire the post-login path through consent and the profile form to the dashboard.

### Changes Required:

#### 1. Domain helpers

**File**: `src/lib/profile.ts`, `src/lib/consent.ts`

**Intent**: One set of validation rules shared by the form and the endpoint, plus one place that decides where a user belongs in onboarding.

**Contract**:
- `profile.ts` exports `SEX_VALUES`, `SMOKING_STATUSES`, and `parseProfileForm(form: FormData, currentYear: number)`, which returns `{ ok: true; value: ProfileInsert } | { ok: false; errors: Partial<Record<ProfileField, string /* message key */>> }`. Rules:
  - age = `currentYear - birth_year`, between 18 and 120
  - sex and status must be allowed values
  - `packs_per_day` in 0–10 (exclusive of 0), accepting a decimal comma
  - `smoking_years` integer between 1 and age
  - `years_since_quitting` integer between 0 and age
  - `smoking_years + years_since_quitting ≤ age`
  - fields not relevant to the chosen status are set to null
- `consent.ts` exports `HEALTH_DATA_CONSENT_VERSION` (a date-like string, with a comment saying to bump it when the text changes) and `getOnboardingState(supabase)`, which returns `{ state: "needs_consent" | "needs_profile" | "complete"; profile: Profile | null }`.
- **Addendum (impl-review phase 1, F3):**
  - Field errors from `parseProfileForm` are typed `MessageKey`, not `string`.
  - Non-auth `?error=` codes (`consent_required`, `invalid_profile`, `save_failed`, `withdraw_confirm_required`, `withdraw_failed`) live under a shared `errors.<code>` namespace with `errors.unknown`, and pages translate them through a generic `errorMessageKey(code)`.
  - The auth helpers in `src/lib/auth-errors.ts` become thin wrappers around it, rather than a parallel copy of the helper.

#### 2. Onboarding page and profile form

**File**: `src/pages/onboarding.astro`, `src/components/profile/ProfileForm.tsx`

**Intent**: The consent step comes first and stands on its own. The profile form appears only after consent.

**Contract**: `/onboarding` redirects `complete` users to `/dashboard`. For `needs_consent` it renders a plain Astro form posting to `/api/consent/grant`. The form shows the consent text (what data, purpose, where it's stored, withdrawable at any time via `/profile`), a required unticked checkbox `consent=yes` separate from any terms, and a submit button. For `needs_profile` it renders the `ProfileForm` island. It shows `?error=<code>` and `?withdrawn=1` notices. `ProfileForm` props are `{ locale, mode: "onboarding" | "profile", initial?: ProfileInput, serverError? }`. It posts to `/api/profile` with a hidden `mode`, shows the smoking fields conditionally, displays the computed pack-years live, and validates with `parseProfileForm` before submit. It is keyboard-operable with labelled inputs (NFR accessibility).

#### 3. Endpoints

**File**: `src/pages/api/consent/grant.ts`, `src/pages/api/profile.ts`

**Intent**: Persist consent and profile following the existing redirect-with-`?error=` pattern.

**Contract**:
- `POST /api/consent/grant`:
  - no `consent=yes` → `/onboarding?error=consent_required`
  - active consent already exists (or a `23505` on insert) → `/onboarding`
  - otherwise inserts `{ consent_version: HEALTH_DATA_CONSENT_VERSION, locale: locals.locale }` → `/onboarding`
  - any other error → `/onboarding?error=save_failed`
- `POST /api/profile`:
  - `mode` is allowlisted (default `onboarding`)
  - no active consent → `/onboarding`
  - invalid → `/<mode page>?error=invalid_profile`
  - otherwise upserts on `user_id`, then `onboarding` → `/dashboard` and `profile` → `/profile?saved=1`
  - DB error → `?error=save_failed`

#### 4. Routing and dashboard

**File**: `src/middleware.ts`, `src/pages/api/auth/signin.ts`, `src/pages/api/auth/callback.ts`, `src/pages/dashboard.astro`

**Intent**: Every signed-in path reaches the dashboard, and the dashboard sends unfinished users to onboarding.

**Contract**:
- `PROTECTED_ROUTES` adds `/onboarding`, `/profile`, `/api/profile`, `/api/consent`.
- Sign-in and callback success redirect to `/dashboard`.
- The dashboard calls `getOnboardingState` and redirects anything but `complete` to `/onboarding`. It renders a translated greeting, a profile summary (birth year, sex, smoking status and pack-years), and a placeholder section for S-02 recommendations.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Cover the onboarding path on every PR.

**Contract**:
- Read-only step added: anonymous `/onboarding` → 302 `/auth/signin`.
- Account steps: "signin accepts correct password" now expects `/dashboard`. Then, in order:
  1. `/dashboard` → 302 `/onboarding`
  2. `/onboarding` → 200
  3. `POST /api/profile` → `/onboarding` (no consent)
  4. `POST /api/consent/grant` without the checkbox → `/onboarding?error=`
  5. `POST /api/consent/grant` with `consent=yes` → `/onboarding`
  6. `POST /api/profile` with `birth_year=2020` → `/onboarding?error=`
  7. `POST /api/profile` with a valid former smoker → `/dashboard`
  8. `/dashboard` → 200
  9. `/onboarding` → 302 `/dashboard`
- The existing sign-out steps stay last.

### Success Criteria:

#### Automated Verification:

- Lint, type check and build pass: `npm run lint && npx astro check && npm run build`
- RLS tests still pass: `npx supabase test db`
- Full local smoke passes with the new onboarding steps: `BASE_URL=http://localhost:4321 npm run smoke`
- PR checks `ci` and `smoke` are green

#### Manual Verification:

- A new account (sign-up → email confirm) lands on `/onboarding` with an unticked consent checkbox. Submitting without it shows a translated error.
- The consent text is accurate (data collected, purpose, storage region from Phase 2, how to withdraw) in both PL and EN
- The smoking fields appear and hide correctly for never/current/former, pack-years updates live, and invalid values show inline errors
- After saving, the dashboard shows the profile summary. Sign-out/sign-in goes straight to the dashboard.
- The flow works on a mobile-width screen and with keyboard only
- In Supabase Studio (local), the consent row stores the version and the locale shown

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 4: Profile editing and consent withdrawal

### Overview

Let the user correct their profile and withdraw consent, which deletes their health data.

### Changes Required:

#### 1. Profile page

**File**: `src/pages/profile.astro`, `src/pages/dashboard.astro`

**Intent**: One place for editing the profile and managing consent, reachable from the dashboard.

**Contract**: `/profile` redirects anything but `complete` to `/onboarding`. It renders `ProfileForm` with `mode="profile"`, prefilled from the stored profile, and shows `?saved=1` and `?error=` notices. A separate withdraw section explains what gets deleted and what is kept (the consent record, as proof). Its form posts to `/api/consent/withdraw` and has a required confirmation checkbox `confirm=yes`, so no JavaScript dialog is needed. The dashboard links to `/profile`.

#### 2. Withdraw endpoint

**File**: `src/pages/api/consent/withdraw.ts`

**Intent**: Withdrawal in one transactional call.

**Contract**: `POST /api/consent/withdraw`:
- no `confirm=yes` → `/profile?error=withdraw_confirm_required`
- calls `supabase.rpc("withdraw_health_data_consent")`; an error → `/profile?error=withdraw_failed`
- success → `/onboarding?withdrawn=1`

#### 3. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Cover edit and withdraw.

**Contract**:
- Read-only step added: anonymous `/profile` → 302 `/auth/signin`.
- Account steps after onboarding, in order:
  1. `/profile` → 200
  2. `POST /api/profile` with `mode=profile` (valid) → `/profile?saved=1`
  3. `POST /api/consent/withdraw` without confirm → `/profile?error=`
  4. `POST /api/consent/withdraw` with confirm → `/onboarding?withdrawn=1`
  5. `/dashboard` → 302 `/onboarding`
- The sign-out steps stay last.

#### 4. Remove the user-visible Supabase config banner (addendum from impl-review phase 1, F4)

**File**: `src/layouts/Layout.astro`, `src/lib/config-status.ts`, `src/pages/api/health.ts`, `src/i18n/{pl,en}.ts`, `scripts/smoke.mjs`, `.github/workflows/ci.yml`, `README.md`

**Intent**: The config banner was a starter template helper and must never reach users. Replace it with an operator-only signal, so a deploy with missing secrets is still caught.

**Contract**:
- Layout no longer renders config banners.
- The `config.*` dictionary keys are removed. `errors.auth.not_configured` stops naming Supabase and reads as a generic "temporarily unavailable" message.
- `GET /api/health` returns 200 `{"status":"ok"}` when `SUPABASE_URL`/`SUPABASE_KEY` are set, otherwise 503 `{"status":"misconfigured"}`. It exposes nothing else, and `config-status.ts` stays server-only.
- The read-only smoke step "home renders without config banner" is replaced by "health endpoint reports ok" (`/api/health` → 200).
- The CI post-deploy health check curls `$PRODUCTION_URL/api/health` instead of `/`.
- README's read-only smoke description is updated to match.

### Success Criteria:

#### Automated Verification:

- Lint, type check and build pass: `npm run lint && npx astro check && npm run build`
- RLS tests pass: `npx supabase test db`
- Full local smoke passes with the edit and withdraw steps: `BASE_URL=http://localhost:4321 npm run smoke`
- PR checks `ci` and `smoke` are green
- Read-only smoke passes with the health-endpoint step: `SMOKE_READONLY=1 BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- `/profile` is prefilled. Changing smoking status from former to never clears the smoking fields after saving.
- Withdrawing without ticking the confirmation shows a translated error. With it ticked, the user lands on `/onboarding` with a "data deleted" notice.
- After withdrawal, in Supabase Studio (local) the profile row is gone and the consent row has `withdrawn_at` set. Granting consent again creates a new row.
- After merge, a production walkthrough with the owner's own account completes onboarding, edit and withdraw (no smoke run against prod beyond `SMOKE_READONLY=1`)
- With the Supabase secrets removed locally, no page shows a config banner and `/api/health` returns 503

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- None added. The repo has no unit runner, and adding one is out of scope. `parseProfileForm` boundary cases (age 17/18/120, smoking years plus years since quitting exceeding age, decimal comma) are exercised through smoke and manual checks.

### Integration Tests:

- pgTAP (`supabase test db`) for RLS isolation, the consent requirement, the smoking consistency check, and withdrawal.
- `scripts/smoke.mjs` for the HTTP flow: gating redirects, consent, profile validation, edit, withdraw.

### Manual Testing Steps:

1. Fresh browser: the app is in Polish. Switch to EN and back.
2. Sign up, confirm the email, and land on the consent step. Try submitting without consent, then consent.
3. Fill the profile as a former smoker, check pack-years, save, and see the dashboard summary.
4. Edit the profile on `/profile`, then withdraw consent and confirm you're back at the consent step.
5. Repeat step 2 on a mobile-width screen using the keyboard only.

## Performance Considerations

The dashboard adds two small indexed queries per request (active consent, profile by primary key). RLS policies use `(select auth.uid())` so it's evaluated once per statement.

## Migration Notes

The migration is purely additive (new tables and a function), so a Worker rollback is safe with the schema left in place. It reaches production only through the CI `migrate` job, which requires the `SUPABASE_DB_URL` environment secret. There's no existing data to backfill.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01, issue #19)
- PRD: `context/foundation/prd.md` (US-01, FR-001–FR-003, NFR privacy/accessibility)
- Field and consent research: `context/foundation/screening-catalog-research.md` §3–§4
- Deferred migration pipeline: `context/changes/deployment/deployment-plan.md:466`
- Rollback vs migrations: `context/foundation/infrastructure.md:83,98`
- Redirect-with-error pattern: `src/pages/api/auth/signin.ts:15-19`
- Route protection: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Translation system with Polish default

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — ad3b864
- [x] 1.2 Type check passes, including EN dictionary completeness: `npx astro check` — ad3b864
- [x] 1.3 Build passes: `npm run build` — ad3b864
- [x] 1.4 Full local smoke passes against `npm run preview` with local Supabase: `BASE_URL=http://localhost:4321 npm run smoke` — ad3b864

#### Manual

- [x] 1.5 A fresh browser (no `lang` cookie) shows home, sign-in, sign-up, confirm-email and dashboard in Polish with `<html lang="pl">` — ad3b864
- [x] 1.6 The switcher toggles every page to English and back, keeps the current page, and survives reload — ad3b864
- [x] 1.7 Wrong password, existing email, and a broken callback link each show a translated message in both languages — ad3b864
- [x] 1.8 The sign-up password hint uses correct Polish plural forms (1 znak / 2 znaki / 5 znaków) — ad3b864

### Phase 2: Health-data schema, RLS, and migration delivery

#### Automated

- [x] 2.1 Migration applies cleanly from scratch: `npx supabase db reset` — edabdb0
- [x] 2.2 RLS tests pass: `npx supabase test db` — edabdb0
- [x] 2.3 Generated types are current: `npm run db:types && git diff --exit-code src/lib/database.types.ts` — edabdb0
- [x] 2.4 Lint, type check and build pass: `npm run lint && npx astro check && npm run build` — edabdb0
- [x] 2.5 PR checks `ci` and `smoke` are green (smoke now includes `supabase test db`) — edabdb0

#### Manual

- [x] 2.6 Before merge, the owner adds the `SUPABASE_DB_URL` secret (session pooler, URL-encoded password) to the GitHub `production` environment — 670912f
- [x] 2.7 After merge, `migrate` runs green on `main` before `deploy`, and `deploy` plus the read-only smoke are green — 670912f
- [x] 2.8 In the production Supabase dashboard, both tables exist with RLS enabled and the withdraw function is present — 670912f
- [x] 2.9 The owner notes the production project's region for the consent text in Phase 3 — 670912f

### Phase 3: Consent and onboarding flow

#### Automated

- [x] 3.1 Lint, type check and build pass: `npm run lint && npx astro check && npm run build` — d2b0f43
- [x] 3.2 RLS tests still pass: `npx supabase test db` — d2b0f43
- [x] 3.3 Full local smoke passes with the new onboarding steps: `BASE_URL=http://localhost:4321 npm run smoke` — d2b0f43
- [x] 3.4 PR checks `ci` and `smoke` are green — 86bfbb4

#### Manual

- [x] 3.5 A new account (sign-up → email confirm) lands on `/onboarding` with an unticked consent checkbox. Submitting without it shows a translated error. — d2b0f43
- [x] 3.6 The consent text is accurate (data collected, purpose, storage region from Phase 2, how to withdraw) in both PL and EN — d2b0f43
- [x] 3.7 The smoking fields appear and hide correctly for never/current/former, pack-years updates live, and invalid values show inline errors — d2b0f43
- [x] 3.8 After saving, the dashboard shows the profile summary. Sign-out/sign-in goes straight to the dashboard. — d2b0f43
- [x] 3.9 The flow works on a mobile-width screen and with keyboard only — d2b0f43
- [x] 3.10 In Supabase Studio (local), the consent row stores the version and the locale shown — d2b0f43

### Phase 4: Profile editing and consent withdrawal

#### Automated

- [x] 4.1 Lint, type check and build pass: `npm run lint && npx astro check && npm run build` — 86bfbb4
- [x] 4.2 RLS tests pass: `npx supabase test db` — 86bfbb4
- [x] 4.3 Full local smoke passes with the edit and withdraw steps: `BASE_URL=http://localhost:4321 npm run smoke` — 86bfbb4
- [x] 4.4 PR checks `ci` and `smoke` are green — 86bfbb4
- [x] 4.9 Read-only smoke passes with the health-endpoint step: `SMOKE_READONLY=1 BASE_URL=http://localhost:4321 npm run smoke` — 86bfbb4

#### Manual

- [x] 4.5 `/profile` is prefilled. Changing smoking status from former to never clears the smoking fields after saving. — 86bfbb4
- [x] 4.6 Withdrawing without ticking the confirmation shows a translated error. With it ticked, the user lands on `/onboarding` with a "data deleted" notice. — 86bfbb4
- [x] 4.7 After withdrawal, in Supabase Studio (local) the profile row is gone and the consent row has `withdrawn_at` set. Granting consent again creates a new row. — 86bfbb4
- [x] 4.8 After merge, a production walkthrough with the owner's own account completes onboarding, edit and withdraw (no smoke run against prod beyond `SMOKE_READONLY=1`) — 6f1a980
- [x] 4.10 With the Supabase secrets removed locally, no page shows a config banner and `/api/health` returns 503 — 86bfbb4
