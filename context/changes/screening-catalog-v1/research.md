---
date: 2026-09-28T11:47:33+02:00
researcher: Amadeusz Kozlowski (with Claude Code)
git_commit: 91d2f10f90e7d45ed8c1c3e7c6fe04b4aa49425c
branch: main
repository: amakoz/dbam
topic: "F-01 screening-catalog-v1: what the catalog must hold, who consumes it, and how it can live in this codebase"
tags: [research, codebase, screening-catalog, supabase, migrations, rls, i18n, rules]
status: complete
last_updated: 2026-09-28
last_updated_by: Amadeusz Kozlowski (with Claude Code)
---

# Research: F-01 screening-catalog-v1

**Date**: 2026-09-28T11:47:33+02:00
**Researcher**: Amadeusz Kozlowski (with Claude Code)
**Git Commit**: 91d2f10f90e7d45ed8c1c3e7c6fe04b4aa49425c
**Branch**: main
**Repository**: amakoz/dbam

## Research Question

Roadmap F-01 (issue #17) calls for a curated catalog of screening types. Each entry needs:

- eligibility criteria (at least age and sex)
- an importance tier
- a repeat interval, or an explicit "no known interval" marker
- a source

The catalog is publicly readable and holds no personal data (`context/foundation/roadmap.md:79-92`).

Using `context/foundation/screening-catalog-research.md` as the content source, this research answers four questions:

- What must the catalog contain?
- What do its downstream consumers need from it?
- Which storage and rule designs fit this codebase?
- What remains a genuine decision for `/10x-plan`?

## Summary

1. **Content is ready for rows 1–5; later rows are incomplete.**
   - The research gives 14 candidate entries (`screening-catalog-research.md:146-163`) and recommends seeding rows 1–5 first: mammography, HPV/cytology, colonoscopy, LDCT, Moje Zdrowie (`:173`).
   - Rows 1, 2, 3 and 5 have numeric intervals.
   - Nine rows have neither a numeric interval nor a "no known interval" marker: 4, 7, 8, 9, 10, 11, 12, 13, 14. For example, LDCT is "Per program" and PSA is "Shared decision".
   - F-01 requires one or the other (`roadmap.md:81`).
2. **Consumers need a stable identity, lifecycle status, and sessionless read access.**
   - S-02 reads eligibility, tier, and rule/source text inside a user request.
   - S-03 stores a user's selection of "a recommended exam" (`prd.md:97-98`), so records must reference an entry.
   - S-05 reads the interval and must show "no known interval" to the user rather than drop the exam (`roadmap.md:162`).
   - S-06 and S-07 run on a cron with no user session (`roadmap.md:172-195`).
   - Roadmap question #28 wants AI-drafted catalog updates to "land as drafts pending sign-off" (`roadmap.md:216`; `tech-stack.md:40-45`).
   - None of these documents says whether records reference entries by id or slug, whether ids are immutable, or whether retired entries stay referenceable.
3. **A catalog table would set new precedents in this repo.**
   - No migration inserts data rows.
   - No table is readable by `anon`: both S-01 tables `revoke all … from anon` (`20260927190303_onboarding_profile.sql:44`, `:124`).
   - No `CREATE TYPE` enums exist. Enumerations are `text … check (…)` (`:13`, `:56`, `:57`).
   - No jsonb column exists.
   - `seed.sql` is configured but missing (`supabase/config.toml:60-65`), and CI `migrate` runs `supabase db push … --skip-vault --yes` with "No --include-seed" (`.github/workflows/ci.yml:73-76`). So production catalog rows can only arrive as INSERTs in a migration.
4. **Runtime and keys.**
   - The app has one Supabase client, cookie-bound, built from `SUPABASE_KEY` (`src/lib/supabase.ts:6-22`). That key is the publishable/anon key and "Never the `service_role`" (`context/changes/deployment/deployment-plan.md:187-188`).
   - A search of `src/`, `scripts/`, `supabase/` and `.github/` finds no `service_role`, `sb_secret` or `serviceRole` identifier.
   - Two consequences follow:
     - A catalog granted SELECT to `anon` would be readable by a future cron using the publishable key.
     - A catalog readable only by `authenticated` would not, because a cron has no user session.
5. **The research's rule format does not work as written.**
   - The example `eligibility_conditions` (`screening-catalog-research.md:98`) uses `{"between":[50,"age",65]}`. JSONLogic has no `between` operator, and `"age"` should be `{"var":"age"}`. The standard form is `{"<=":[50,{"var":"age"},65]}` (json-logic-js `logic.js:59-62`).
   - Every eligibility branch the current profile can evaluate is a plain comparison on age, sex, `pack_years` or `years_since_quitting`. So typed columns or a small typed evaluator cover rows 1–5 and 12 without a JSONLogic dependency (details below).
   - JSONLogic helps only if rules must be edited as data without a deploy.

## Detailed Findings

### Catalog content from the research (rows and gaps)

Row facts come from `screening-catalog-research.md:26-32`, `:146-163`. A "Profile-evaluable" entry means the current `profiles` columns can decide eligibility (`20260927190303_onboarding_profile.sql:53-72`).

| #   | Entry                 | Eligibility                                                   | Interval as given                          | Profile-evaluable part                                     |
| --- | --------------------- | ------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| 1   | Mammografia           | F 45–74                                                       | 24 mo                                      | all (post-treatment 12-mo case: route to doctor, `:28`)    |
| 2   | HPV HR / cytologia    | F 25–64                                                       | 60 mo HPV / 36 mo cytology / 12 mo if risk | age+sex; interval choice needs exam history and HIV status |
| 3   | Kolonoskopia          | 50–65; 40–49 with first-degree family history                 | 120 mo                                     | 50–65 branch; family branch and 10-year exclusion not      |
| 4   | LDCT płuc             | 55–74, ≥20 pack-years, current or quit ≤15 y; 50–74 +exposure | "Per program"                              | main branch; exposure branch not                           |
| 5   | Moje Zdrowie – bilans | 20+                                                           | 60 mo at 20–49 / 36 mo at 50+              | all (40 PLUS 12-month rule not)                            |
| 6   | Glukoza / HbA1c       | 45+; any age with risk                                        | 36 mo / 12 mo with risk                    | 45+ branch                                                 |
| 7   | Ciśnienie             | all adults                                                    | "Reviewer to confirm"                      | all                                                        |
| 8   | Lipidogram            | all adults                                                    | "With Moje Zdrowie"                        | all                                                        |
| 9   | SCORE2                | 40+                                                           | "With Moje Zdrowie"                        | age (the "with CV risk" qualifier at `:32` not)            |
| 10  | Anty-HCV              | per questionnaire                                             | "Per POZ"                                  | none                                                       |
| 11  | FIT                   | per questionnaire                                             | "Per POZ"                                  | none                                                       |
| 12  | PSA                   | M 50+                                                         | "Shared decision"                          | all                                                        |
| 13  | Funkcje poznawcze     | 60+                                                           | "With Moje Zdrowie"                        | all                                                        |
| 14  | Szczepienia           | all adults                                                    | "Per IPZ"                                  | all                                                        |

Caveats that must reach the entries or the reviewer (research text, not re-verified here):

- **LDCT:** mark `pending_verification` until the Dz.U. 2026 poz. 976 text is checked. NFZ contracts start "no earlier than" 1 October 2026 (`:31`, `:173`, `:181`).
- **PSA:** age range is "M 50+" (`:161`), but USPSTF C is 55–69, flagged "confirm … before encoding" (`:42`).
- **Blood pressure and prostate intervals** are flagged for reviewer confirmation (`:182`).
- **Medical sign-off:** a POZ doctor signs off each entry before public launch, which is not a build gate (`roadmap.md:90`, `:214`).
- **Sources:** each entry needs `sources` with url, title, quote and accessed date (`:105`), plus reviewer and review dates (`:107`, `:174`).

The two "age-banded" or conditional intervals do not fit a single `interval_months`:

- Row 5 changes interval by age band.
- Row 2 changes by last test type and risk.

The research models these as `interval_rules` jsonb (`:97`). Only row 5's banding is computable from the profile. Row 2's depends on exam history, which S-05 introduces.

### Consumers and what each needs

| Consumer                                    | Reads                                                                  | Access path                                                        | Source                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| S-02 recommendations                        | eligibility, tier (or evidence level), rule + source text, PL/EN names | user request, cookie-bound client (`src/pages/dashboard.astro:11`) | `roadmap.md:123-133`                                  |
| S-03 record appointment                     | entry identity (user "select[s] a recommended exam")                   | user request                                                       | `roadmap.md:135-145`, `prd.md:97-98`                  |
| S-04 appointment reminder                   | entry name via the record (inference)                                  | cron (F-02)                                                        | `roadmap.md:147-158`                                  |
| S-05 confirm + recurrence                   | interval, "no known interval" distinction                              | user request                                                       | `roadmap.md:160-170`, `prd.md:110-113`                |
| S-06 due reminder                           | interval (+ likely eligibility, status) for every opted-in user        | cron, no user session                                              | `roadmap.md:172-182`                                  |
| S-07 nudges                                 | entry name via records (inference)                                     | cron, no user session                                              | `roadmap.md:184-195`                                  |
| #28 AI catalog updates (not this milestone) | writes drafts that go live only after review                           | scheduled job                                                      | `roadmap.md:216`, `tech-stack.md:40-45`               |
| parked chatbot                              | "would get only the exam ID"                                           | —                                                                  | `roadmap.md:225`, `screening-catalog-research.md:175` |

Access notes:

- **F-02** reads nothing from the catalog (`roadmap.md:94-107`).
- **Cron CPU:** the Workers Free plan's 10 ms limit is noted only for cron runs (`deployment-plan.md:465`, `infrastructure.md:60`, `:92`, `roadmap.md:104`). No inspected document raises a request-path CPU concern.
- **Cron access to user records:** S-06 and S-07 need a privileged sessionless path, either a service-role secret or a `security definer` function, to read user records. That is outside F-01, but it affects whether the catalog should be `anon`-readable.

### Storage options against this codebase

These are observed facts that bear on the choice. The choice itself is an open question.

- **Migrations:**
  - Additive-first, delivered only by CI `migrate` (CLAUDE.md hard rules; `ci.yml:57-78`).
  - `deploy` needs `migrate` (`ci.yml:80`).
  - A rollback never undoes schema (`infrastructure.md:83`).
- **Table conventions** (`20260927190303_onboarding_profile.sql`):
  - `comment on table` for each table (`:19-20`, `:74-75`)
  - `enable row level security` (`:26`, `:92`)
  - named policies (`:28-30`)
  - `revoke all … from anon` (`:44`, `:124`)
  - column-level grants (`:45-47`, `:125-129`)
- **Default-privilege revokes:** Supabase defaults leave TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on new tables. The S-01 hardening revokes them explicitly (`20260928061623_harden_consent_withdrawal.sql:33-42`; S-01 review F2). A catalog granting SELECT to `anon` would need the same revokes for both `anon` and `authenticated`.
- **pgTAP:**
  - Single file `supabase/tests/database/onboarding_profile.test.sql`, `begin … rollback`, `plan(33)` (`:3-5`, `:174-175`).
  - Role switch via `set local role` + `request.jwt.claims` (`:13-14`, `:105-106`).
  - Privileges are asserted as `throws_ok … '42501'` (`:108`) and `ok(not has_table_privilege(…))` (`:128-131`).
  - CLAUDE.md requires a case for every new policy or grant.
  - CI runs `supabase test db` right after `supabase start`, with no `db reset` (`ci.yml:39-42`).
- **Exposure:** `public` is exposed through PostgREST (`supabase/config.toml:13`), so a public table is reachable over the REST API with the publishable key. Its protection rests on grants and RLS.
- **Types:**
  - `npm run db:types` regenerates `src/lib/database.types.ts` (`package.json:15`).
  - jsonb columns surface as the recursive `Json` type (`database.types.ts:1`), so rule or source jsonb would need runtime validation.
  - The project declares no validation library. `zod` exists only transitively (via astro), so importing it without declaring it would be a phantom dependency.
- **A TypeScript module instead:**
  - `tsconfig.json` extends `astro/tsconfigs/strict` (strict + `resolveJsonModule`).
  - A typed `as const` module gives compile-time checking of rule data and of i18n keys (next section).
  - It cannot be a foreign-key target for S-03 records, cannot hold #28 drafts without a deploy, and is not readable by other services except through the app.
- **Sessionless readers:** no code path queries a table without a user session today. `src/pages/index.astro` and `src/pages/api/health.ts` do not query the DB, and every table access sits on a protected route (`src/middleware.ts:5`).

### Rule representation

- **JSONLogic libraries** (`npm view`, 2026-09-28):

  | Package             | Version | Size                    | Types                                 | Module format | Deps | Last publish |
  | ------------------- | ------- | ----------------------- | ------------------------------------- | ------------- | ---- | ------------ |
  | `json-logic-js`     | 2.0.5   | `logic.js` ≈4.2 KB gzip | separate `@types/json-logic-js@2.0.8` | CJS/UMD only  | none | 2024-07-09   |
  | `json-logic-engine` | 5.0.7   | ESM ≈19 KB gzip         | bundled                               | ESM           | none | 2026-04-01   |
  | `json-rules-engine` | 7.3.1   | 101 KB unpacked         | bundled                               | CJS           | 4    | 2025-02-20   |
  - `json-logic-engine` calls `globalThis.eval` in its compile path (`build()`). Workers block string code generation, so only `run()` would be usable there. This comes from reading the source, not from running it in workerd.
  - `json-rules-engine` uses an event-based "facts" model.

- **Research example is invalid JSONLogic** (`screening-catalog-research.md:98`), as described in Summary item 5.
- **A minimal typed shape covers the profile-evaluable branches of rows 1–5 and 12:**
  - `sex?`, `ageMin`, `ageMax?`
  - `smoking?: { minPackYears, maxYearsSinceQuit }`
  - an interval that is either fixed months, age bands, or a marker

  Branches that need data the profile lacks are listed in the table above (family history, exposure, exam history, questionnaire gates).

- **Null smoking fields:** `pack_years` is null for never-smokers (`profiles_smoking_fields_match_status`, `20260927190303_onboarding_profile.sql:64-71`). An evaluator must treat null as "not eligible" for LDCT.
- **Age basis:** age is `currentYear - birth_year` in S-01 (`context/archive/2026-09-27-onboarding-profile/plan.md:239`). NFZ counts age by birth year (`screening-catalog-research.md:28`, `:114`). No source states whether ranges are inclusive.
- **Bundle budget:** the current bundle is 2038 KiB / 448 KiB gzip, against the Free plan's 3 MiB limit (`deployment-plan.md:218`, `:271`). Either JSONLogic library adds under 20 KB gzip.

### Localization and display text

- **i18n typing:**
  - `t()` accepts only `MessageKey = keyof typeof pl` (`src/i18n/index.ts:9`, `:14-17`).
  - A template key like ``t(`catalog.${slug}.name`)`` typechecks only when `slug` is a literal union whose expansions all exist in `pl.ts`. With `slug: string` (e.g. read from the DB) it fails with TS2345. This was verified by the worker in a scratch `tsc --strict` run.
  - The runtime guard `isMessageKey()` (`src/i18n/index.ts:29-31`) plus a fallback is the existing pattern for dynamic keys, as used by `errorMessageKey()` in `src/lib/errors.ts`.
- **Research schema is not fully bilingual:** it has `name_pl`/`name_en`, but `plain_summary_pl` and `how_to_access_pl` are Polish only (`screening-catalog-research.md:93`, `:104`). CLAUDE.md asks that every user-facing string be available in both `pl.ts` and `en.ts`.

## Code References

- `src/lib/supabase.ts:6-22` – single cookie-bound client on `SUPABASE_KEY`
- `src/i18n/index.ts:9`, `:14-17`, `:29-31` – `MessageKey`, `Translate`, `isMessageKey`
- `src/lib/database.types.ts:1` – `Json` type for jsonb
- `supabase/migrations/20260927190303_onboarding_profile.sql:13`, `:44`, `:53-72`, `:124` – text+check enums, anon revokes, profile columns
- `supabase/migrations/20260928061623_harden_consent_withdrawal.sql:33-42` – default-privilege revokes
- `supabase/tests/database/onboarding_profile.test.sql:108`, `:128-131` – privilege assertion styles
- `supabase/config.toml:13`, `:60-65` – exposed schemas; seed config (file absent)
- `.github/workflows/ci.yml:39-42`, `:73-76` – pgTAP after start; production push without seed
- `package.json:15` – `db:types`

## Architecture Insights

- **Server-side evaluation:** the profile is server-side, and the dashboard is SSR, so the research's "evaluate in the browser" (`screening-catalog-research.md:109`) and "profile in localStorage" (`:169`) no longer apply. Evaluation would run in the Worker, and no profile data needs to reach the client beyond the rendered result.
- **Catalog contents:** the catalog is reference data with no personal data. That is why a public, anon-readable table is defensible where the S-01 tables are not. It is also the first exception to "revoke all from anon", so it needs an explicit pgTAP assertion of read-only access.
- **Split by rate of change:**
  - Identity and lifecycle fields (slug, status, sources, review dates) change with medical review.
  - Rule fields change with regulation.
  - Display text changes with copy.

  Whether all three live together is part of the storage decision.

## Historical Context (from prior changes)

- **`context/foundation/screening-catalog-research.md`**, per claim:
  - "Supabase table `exam_rule`, publicly readable" (`:88`): consistent with the roadmap (`roadmap.md:81`).
  - "serve the catalog as static JSON" (`:138`): contradicts `:88`. It was written in the local-only context, now superseded.
  - "Profile in localStorage" / "evaluation in the browser" (`:169-170`): contradicted by S-01's server-side profile and PRD NFR (`prd.md:126`).
  - "Seed rows 1–5 first" / "LDCT `pending_verification`" (`:173`): still consistent with the roadmap risk note (`roadmap.md:91`).
  - JSONLogic example (`:98`): invalid operator (above).
- **`context/archive/2026-09-27-onboarding-profile/`:**
  - Profile fields were chosen for these rules, e.g. "the LDCT rule needs both" pack-years and years since quitting (`plan-brief.md:23`).
  - Review F2 established the default-privilege revokes.
- **`context/changes/screening-recommendations/research.md`:** S-02 research, same day. It records the tier-model conflict (PRD FR-004 two tags vs research three computed tiers) and the S-02-side open questions. This document does not repeat them beyond what F-01 must store.

## Related Research

- `context/changes/screening-recommendations/research.md` – S-02 consumer view of the catalog
- `context/foundation/screening-catalog-research.md` – content sources, tier model, proposed schema

## Open Questions

These are for `/10x-plan` or the user.

1. **Storage.** Choose one:
   - Supabase table: rows in a migration, public read, pgTAP grants, FK target for S-03, room for #28 drafts.
   - Typed TS module: compile-time checked rules and i18n keys; no FK, no drafts without a deploy.
   - Hybrid: table for identity, lifecycle and sources; TS for rules and text.
2. **Read access.** SELECT to `anon` (usable by public pages and a future cron with the publishable key), or `authenticated` only?
3. **Identity.** Choose `slug` as primary key or a surrogate id. Record that slugs are immutable and that retired entries stay (no deletes) so S-03/S-05 records keep resolving. No source states this yet.
4. **Lifecycle states.** The research enum is `active`/`pending_verification`/`retired` (`:106`). Does #28 need a `draft` state now or later? Is the rule "consumers read `active` only" (which affects LDCT before 1 Oct 2026)?
5. **Tier storage.** Store a static per-entry tier (roadmap/PRD) or `evidence_level` for S-02 to compute tiers (research)? This is linked to the S-02 tier question.
6. **Rule representation.** Typed columns or evaluator vs JSONLogic (valid syntax, eval-free `run()` path, new dependency). How are non-evaluable branches represented: omitted, or stored for later with a flag?
7. **Interval model.** Choose among a single `interval_months` with null plus an explicit marker, age bands (row 5), or deferring conditional intervals (row 2) to S-05. What marker encodes "Per program" / "Shared decision" / "With Moje Zdrowie"?
8. **Scope of v1 rows.** Rows 1–5 only (research seed order), or also 6–14, given that 9 rows lack a numeric interval?
9. **Display text location.** `name_pl`/`name_en` (+ summaries) as DB columns, or `src/i18n` keys by slug?
10. **Content verification.** Row facts are taken from the research as given. The LDCT regulation text, PSA age range and BP interval are unverified (research caveats `:181-182`). Medical sign-off is a launch gate, not a build gate.
