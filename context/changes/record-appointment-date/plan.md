# S-03 Record appointment date — Implementation Plan

## Overview

Let a user handle each recommended screening in one of two ways from the dashboard:

- **Plan it**, with an optional appointment date booked outside the app.
- **Mark it done**, with an optional month and year of the last exam.

The dashboard becomes a "what else should I focus on" list:

- Planned exams move to a **Your plans** section.
- Done exams move to a **Done** section until their catalog interval elapses.
- Tiers show only exams that are still unhandled.

This delivers roadmap S-03 (US-02, FR-005). It also absorbs S-05's "mark an exam already done". The records it stores are what S-04 (appointment reminder), S-05 (confirm), S-06 (due again) and S-07 (FR-011/FR-012 nudges) will read.

## Current State Analysis

- **Nothing stores per-user exam data yet.** S-03 adds the first per-user tables that reference the catalog (research §Summary 1).
- **Health data follows the S-01 pattern:**
  - own-row RLS;
  - INSERT and UPDATE gated on an active consent through an inline `exists`;
  - column grants;
  - default-privilege revokes;
  - `on delete cascade`.

  Sources: `supabase/migrations/20260927190303_onboarding_profile.sql:94-129` and `20260928061623_harden_consent_withdrawal.sql:34-45`.
- **`withdraw_health_data_consent()` deletes only `profiles`** (`20260928061623_harden_consent_withdrawal.sql:23`).
- **The consent text doesn't cover exam data.** Consent "What data" lists only birth year, sex and smoking (`src/i18n/en.ts:121`), and the withdrawal text promises to delete only those (`src/i18n/en.ts:144-145`). The PRD NFR counts exam dates as consent-gated health data (`prd.md:136`).
- **The catalog key is `screening_catalog.slug`.** Rows are never deleted. Status is `draft|active|retired`, and clients can read `active` and `retired` rows (`20260928153742_screening_catalog.sql:10,34,65-72`).
  - 11 of the 20 active entries have no fixed interval (`per_program`, `no_known_interval`, `shared_decision`).
  - `resolveInterval(entry, profile, age)` (`src/lib/catalog/recommend.ts:82`) returns `{ kind: "months" }` only for `fixed`.
- **The endpoint template** is `src/pages/api/profile.ts:13-47`: `readForm`, then client/user checks, consent, a pure parser, the write, and a redirect with `?error=<code>`. Errors are translated by `errorMessageKey` (`src/lib/errors.ts:7-10`).
- **Middleware** protects routes by prefix (`src/middleware.ts:5`).
- **The dashboard** (`src/pages/dashboard.astro`) renders `recommend()` tiers and "may apply" items. It reads no query flags. Tier items are `<li data-slug data-tier>` (`src/components/recommendations/RecommendationItem.astro:22`).
- **Dates:**
  - Nothing in `src/` handles dates or date input yet.
  - Plain dates are formatted with `timeZone: "UTC"` (`src/components/recommendations/EntryDetails.astro:22-24`).
  - Warsaw time is computed with `Intl` (`src/lib/heartbeat.ts:72-79`, private `warsawHour`).
- **Smoke:** the smoke test's onboarded fixture (56 F, former smoker) has `mammography-nfz-program` in tier 1 (`scripts/smoke.mjs:128-141`).

## Desired End State

On `/dashboard`, each tier item has a collapsible "Plan or mark done" panel with two plain forms:

- **Plan:** an optional date, from today in Warsaw to today + 2 years.
- **Done:** an optional month and year, from January of the user's birth year up to the current Warsaw month.

After submitting:

- **A planned exam** leaves its tier and appears in **Your plans**, above the tiers. Dated plans are sorted by date; undated plans ("date not set yet") come last. Each plan can be re-dated, removed, or marked done.
- **A done exam** leaves its tier and appears in **Done**:
  - With a fixed interval, it shows "due again [Month YYYY]". It reappears in its tier from the first day of that month, with a "last done" line.
  - Without a fixed interval, it stays in Done with a "no fixed repeat interval — check with your doctor or the program" note until the user undoes it.
- **Plans and done records render from the user's own rows.** They survive a retired entry or a profile change.
- **Withdrawing consent deletes plans and done records too.** The consent and withdrawal texts say so, and `HEALTH_DATA_CONSENT_VERSION` is bumped.

Verified by:

