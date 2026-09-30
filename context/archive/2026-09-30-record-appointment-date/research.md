---
date: 2026-09-30T09:08:48+02:00
researcher: Amadeusz Kozlowski (with Claude Code)
git_commit: 97e8aa9648ed5e57acd428d8d75d8aa833babd3f
branch: feat/record-appointment-date
repository: amakoz/dbam
topic: "S-03 record-appointment-date: what storing a user-entered appointment date needs, what exists, and what later slices require from it"
tags: [research, codebase, appointments, rls, consent, dashboard, forms, supabase, cron]
status: complete
last_updated: 2026-09-30
last_updated_by: Amadeusz Kozlowski (with Claude Code)
---

# Research: S-03 record-appointment-date

**Date**: 2026-09-30T09:08:48+02:00
**Researcher**: Amadeusz Kozlowski (with Claude Code)
**Git Commit**: 97e8aa9648ed5e57acd428d8d75d8aa833babd3f
**Branch**: feat/record-appointment-date
**Repository**: amakoz/dbam

## Research Question

Roadmap slice S-03 (`record-appointment-date`, issue #21): "user can select a recommended exam, enter the date of an appointment booked outside the app, and see that date on their dashboard" (`context/foundation/roadmap.md` S-03; PRD US-02, FR-005).

This research answers four questions:

- What does S-03 build on in the code: the database, the endpoints and forms, and the dashboard?
- What must S-03 store so that the later slices S-04 to S-07 can work?
- Which decisions are already settled?
- What is left for `/10x-plan`?

## Summary

1. **Nothing stores appointments or exam dates yet.** A case-insensitive search of `supabase/`, `src/`, `catalog/` and `context/foundation/` for `appointment|exam_record|exam_date|last_exam|examination|last_screen` finds only catalog prose and PRD/roadmap text. S-03 adds the first per-user table that references the catalog. S-01 deliberately deferred "last-exam dates" to S-03/S-05 (`context/archive/2026-09-27-onboarding-profile/plan.md:41`).
2. **Exam dates are consent-gated health data.** The PRD NFR says: "health/profile data (profile answers and exam dates) is stored only after the user gives explicit, separate consent … which they can withdraw" (`prd.md:136`). S-01's pattern covers this:
   - own-row RLS on every command;
   - INSERT and UPDATE require an active consent through an inline `exists` check (`supabase/migrations/20260927190303_onboarding_profile.sql:98-117`);
   - `on delete cascade` to `auth.users`;
   - `anon` revoked, column-level grants, and default privileges revoked.
3. **Consent withdrawal must also delete appointment rows.** `withdraw_health_data_consent()` is `security definer` and today deletes only `public.profiles`, then stamps the consent (`supabase/migrations/20260928061623_harden_consent_withdrawal.sql:11-28`, delete at `:23`). S-03 must `create or replace` it to delete the new rows too, and add a pgTAP case.
4. **The catalog is a safe foreign-key target.** `screening_catalog.slug` is the primary key (`20260928153742_screening_catalog.sql:10`). Rows are never deleted or renamed: snapshots only upsert, and `catalog:check` enforces the rule (`catalog/README.md`; `20260929165522_screening_catalog_snapshot.sql:2`). F-01 named this as S-03's FK target (`context/archive/2026-09-28-screening-catalog-v1/plan-brief.md:40`).
   - One gap: PostgreSQL does not apply RLS to FK checks, so a bare FK would accept a draft slug. Restricting writes to active entries needs a check in the policy or in the route. This is inferred from PostgreSQL semantics; nothing in the repo does it yet.
5. **FR-011 needs a "selected, no date" state that S-03 doesn't describe.** FR-011 reads: "nudge if they selected an exam but haven't recorded an appointment date within some days" (`prd.md:127-128`). FR-005 and the roadmap outcome describe choosing an exam and entering its date as one action (`prd.md:106-107`). This is the main open product choice. The table must either store a selection with its own timestamp now, or S-07 must add that state later as an additive change.
6. **The dashboard needs its own read of appointments.** On the inspected path, `recommend()` only sees entries with `status = 'active'` (`src/lib/catalog/read.ts:16`) and a review stamp. A recorded appointment for an entry that is later retired, or that the user no longer qualifies for, would not appear through `recommend()`.
7. **Forms follow one existing shape, and nothing in the app handles dates yet.**
   - Endpoints use `readForm`, a per-request client, then auth and consent checks, and redirect with `?error=<code>` or a success flag (`src/pages/api/profile.ts:13-47`).
   - Error codes are translated by `errorMessageKey` (`src/lib/errors.ts:7-10`).
   - No `type="date"` input exists in `src/`.
   - `/dashboard` reads no `?error=`/`?saved=` today.
   - A new `/api/...` route must be added to `PROTECTED_ROUTES` (`src/middleware.ts:5`).
8. **The later cron needs a plain, indexed date column.** F-02's scheduled Worker is designed for reuse by S-04/S-06/S-07 (`context/changes/reminder-dispatch-path/plan.md:11`). How it reads data across users (a service-role key vs a narrowly granted security-definer function) is explicitly left to S-04 (`context/changes/reminder-dispatch-path/research.md:160-165`). S-03 only needs to provide a queryable `date` column and a stable record id.

## Detailed Findings

### Database: per-user health data (S-01 pattern to copy)

Sources: `supabase/migrations/20260927190303_onboarding_profile.sql` (file A) and `20260928061623_harden_consent_withdrawal.sql` (file B).

- **Owner column:** `user_id uuid not null default auth.uid() references auth.users (id) on delete cascade` (`profiles`, A:54; `health_data_consents`, A:11).
  - Routes rely on the default and never send `user_id` (`src/pages/api/profile.ts:40`).
- **RLS:**
  - One policy per command, `to authenticated`, written as `user_id = (select auth.uid())`.
  - INSERT and UPDATE on `profiles` also require `exists (select 1 from public.health_data_consents c where c.user_id = (select auth.uid()) and c.withdrawn_at is null)` (A:98-117).
  - SELECT and DELETE don't check consent (A:94-96, A:119-121).
  - The route checks consent as well: `hasActiveConsent()` (`src/lib/consent.ts:15-24`), called at `src/pages/api/profile.ts:27-33`.
- **Grants:**
  - `revoke all ... from anon` (A:124), `revoke insert, update ... from authenticated` (A:125), then column-level `grant insert (...)` / `grant update (...)` (A:126-129).
  - B:44-45 removed `update (user_id)`.
  - Default-privilege cleanup: `revoke truncate, trigger, references ... from authenticated` (B:34), and `revoke maintain` inside a `server_version_num >= 170000` guard (B:36-42).
- **Timestamps:** `created_at`/`updated_at default now()` (A:62-63), plus the `public.set_updated_at()` trigger (A:77-90). EXECUTE on it is revoked from clients (A:153).
- **`service_role`:** the S-01 tables don't mention it, so it keeps Supabase's defaults. It is locked down only on the catalog (`20260928195335_harden_screening_catalog_service_role.sql:5-13`). The app never uses it: the client is built from the publishable `SUPABASE_KEY` (`src/lib/supabase.ts:10`), and the deployment plan says "Never" (`context/changes/deployment/deployment-plan.md:188`).
- **Migration conventions:**
  - A header comment with slice id, purpose and "Additive only" (A:1-3, B:1-2).
  - Review fixes ship as new `harden_*` migrations.
  - Production gets migrations only through the CI `migrate` job (`.github/workflows/ci.yml`; CLAUDE.md).
  - After any schema change, run `npm run db:types` and commit `src/lib/database.types.ts`. Today it has no FKs between public tables (`Relationships: []`), and `withdraw_health_data_consent` is its only function.

### Consent withdrawal (must change)

- **The function:** `public.withdraw_health_data_consent()` (B:11-28).
  - It is `security definer` with `set search_path = ''` and pins `caller := auth.uid()`.
  - If there is no caller it raises `42501`.
  - It runs `delete from public.profiles where user_id = caller` (B:23), then stamps `withdrawn_at` on the active consent (B:24-26).
  - Grants: `revoke execute ... from public, anon` and `grant execute ... to authenticated` (B:30-31).
- **The route:** `src/pages/api/consent/withdraw.ts:26` calls it (`supabase.rpc(...)`) and requires `confirm=yes` (`:17`).
- **What S-03 must change:**
  - Replace the function in a new migration, adding a delete of the appointment rows before the consent update, and repeat the grant lines.
  - Update the wording that describes withdrawal as deleting only the profile: `withdraw.ts:8-9`, the `profiles` table comment (A:74-75), and the pgTAP withdrawal block (`supabase/tests/database/onboarding_profile.test.sql:137-146`).
- **A known gap:** S-01's follow-ups record a race where a write that runs at the same time as a withdrawal can still land afterwards (`context/archive/2026-09-27-onboarding-profile/follow-ups/review-fixes.md:10`, F1 residual). The same race would apply to appointment writes.

### Catalog as the reference target

- **Key and status:** `slug text primary key` (`20260928153742_screening_catalog.sql:10`), with status `draft|active|retired` (`:34`).
  - RLS lets `anon` and `authenticated` see only `active` and `retired` rows (`:65-67`).
  - Clients get SELECT only (`:71-72`).
- **Rows are never deleted or renamed:** "Upserts never delete rows, and retired entries remain so future S-03/S-05 records keep resolving" (`context/archive/2026-09-28-screening-catalog-v1/plan.md:517`), confirmed by the snapshot header (`20260929165522_screening_catalog_snapshot.sql:2`). So an FK with the default `no action` is safe.
- **The draft-slug gap (inferred, untested in this repo):** an FK check doesn't apply RLS, so a draft slug would pass. Two ways to accept only `active` entries:
  - an `exists (... s.status = 'active')` clause in the INSERT/UPDATE `with check`, which runs under the caller's RLS;
  - validating the slug in the route against `getActiveCatalog` (`src/lib/catalog/read.ts:15`).

### Endpoints, forms and middleware

- **The endpoint pattern** (`src/pages/api/profile.ts:13-47`):
  1. `readForm`: a non-form body redirects with `?error=invalid_request` (`src/lib/forms.ts:5-11`).
  2. `createClient(request.headers, cookies)` (`src/lib/supabase.ts:6-22`).
  3. No user redirects to `/auth/signin`.
  4. `hasActiveConsent`: no consent redirects to `/onboarding`, and a thrown error redirects with `?error=save_failed`.
  5. The pure parser; a failure redirects with a generic error code.
  6. The write; a database error redirects with `?error=save_failed`.
  7. Success redirects with a flag.
  - A hidden field picks the page to return to, through a `MODES` or `SOURCES` map (`api/profile.ts:8-11`, `api/consent/withdraw.ts:6,13`).
- **Error codes:** `errors.<code>` keys, translated by `errorMessageKey()`. Unknown codes fall back to `errors.unknown` (`src/lib/errors.ts:7-10`). `errors.save_failed` and `errors.invalid_request` exist and can be reused.
- **Origin check:** Astro 7.3.2 defaults `security.checkOrigin` to `true` (`node_modules/astro/dist/core/config/schemas/defaults.js:44`), and `astro.config.mjs` doesn't override it. The smoke test sends `Origin` (`scripts/smoke.mjs:51`).
- **Middleware** (`src/middleware.ts`):
  - `PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/profile", "/api/profile", "/api/consent"]` (`:5`), matched by prefix. **A new endpoint (e.g. `/api/appointments`) must be added** so it is protected and gets `Cache-Control: private, no-store` (`:30-32`).
  - `Astro.locals` holds only `{ user, locale }` (`src/env.d.ts:1-6`).
- **Validation style:** pure parsers take the current time as a parameter and return `MessageKey` errors (`src/lib/profile.ts:42,69`). Profile validation is shared by the island and the endpoint.
- **Dates:**
  - There is no date input or date parser in `src/`.
  - A plain `YYYY-MM-DD` is displayed with `Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" })` so it never shifts by a day (`src/components/recommendations/EntryDetails.astro:22-24`).
  - `z.iso.date()` is available (`src/lib/catalog/schema.ts:34`).
  - F-02 computes Warsaw local time with `Intl.DateTimeFormat` and `timeZone: "Europe/Warsaw"` (`src/lib/heartbeat.ts:72-79`).
  - The dashboard's age calculation uses `new Date().getFullYear()`, which is UTC in the Worker (`context/archive/2026-09-28-screening-recommendations/plan.md:85`).
- **Islands vs plain forms:**
  - Islands (`ProfileForm`, `SignInForm`, `SignUpForm`) still submit a native `<form method="POST">`, and `onSubmit` only blocks when client validation fails (`src/components/profile/ProfileForm.tsx:111-117,130`).
  - Plain Astro forms are used for simple actions (`src/components/profile/WithdrawConsentForm.astro:16-42`, with the error `<p role="alert">` at `:30-34`).
  - Reusable pieces: `FormField.tsx` (accepts `type`), `SubmitButton.tsx` and `ServerError.tsx`.
  - `src/components/ui/` has only `button.tsx` and `LibBadge.astro`: there is no Input, Label, Dialog or Calendar.

### Dashboard (where S-03 plugs in)

- **The page:** `src/pages/dashboard.astro` runs the onboarding gate, then `getActiveCatalog` + `recommend(...)`. It renders tier items with `RecommendationItem.astro` and "may apply" items with `MaybeRecommendationItem.astro`. It reads no query flags today.
  - `src/pages/profile.astro:34-40,55-62` shows the success `role="status"` and error `role="alert"` block to copy.
- **The tier item** (`RecommendationItem.astro:22`) is an `<li data-slug data-tier>` containing:
  - the `<h4>` name;
  - the "how often" line (`:24-26`);
  - the badges (`:27-54`);
  - `<EntryDetails>` with the "why" row in its slot (`:56-64`).

  A recorded date would naturally go after the badges, where it's visible without opening the details. A marker such as `data-appointment="YYYY-MM-DD"` would give the smoke test something stable to assert on.

- **`EntryDetails.astro`:** a `<details>` containing a `<dl>`, with a default slot for extra rows (`:41`) and the "reviewed on" line (`:59-63`).
- **"May apply" items** (`MaybeRecommendationItem.astro:21`, `<li data-slug data-maybe>`) show a condition, not "due". Whether they can be selected is a product choice (US-02 says "a due screening recommendation", `prd.md:61`).

### What later slices need from S-03

| Slice                 | Requirement (source)                                                                                                                                                                                                   | What S-03 must provide                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| S-04 (FR-006, FR-007) | An email "as a recorded appointment date approaches" (`prd.md:114-115`), only for users who opted in (`prd.md:71`). The lead time is open (`roadmap.md` S-04 Unknowns).                                                | A future date that can be queried with SQL across users, and a stable record id (for a sent-ledger). The opt-in flag is S-04's to add. |
| S-05 (FR-008, FR-009) | Confirm "the exam was executed on that date" (`prd.md:75-76`), or "mark an exam already done with its last date ('never / don't know' allowed)" (`roadmap.md` S-05). The exam then drops from "due now" (`prd.md:77`). | A record that can later be marked confirmed; its date becomes the "last done" date. The confirmed marker can be an additive column.    |
| S-06 (FR-009)         | Email when a confirmed exam's interval elapses, "without re-entering the exam" (`roadmap.md` S-06)                                                                                                                     | The last confirmed date per (user, exam), readable by the cron                                                                         |
| S-07 (FR-011)         | Nudge if "selected an exam but haven't recorded an appointment date within some days" (`prd.md:127-128`)                                                                                                               | **A "selected, no date" state with a timestamp**, now or added later                                                                   |
| S-07 (FR-012)         | Follow-up "if they haven't confirmed within some time after the appointment date passes" (`prd.md:129-131`)                                                                                                            | The appointment date plus S-05's confirmed marker                                                                                      |

- **F-02's cron:**
  - `src/worker.ts:7-12` exports `scheduled()`, which calls `runHeartbeat`. The trigger is `0 8,9 * * *`, and it sends only when it is 10:00 in Warsaw (`wrangler.jsonc:15-17`, `src/lib/heartbeat.ts:11,15,61-79`).
  - `shouldSend` throws on any other cron string (`heartbeat.ts:67-68`), so S-04 has to extend it.
  - F-02 reads no user data. The cross-user read path is S-04's decision (`reminder-dispatch-path/research.md:160-165`).
  - Limits: Workers Free allows 10 ms CPU per run. Resend test mode delivers only to the owner's address, so real users can't be emailed until a domain exists (`reminder-dispatch-path/research.md:39-42,245-246`).
  - Both limits argue for a set-based SQL query over an indexed date column.
  - F-02 is still `implementing` (`context/changes/reminder-dispatch-path/change.md:4`; production checks 4.1–4.4 unchecked at `plan.md:434-440`), so its roadmap status `in-progress` is accurate.
- **Time zones:** no document mentions per-user time zones. The product is Poland-only, and F-02 hard-codes `Europe/Warsaw` (`heartbeat.ts:72-79`). Inferred: a calendar `date` column compared against Warsaw's "today" fits S-03, S-04 and S-07.
- **Guardrails:**
  - Record the date only: "does not attempt to book, schedule, or contact any provider" (`prd.md:69-70`; Non-Goals `prd.md:162`).
  - No AI (`prd.md:137`).
  - One user per account (`prd.md:163`).
  - No diagnosis wording (`prd.md:40`).
  - Screening names are Art. 9 data and Resend keeps logs, so reminder email bodies should stay generic (`reminder-dispatch-path/research.md:139`). This matters for S-04, not S-03.

## Code References

- `supabase/migrations/20260927190303_onboarding_profile.sql:11,54,62-63,77-90,94-129` – owner column, timestamps, trigger, consent-gated RLS, grants
- `supabase/migrations/20260928061623_harden_consent_withdrawal.sql:11-31,34-45` – withdraw function (deletes only `profiles`), default-privilege revokes
- `supabase/migrations/20260928153742_screening_catalog.sql:10,34,65-72` – catalog PK, status, RLS, grants
- `supabase/tests/database/onboarding_profile.test.sql` (`plan(33)`) and `screening_catalog.test.sql` (`plan(25)`) – pgTAP patterns: `set local role` + `request.jwt.claims`, `throws_ok … '42501'`, `has_table_privilege`, a withdrawal block at `:137-172`
- `src/pages/api/profile.ts:8-47` – endpoint template; `src/pages/api/consent/withdraw.ts:6-31` – RPC call and `from` return map
- `src/lib/forms.ts:5-11`, `src/lib/errors.ts:7-10`, `src/lib/consent.ts:15-40`, `src/lib/supabase.ts:6-22`
- `src/middleware.ts:5,21-32` – `PROTECTED_ROUTES` and `no-store`
- `src/lib/profile.ts:42,69-143` – pure parser style
- `src/pages/dashboard.astro`, `src/components/recommendations/{RecommendationItem,MaybeRecommendationItem,EntryDetails}.astro` – item markup and slots
- `src/lib/catalog/read.ts:15-16`, `src/lib/catalog/recommend.ts:82` (`resolveInterval`, for S-05)
- `src/worker.ts:7-12`, `src/lib/heartbeat.ts:11-79`, `src/lib/email.ts:9,38-64`, `wrangler.jsonc:15-17`, `astro.config.mjs:21-30` – the F-02 cron path
- `scripts/smoke.mjs:45-58,128-141,196-209` – request helper, dashboard step, `bodyIncludes`/`bodyExcludes`

## Architecture Insights

- Every user-owned table is RLS-first. Consent is checked both in the route and in the policies. Grants are column-level and minimal, and `anon` is always revoked.
- Endpoints never return JSON. They redirect with translatable error codes, and pages render `role="alert"` / `role="status"` messages. The profile island is progressive enhancement over a native form POST.
- The catalog is reference data that is never deleted and is keyed by an immutable slug. User records point to it and must render even when an entry is retired or no longer recommended.
- Pure logic modules with no I/O (`recommend.ts`, `profile.ts`) take "now" as a parameter. F-03 will unit-test them.
- Cross-user reads by the scheduled Worker are an open architecture decision owned by S-04. S-03 should not pre-empt it; for example, it shouldn't grant anything to `service_role` or add a definer read function.

## Historical Context (from prior changes)

- `context/archive/2026-09-27-onboarding-profile/plan.md:41` – "No last-exam dates in the profile. They belong to S-03/S-05." Still accurate.
- `context/archive/2026-09-27-onboarding-profile/reviews/impl-review.md` F1/F2 – why withdrawal became `security definer`, and why default privileges must be revoked. Both still apply to a new table.
- `context/archive/2026-09-28-screening-catalog-v1/plan-brief.md:40,66` – the catalog is S-03's FK target, and exam records were out of F-01's scope. Still accurate.
- `context/archive/2026-09-28-screening-recommendations/plan.md:67` – in S-02, "due" means "eligible now", because no records exist. S-03 is the first slice where that could change. Research tier rule: `due_status` "never done or overdue = +2" (`context/foundation/screening-catalog-research.md:76`).
- `context/foundation/screening-catalog-research.md:116` – "Last date of each exam, month/year precision with 'never / don't know'", for S-05's "already done" input. Partly relevant: it argues that S-05's history input may differ in shape from S-03's exact appointment date.
- `context/foundation/screening-catalog-research.md:9,177` – on-device storage and `.ics` export instead of server push. Contradicted by S-01 (server storage with consent) and F-02 (server-side email).

## Related Research

- `context/archive/2026-09-28-screening-recommendations/research.md` – dashboard, profile and tier findings, which S-03 builds on
- `context/changes/reminder-dispatch-path/research.md` – cron runtime, cross-user read options, email limits
- `context/foundation/screening-catalog-research.md` – due status and last-exam precision

## Open Questions

These are product choices for `/10x-plan`. None of them is missing evidence.

1. **Selection vs date (FR-011).** Is "select an exam" a separate stored step (a `selected` row with a timestamp and no date), or is it only a row with a date? The first makes S-07's nudge possible without a schema change later.
2. **Multiplicity and history.** How many appointments can a user have per exam: one open appointment (upsert), or several rows with history? What does "reschedule" do: edit in place, or replace? And can a date be cleared or cancelled?
3. **Past dates.** Can S-03 accept a date in the past, or only today and later? Past exams belong to S-05's "mark already done", which the research says uses month/year precision with "never/don't know" (`screening-catalog-research.md:116`).
4. **Which entries can be booked.** Only tier entries ("a due screening recommendation", `prd.md:61`), or "may apply" entries too? And how does the endpoint validate the slug: active catalog only, or also against the user's `recommend()` result?
5. **How a booked exam is shown.** Does it stay in its tier with a "booked for …" line, move to a "booked" group, or change tier or `due_status`? US-03 removes an exam from "due now" only after confirmation (`prd.md:77`).
6. **Date bounds.** What is the earliest and latest date allowed (for example "today in Warsaw" up to N years ahead)? The input format and time zone follow from the Warsaw inference above.

Details the plan can settle from the patterns above, without the user: an FK to `screening_catalog(slug)` plus an active-entry check, consent-gated RLS, the withdrawal function update, pgTAP cases, `PROTECTED_ROUTES`, and the `?error=`/success-flag rendering on `/dashboard`.