- pgTAP (RLS, consent gate, active-entry gate, withdrawal);
- the new smoke steps (plan, rejections, done, due-again, undo, withdrawal);
- manual UI checks in pl/en.

### Key Discoveries:

- PostgreSQL FK checks ignore RLS, so a bare FK accepts a `draft` slug. The INSERT/UPDATE `with check` must also require `status = 'active'` (research §Catalog).
- The PostgREST upsert (`ON CONFLICT … DO UPDATE`) sets every payload column, including the conflict key `catalog_slug`. So `authenticated` needs UPDATE on `catalog_slug` as well as on the value column. `profiles` avoids this only because its payload omits `user_id` (`src/pages/api/profile.ts:40-42`).
- `getOnboardingState()` (`src/lib/consent.ts:27-40`) returns consent state and profile in one call. The endpoint needs both: the consent gate and the `recommend()` check.
- `recommend()` sees only active entries (`src/lib/catalog/read.ts:16`). Plans and done records must be read separately and joined to active *or* retired entries.

## What We're NOT Doing

- **No emails of any kind:** no appointment reminder (S-04), no due-again email (S-06), no FR-011/FR-012 nudges (S-07). S-03 only stores the state they will read.
- **No opt-in or opt-out flag** (S-04).
- **No "confirm the exam happened on its appointment date" flow** with an exact date (narrowed S-05). Marking a plan done here takes an optional month and year like any other done.
- **No history:** at most one plan and one done record per (user, exam). Saving again overwrites, and remove/undo deletes the row.
- **No appointments in the past, and no past-dated appointment entry.**
- **No plans or done marks for "may apply" entries** or for exams outside the user's current tiers.
- **No re-consent** for users who consented under the old text. The app is pre-launch (Resend test mode, no real users); this is not a pattern to repeat after launch.
- **No cross-user read path** for the cron: nothing granted to `service_role`, and no definer read function (S-04 decides).
- **No React island, no new shadcn components, no separate exam page.**
- **No change to the "due" semantics of `recommend()` itself.** Filtering happens in a separate pure step.

## Implementation Approach

Build it in the usual order:

1. **Database first**, provable with pgTAP alone. Two tables mirror the S-01 pattern, with the active-entry gate added and the withdrawal function replaced.
2. **Pure rules module and one endpoint.** The module has no I/O and takes "now" as a parameter, so F-03 can unit-test it. The endpoint, `/api/screenings`, handles four intents.
3. **Dashboard sections, i18n and consent wording, and smoke coverage.**

Plans and done records live in separate tables because they have different lifecycles:

- A plan is deleted when it is fulfilled.
- A done record persists as "last done" while the exam is due again or re-planned.

They also map onto different later consumers: S-04/S-07 read plans; S-06 reads completions.

## Critical Implementation Details

- **Upsert grants.** Grant `update (catalog_slug, appointment_date)` on `screening_plans` and `update (catalog_slug, last_done_month)` on `screening_completions`. Without the `catalog_slug` grant, the second save of the same exam fails with 42501 (see Key Discoveries). The RLS `with check` still pins the slug to an active entry.
- **Blank done date = the marked month.** "Due again" counts from `last_done_month`, or when blank, from the Warsaw month of `updated_at`. `set_updated_at` fires on every upsert, even when no value changes, so re-marking an exam done moves a blank anchor to now. That is intended: re-marking means "done again now".
- **Mark done writes before it deletes.** It upserts the completion first, then deletes the plan for that slug. If the delete fails, redirect with `save_failed`. Both records are then visible, and the user can remove the plan. Never delete the plan first: a failed completion write would lose the plan.
- **Time zones.** "Today" and "current month" are Warsaw calendar values from `Intl.DateTimeFormat(..., { timeZone: "Europe/Warsaw" })`, never `new Date().toISOString()` (UTC). Stored plain dates are displayed with `timeZone: "UTC"`, as in `EntryDetails.astro:22-24`, so they never shift by a day.

## Phase 1: Database and contract

### Overview

The tables, access rules and withdrawal change, proven by pgTAP; regenerated types; the roadmap updated for the widened scope.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<timestamp>_screening_records.sql` (new, created via `npx supabase migration new screening_records`)

**Intent**: Add consent-gated storage for per-user plans and done records that point at the catalog, and make consent withdrawal delete them. The header comment names S-03, the purpose, and "Additive only", as in S-01.

**Contract**:

- **`public.screening_plans`:**
  - `id bigint generated always as identity primary key`;
  - `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade`;
  - `catalog_slug text not null references public.screening_catalog (slug)` (default `no action`);
  - `appointment_date date` (nullable; null = "planned, no date yet", the FR-011 state);
  - `created_at` / `updated_at timestamptz not null default now()`;
  - `unique (user_id, catalog_slug)`;
  - a `set_updated_at` trigger;
  - an index on `appointment_date` for S-04's cron;
  - a table comment saying it holds Art. 9 data, writable only with active consent, and that `created_at` is the FR-011 "selected at".
- **`public.screening_completions`:**
  - the same `id` / `user_id` / `catalog_slug` / timestamps / unique key / trigger;
  - `last_done_month date` (nullable = "don't know"), with a `check (last_done_month = date_trunc('month', last_done_month)::date)`;
  - a table comment.
- **RLS on both tables**, `to authenticated`:
  - SELECT and DELETE: `user_id = (select auth.uid())`.
  - INSERT and UPDATE (`using` + `with check`): own row, and the S-01 active-consent `exists`, and `exists (select 1 from public.screening_catalog s where s.slug = catalog_slug and s.status = 'active')`.
- **Grants:**
  - `revoke all … from anon`;
  - `revoke insert, update … from authenticated`;
  - `grant insert (user_id, catalog_slug, <value column>)`;
  - `grant update (catalog_slug, <value column>)`;
  - `revoke truncate, trigger, references`, plus the `server_version_num >= 170000` `maintain` guard (copy `harden_consent_withdrawal.sql:34-42`).
- **Withdrawal:** `create or replace function public.withdraw_health_data_consent()` with the same `security definer`, `search_path = ''`, `caller` pin and `42501` guard. It deletes from `screening_plans`, then `screening_completions`, then `profiles` for `caller`, then stamps the consent. Repeat the revoke/grant execute lines.
- **Update the `profiles` table comment** only if it claims to be the only health data (it doesn't today; leave it as is otherwise).

#### 2. pgTAP tests

**File**: `supabase/tests/database/screening_records.test.sql` (new)

**Intent**: Prove every policy and grant, following `onboarding_profile.test.sql` (`set local role` + `request.jwt.claims`, `throws_ok … '42501'`, `has_table_privilege`). Insert fixture catalog rows (one `active`, one `draft`, one `retired`) as postgres, following `screening_catalog.test.sql:9`, so the test doesn't depend on snapshot data.

**Contract**: At least these cases, on both tables where they apply:

- without consent, an insert fails with 42501;
- with consent, an insert on the active slug succeeds;
- draft and retired slugs fail with 42501;
- an unknown slug is rejected;
- a second row for the same (user, slug) fails with 23505;
- an upsert-style `insert … on conflict (user_id, catalog_slug) do update set catalog_slug = excluded.catalog_slug, …` succeeds;
- `last_done_month = '2024-03-15'` fails with 23514;
- a forged `created_at` fails with 42501;
- user B sees none of A's rows, and B's update/delete of A's rows affects 0 rows;
- `anon` has no privileges;
- `authenticated` holds no TRUNCATE/TRIGGER/REFERENCES;
- A can delete their own plan;
- after `withdraw_health_data_consent()`, A has 0 plans and 0 completions, and a new insert fails with 42501.

#### 3. Types

**File**: `src/lib/database.types.ts`

**Intent**: Regenerate with `npm run db:types` so both tables (with their FK `Relationships`) are typed.

**Contract**: Generated file, committed; no hand edits.

#### 4. Roadmap scope update

**File**: `context/foundation/roadmap.md`

**Intent**: Record the agreed scope move, so S-05 isn't planned against its old outcome.

**Contract**:

- The S-03 outcome (At-a-glance row and item body) becomes: plan an exam (optional appointment date), or mark it already done (optional month/year) so it leaves the list until it is due again; both are shown on the dashboard. PRD refs add "FR-009 (partial: mark already done)".
- The S-05 outcome narrows to confirming that an exam happened on its recorded appointment date and computing the next due date from it. Its "or mark an exam already done" clause is removed, with a note that it moved to S-03.
- Touch only those outcome/refs fields; the status stays as `/10x-plan` / `/10x-implement` set it.

### Success Criteria:

#### Automated Verification:

- Local database resets with the new migration: `npx supabase db reset`
- pgTAP suite passes, including `screening_records.test.sql`: `npx supabase test db`
- Types regenerate with both tables and the committed file matches: `npm run db:types && git diff --exit-code src/lib/database.types.ts`
- Lint and type check pass: `npm run lint && npx astro check`

#### Manual Verification:

- Migration reviewed against the S-01 pattern: every command has a policy, `anon` revoked, no `service_role` grants, withdrawal deletes all three health-data tables
- Roadmap S-03 and S-05 outcomes read consistently and nothing else in the roadmap changed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Rules and endpoint

### Overview

A pure module that parses the forms, computes Warsaw dates and "due again", and splits the dashboard into plans, done and remaining tiers. One protected endpoint writes and deletes records.

### Changes Required:

#### 1. Pure rules

**File**: `src/lib/screenings/rules.ts` (new)

**Intent**: Keep every date and state rule in one I/O-free module that takes "now" as a parameter, like `src/lib/profile.ts` and `src/lib/catalog/recommend.ts`, so the endpoint and dashboard share it and F-03 can unit-test it.

**Contract**:

- **Warsaw helpers:**
  - `warsawToday(now: Date): string` returns `YYYY-MM-DD` (Warsaw calendar date);
  - `warsawMonth(date: Date): string` returns `YYYY-MM-01`;
  - `addMonths(month, n)` and `addYears(day, n)` on plain date strings (Feb 29 + 2 years rolls to Mar 1).
- **`parsePlanForm(form, today)`** returns `{ ok: true, value: { slug, appointment_date: string | null } } | { ok: false, error: MessageKey }`:
  - an empty date means null;
  - otherwise the date must be a valid ISO date with `today <= date <= addYears(today, 2)`, inclusive;
  - errors: `errors.invalid_appointment_date`, or `errors.invalid_request` for a missing slug.
- **`parseDoneForm(form, currentMonth, birthYear)`** returns `{ slug, last_done_month: string | null }`:
  - month and year are both blank (null) or both set;
  - when set, `birthYear-01-01 <= month <= currentMonth`;
  - error: `errors.invalid_done_date`.
- **`nextDueMonth(completion, interval, now)`** returns `string | null`:
  - the anchor is `last_done_month ?? warsawMonth(updated_at)`;
  - the result is `addMonths(anchor, interval.months)` for `kind: "months"`, and null otherwise (no fixed interval).
- **`partitionDashboard(recommendations, plans, completions, now)`** returns:
  - `plans`: all plans, dated ascending, then undated;
  - `done`: completions whose next due month is null or later than the current Warsaw month;
  - `tiers` and `maybe`: the recommendation lists without slugs that have a plan or a not-yet-due completion;
  - a `lastDone` map for due-again tier items.

  Precedence: plan, then not-yet-due completion, then tier. The interval comes from `resolveInterval(entry, profile, age)`.

#### 2. Reads

**File**: `src/lib/screenings/read.ts` (new); `src/lib/catalog/read.ts`

**Intent**: Read the user's own plans and completions, plus catalog entries for any slug not in the active catalog. That way a plan or done record for a retired entry still renders.

**Contract**:

- `getUserScreenings(supabase, userId)` returns `{ plans, completions }`, throwing on a database error (like `getActiveCatalog`).
- `getCatalogEntries(supabase, slugs)` in `src/lib/catalog/read.ts` reads `status in ('active','retired')` for the given slugs, using the same `CATALOG_COLUMNS` / `CatalogEntrySchema` validation and skip-and-log behaviour.

#### 3. Endpoint

**File**: `src/pages/api/screenings.ts` (new)

**Intent**: One form endpoint for the four actions, following `src/pages/api/profile.ts`.

**Contract**: `POST` form fields `intent` (`plan | unplan | done | undone`), `slug`, `appointment_date` (plan), `done_month` + `done_year` (done).

- **Order:**
  1. `readForm` (`null` redirects to `/dashboard?error=invalid_request`);
  2. `createClient` + `locals.user` (missing redirects to `/auth/signin`);
  3. an unknown intent redirects with `?error=invalid_request`.
- **`unplan` / `undone`:** delete the caller's row for `slug` (RLS scopes it; no consent or recommendation check).
- **`plan` / `done`:**
  1. `getOnboardingState` (not `complete` redirects to `/onboarding`; a throw gives `save_failed`);
  2. parse with Warsaw `now`;
  3. `getActiveCatalog` + `recommend(...)`: a slug that isn't in any of tiers 1–3 gives `?error=screening_not_available`;
  4. upsert with `onConflict: "user_id,catalog_slug"` (never send `user_id`);
  5. `done` then deletes the plan for that slug (see Critical Implementation Details).
- **Success** redirects to `/dashboard?saved=<intent>#screening-<slug>`.
- **Failure** redirects to `/dashboard?error=<code>&slug=<slug>#screening-<slug>`. Put `slug` in the URL only after it has matched `^[a-z0-9-]+$`; otherwise omit `slug` and the fragment.

#### 4. Protection and error keys

**File**: `src/middleware.ts`; `src/i18n/pl.ts`; `src/i18n/en.ts`

**Intent**: Protect the endpoint (and get `no-store`), and make every new error code translatable.

**Contract**:

- Add `"/api/screenings"` to `PROTECTED_ROUTES`.
- New keys in both locales:
  - `errors.invalid_appointment_date` ("pick a date from today up to two years ahead");
  - `errors.invalid_done_date` (both month and year, or neither; not in the future);
  - `errors.screening_not_available`.

### Success Criteria:

#### Automated Verification:

- Lint and type check pass: `npm run lint && npx astro check`
- Production build succeeds: `npm run build`
- Existing smoke still passes against a local server: `npm run smoke`

#### Manual Verification:

- Each intent and rejection case redirects as specified and rows match in Supabase Studio. With a signed-in onboarded session on `npm run dev`, check:
  - `plan` with a date 30 days ahead;
  - `plan` with no date;
  - `plan` with yesterday's date (`?error=invalid_appointment_date`);
  - `plan` for `lung-ldct-nfz-program` (`?error=screening_not_available`);
  - `done` with only a month (`?error=invalid_done_date`);
  - `done` for a planned exam (the plan row is gone);
  - `unplan` and `undone`.
- A JSON POST to `/api/screenings` redirects with `invalid_request` instead of a 500

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard, wording and smoke

### Overview

The user-visible part: the plan/done panel on tier items, the Your plans and Done sections, the due-again line, flash messages, updated consent and withdrawal texts, and smoke coverage.

### Changes Required:

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Read the records and split the dashboard, render the two new sections around the tiers, and show success and error messages.

**Contract**:

- **Data:**
  - Load the records with `getUserScreenings`, plus `getCatalogEntries` for any slugs missing from the active catalog.
  - Run `partitionDashboard(...)` with `new Date()`.
  - Tiers and "may apply" render from its output, and the empty state applies to the filtered tiers.
- **Layout:** "Your plans" goes above the tier groups and "Done" below the "may apply" list, both inside the recommendations section. Each is omitted when empty.
- **Messages:**
  - `?saved=<intent>` shows a `role="status"` message (`dashboard.screenings.saved.<intent>`), styled like `src/pages/profile.astro:55-62`.
  - `?error=` is translated with `errorMessageKey`. If `?slug=` matches a rendered item, the `role="alert"` appears inside that item and its panel renders `open`; otherwise it shows as a page-level alert under the section heading. The raw slug is never rendered.

#### 2. Item components

**File**: `src/components/recommendations/ScreeningActions.astro` (new), `PlanItem.astro` (new), `DoneItem.astro` (new), `RecommendationItem.astro`

**Intent**: Plain Astro forms (no JS), in the style of `WithdrawConsentForm.astro`. Stable data attributes give smoke something to assert on.

**Contract**:

- **`ScreeningActions`:**
  - a `<details>` "Plan or mark done" panel with two `<form method="POST" action="/api/screenings">`s (hidden `intent`, `slug`);
  - Plan: `<input type="date" name="appointment_date">` with `min`/`max` from the Warsaw bounds and a hint that the date is optional;
  - Done: a month `<select>` (blank + 12 names from `Intl.DateTimeFormat(locale, { month: "long" })`) and a year `<select>` (blank + current year down to birth year). `type="month"` is not used: Firefox and Safari desktop lack it.
  - Props: `slug`, bounds, optional `error`, `open`.
- **`RecommendationItem`:**
  - gets `id="screening-<slug>"`;
  - renders `ScreeningActions` after the badges;
  - when `lastDone` is passed, shows "Last done: [Month YYYY]" (or "Marked done in [Month YYYY]" for a blank date) and adds `data-last-done`.
- **`PlanItem`:** `<li id="screening-<slug>" data-plan data-slug data-appointment="YYYY-MM-DD|">`. It shows:
  - the name, a tier badge when the exam is currently recommended, and the date formatted as `dateStyle: "long"`, UTC, or "date not set yet";
  - a re-date form (`intent=plan`, prefilled);
  - a "mark done" form;
  - a remove button (`intent=unplan`).
- **`DoneItem`:** `<li id="screening-<slug>" data-done data-slug data-next-due="YYYY-MM|">`. It shows:
  - the name, and "Last done …" or "Marked done in …";
  - "Due again [Month YYYY]", or the no-fixed-interval note;
  - an undo button (`intent=undone`).

#### 3. Wording and consent version

**File**: `src/i18n/pl.ts`; `src/i18n/en.ts`; `src/lib/consent.ts`

**Intent**: All new UI strings in both locales. The consent and withdrawal texts now name plans, appointment dates and done exams as stored and deleted health data.

**Contract**:

- New keys under `dashboard.screenings.*`: section headings, panel toggle, form labels and hints, buttons, plan/done lines, the no-interval note, `saved.<intent>` messages.
- Update `onboarding.consent.data` and `profile.withdraw.deleted` in both locales.
- Bump `HEALTH_DATA_CONSENT_VERSION` to the date the text changes (format per its comment at `src/lib/consent.ts:5-8`).
- No diagnosis wording, and nothing implying the app books anything (PRD guardrails).

#### 4. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Prove the flow end to end in the account steps (local only). Dates are computed relative to the run date, so the test doesn't age.

**Contract**: Insert after "dashboard renders for onboarded user":

1. Plan `mammography-nfz-program` with today + 30 days: redirects `/dashboard?saved=plan`.
2. The dashboard includes `data-plan data-slug="mammography-nfz-program"` and excludes `'data-slug="mammography-nfz-program" data-tier'`.
3. A plan with today − 30 days redirects with `?error=invalid_appointment_date`.
4. A plan for `lung-ldct-nfz-program` (draft) redirects with `?error=screening_not_available`.
5. Mammography is marked done with last month: redirects `?saved=done`, and the dashboard shows it under `data-done` and not under `data-plan`.
6. `undone` returns it to its tier.
7. Mammography is marked done with January 2020: it shows in its tier with `data-last-done` (due again).
8. Mammography is planned with no date and left in place.

At the end of the run, after the onboarding withdrawal: consent again, save the profile, and the dashboard contains no `data-plan` / `data-done` (the first withdrawal deleted them).

Update the smoke description in `README.md` only if it lists the covered flows.

### Success Criteria:

#### Automated Verification:

- Lint and type check pass: `npm run lint && npx astro check`
- Production build succeeds: `npm run build`
- Full smoke, including the new steps, passes against a local server: `npm run smoke`
- pgTAP suite still passes: `npx supabase test db`

#### Manual Verification:

- In pl and en: plan with and without a date, re-date, remove, mark done with and without a month, undo; each lands in the right section with a correct message
- An error (e.g. a past date) appears inside the right item with its panel open, and the page scrolls to it
- Dates display without a day shift, and "due again" months are correct for a fixed-interval exam; a no-interval exam shows the note
- The forms work with the keyboard and at phone width; date input and selects work in Chrome, Firefox and Safari
- The consent and withdrawal texts read correctly in both locales, and withdrawing on `/profile` removes plans and done records

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

No runner exists yet (F-03). `src/lib/screenings/rules.ts` is pure and takes "now", so F-03 can add these cases:

- Warsaw midnight edge: 23:30 UTC on 30 Sep is 1 Oct in Warsaw.
- Date bounds: today and today + 2 years are accepted; the days before and after are rejected.
- Feb 29 + 2 years rolls to Mar 1.
- A half-filled month/year is rejected.
- A blank done date anchors on the `updated_at` month.
- The due-again boundary: March 2024 + 24 months is due from 1 March 2026.
- Precedence: a plan beats a completion.
- No-interval completions never return to the tiers.

### Integration Tests:

- **pgTAP** (`screening_records.test.sql`): every policy, grant, constraint and the withdrawal cascade.
- **Smoke:** the HTTP flow above, including the draft-slug and past-date rejections.

### Manual Testing Steps:

1. Onboard as a 56-year-old woman and plan mammography for next month. It moves to Your plans, dated.
2. Plan the blood-pressure measurement with no date. It shows "date not set yet" after the dated plan.
3. Mark mammography done with no month. Its plan disappears, and Done shows "due again" 24 months from this month.
4. Undo it and mark it done with a month several years back. It returns to tier 1 with "Last done".
5. Mark a no-interval exam (e.g. `hiv-screening-test`, if it's in your tiers) done. It stays in Done with the note.
6. Withdraw consent on `/profile`, consent and onboard again. No plans or done records remain.

## Performance Considerations

The dashboard adds one read of the user's own records (two small tables with a unique index on `(user_id, catalog_slug)`), plus a catalog read only when a record points at a non-active entry. The endpoint re-runs `recommend()` over about 20 entries in memory. Both are negligible. The `appointment_date` index is for S-04's set-based cron query (Workers Free has a 10 ms CPU limit).

## Migration Notes

The change is additive: two new tables and a `create or replace` of the withdrawal function with a superset of the old behaviour. A Worker rollback leaves the tables unused and harmless. The old Worker's withdrawal still calls the same function name, which now deletes more health data, never less. Migrations reach production only through the CI `migrate` job.

## References

- Related research: `context/changes/record-appointment-date/research.md`
- Roadmap: `context/foundation/roadmap.md` (S-03, S-05, S-07)
- Health-data pattern: `supabase/migrations/20260927190303_onboarding_profile.sql:94-129`, `supabase/migrations/20260928061623_harden_consent_withdrawal.sql:11-45`
- Endpoint pattern: `src/pages/api/profile.ts:13-47`; withdraw form: `src/components/profile/WithdrawConsentForm.astro`
- pgTAP patterns: `supabase/tests/database/onboarding_profile.test.sql`, `supabase/tests/database/screening_catalog.test.sql`
- Interval rules: `src/lib/catalog/recommend.ts:82`; date display: `src/components/recommendations/EntryDetails.astro:22-24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database and contract

#### Automated

- [x] 1.1 Local database resets with the new migration: `npx supabase db reset` — d9f3ef6
- [x] 1.2 pgTAP suite passes, including `screening_records.test.sql`: `npx supabase test db` — d9f3ef6
- [x] 1.3 Types regenerate with both tables and the committed file matches: `npm run db:types && git diff --exit-code src/lib/database.types.ts` — d9f3ef6
- [x] 1.4 Lint and type check pass: `npm run lint && npx astro check` — d9f3ef6

#### Manual

- [x] 1.5 Migration reviewed against the S-01 pattern: every command has a policy, `anon` revoked, no `service_role` grants, withdrawal deletes all three health-data tables — d9f3ef6
- [x] 1.6 Roadmap S-03 and S-05 outcomes read consistently and nothing else in the roadmap changed — d9f3ef6

### Phase 2: Rules and endpoint

#### Automated

- [x] 2.1 Lint and type check pass: `npm run lint && npx astro check` — 3908b83
- [x] 2.2 Production build succeeds: `npm run build` — 3908b83
- [x] 2.3 Existing smoke still passes against a local server: `npm run smoke` — 3908b83

#### Manual

- [x] 2.4 Each intent and rejection case redirects as specified and rows match in Supabase Studio — 3908b83
- [x] 2.5 A JSON POST to `/api/screenings` redirects with `invalid_request` instead of a 500 — 3908b83

### Phase 3: Dashboard, wording and smoke

#### Automated

- [x] 3.1 Lint and type check pass: `npm run lint && npx astro check` — 21fbded
- [x] 3.2 Production build succeeds: `npm run build` — 21fbded
- [x] 3.3 Full smoke, including the new steps, passes against a local server: `npm run smoke` — 21fbded
- [x] 3.4 pgTAP suite still passes: `npx supabase test db` — 21fbded

#### Manual

- [x] 3.5 In pl and en: plan with and without a date, re-date, remove, mark done with and without a month, undo; each lands in the right section with a correct message — 21fbded
- [x] 3.6 An error (e.g. a past date) appears inside the right item with its panel open, and the page scrolls to it — 21fbded
- [x] 3.7 Dates display without a day shift, and "due again" months are correct for a fixed-interval exam; a no-interval exam shows the note — 21fbded
- [x] 3.8 The forms work with the keyboard and at phone width; date input and selects work in Chrome, Firefox and Safari — 21fbded
- [x] 3.9 The consent and withdrawal texts read correctly in both locales, and withdrawing on `/profile` removes plans and done records — 21fbded
