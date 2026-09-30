---
date: 2026-09-28T11:47:33+02:00
researcher: Amadeusz Kozlowski (with Claude Code)
git_commit: 91d2f10f90e7d45ed8c1c3e7c6fe04b4aa49425c
branch: main
repository: amakoz/dbam
topic: "S-02 screening-recommendations: what the dashboard recommendation list needs, what exists, and what the missing F-01 catalog implies"
tags: [research, codebase, dashboard, screening-catalog, profile, i18n, rls, supabase]
status: complete
last_updated: 2026-09-28
last_updated_by: Amadeusz Kozlowski (with Claude Code)
---

# Research: S-02 screening-recommendations

**Date**: 2026-09-28T11:47:33+02:00
**Researcher**: Amadeusz Kozlowski (with Claude Code)
**Git Commit**: 91d2f10f90e7d45ed8c1c3e7c6fe04b4aa49425c
**Branch**: main
**Repository**: amakoz/dbam

## Research Question

For roadmap slice S-02 (`screening-recommendations`, issue #20): the user opens the dashboard and sees the screenings due for their profile. The list is grouped by importance tier, most important first. Each item shows the rule and source behind it. When nothing is due, the user sees an explanatory empty state. No wording may imply a diagnosis (`context/foundation/roadmap.md:123-133`).

The question has four parts:

- What does S-02 build on in the code?
- What does its prerequisite F-01 (screening catalog) define?
- Which decisions are already settled?
- What is still open for `/10x-plan`?

## Summary

1. **F-01 does not exist.** No catalog is in the code or in any branch.
   - Issue #17 (F-01) is OPEN (`gh issue view 17`).
   - `supabase/migrations/` holds two S-01 migrations and nothing else (`20260927190303_onboarding_profile.sql`, `20260928061623_harden_consent_withdrawal.sql`).
   - No `screening-catalog-v1` folder exists under `context/changes/`.
   - A grep for `catalog|screening` in `src/` and `supabase/` finds only i18n copy, `config.toml`, and the S-01 migration comment.
   - Branch history shows no unmerged catalog or recommendations work. The only matches are docs commits (e.g. `ab316e4` "Add M-01 roadmap and screening catalog research").
   - Consequence: S-02 cannot be delivered without a catalog. The plan must either sequence F-01 first or absorb a minimal catalog into S-02. This is a sequencing decision for the user (Open Question 1).
2. **The dashboard is ready to receive a list.**
   - `src/pages/dashboard.astro:43-50` holds a placeholder `<section aria-labelledby="recommendations-heading">`. S-01 left it there on purpose ("the dashboard only gets a placeholder section", `context/archive/2026-09-27-onboarding-profile/plan.md:39`).
   - The page already loads the full `profiles` row via `getOnboardingState` (`src/pages/dashboard.astro:17`, `src/lib/consent.ts:27-40`). It redirects to `/onboarding` unless the state is `complete` (`dashboard.astro:18-20`).
3. **The profile holds more than "birth year, sex, smoking".**
   - `public.profiles` has `birth_year`, `sex` (`female|male`), `smoking_status` (`never|current|former`), `packs_per_day`, `smoking_years`, `years_since_quitting` and a generated `pack_years` (`supabase/migrations/20260927190303_onboarding_profile.sql:53-72`).
   - This covers the age/sex branch of catalog rows 1, 2, 3, 5, 6, 7, 8, 9, 12, 13 and 14. It also covers the main LDCT branch (≥20 pack-years, current smoker or quit ≤15 y).
   - It does not cover family history, occupational exposure, risk conditions, symptoms, questionnaire gates (rows 10, 11) or last-exam dates (`screening-catalog-research.md:119-126`, `:146-163`).
4. **The catalog design exists only as research, and parts of it are superseded.**
   - `context/foundation/screening-catalog-research.md:88-109` proposes a Supabase table `exam_rule` with JSONLogic `eligibility_conditions` evaluated "in the browser".
   - Its architecture section (`:167-170`) assumes the profile lives in `localStorage`/IndexedDB. That is superseded: S-01 stores the profile server-side behind RLS and consent (PRD NFR `prd.md:126`, migration above).
   - The same document also says "serve the catalog as static JSON" (`:138`).
   - Neither the roadmap nor the PRD picks table vs file (`roadmap.md:81`, `prd.md:113`: "static curated table for v1").
5. **The tier model conflicts across sources.**
   - PRD FR-004 has two tags, "important vs. routine", and uses prostate as the "important" example (`prd.md:93-96`).
   - The research defines three computed tiers (`screening-catalog-research.md:80-84`):
     - Tier 1 "Ważne – zrób/umów teraz"
     - Tier 2 "Warto zaplanować"
     - Tier 3 "Porozmawiaj z lekarzem", which includes PSA
   - In the research, the tier is computed from `evidence_level` + `due_status` + risk. The roadmap and PRD Business Logic describe importance as a per-entry catalog attribute (`roadmap.md:81`, `prd.md:137`).
6. **"Due" has no records to work from in S-02.** Exam records arrive in S-03/S-05. Under the research's `due_status` rule ("never done or overdue = +2", `screening-catalog-research.md:76`), an eligible screening with no record counts as due. So in S-02, "due" in practice means "eligible now". This follows from `:76` and US-03 (`prd.md:72`); no document says it outright.

## Detailed Findings

### Dashboard and gating (what S-02 edits)

- **Page:** `src/pages/dashboard.astro` is plain Astro, no islands.
  - It reads `{ user, locale }` from `Astro.locals` (`:8`) and builds its own Supabase client (`:11`). The middleware does not put a client on `locals` (`src/env.d.ts:1-6`).
  - It calls `getOnboardingState` (`:17`) and redirects to `/onboarding` unless the state is complete (`:18-20`).
  - It renders the recommendations placeholder (`:43-50`), a profile `<dl>` (`:52-67`) and a sign-out form (`:69-76`).
- **Middleware:** `/dashboard` is already in `PROTECTED_ROUTES` (`src/middleware.ts:5`). Protected responses get `Cache-Control: private, no-store` (`src/middleware.ts:28-32`, from S-01 review F5). So the personalized list will not be edge-cached, and S-02 needs no middleware change.
- **Error path:** `getOnboardingState` throws on DB error (`src/lib/consent.ts:27-40`). S-01 review F4 added the translated `src/pages/500.astro` for this path (`context/archive/2026-09-27-onboarding-profile/reviews/impl-review.md:97-108`). A catalog read on the dashboard would fail the same way.
- **Smoke:** `scripts/smoke.mjs` touches `/dashboard` in five steps:
  - anon GET → 302 `/auth/signin` (`:71`)
  - no consent or profile → 302 `/onboarding` (`:96`)
  - onboarded user → 200 (`:128`)
  - after withdrawal → 302 `/onboarding` (`:152`)
  - after sign-out → 302 `/auth/signin` (`:178`)

  The onboarded-user step checks status only, with no body assertion.
  - The smoke profile (`:18-26`) is a woman born 1970, former smoker, 0.5 packs/day × 20 y = 10 pack-years, quit 5 years ago.
  - In 2026 her age by birth year is 56. Under the research rows she matches:
    - mammography (F 45–74), HPV (F 25–64) and colonoscopy (50–65)
    - Moje Zdrowie (20+), glucose (45+) and SCORE2 (40+)
    - the all-adult rows 7, 8 and 14
  - She does not qualify for LDCT (10 < 20 pack-years), PSA (male only) or cognitive assessment (60+).
  - That makes her a usable body-assertion fixture if the plan adds one.

### Profile data (inputs to rules)

- **Schema:** `supabase/migrations/20260927190303_onboarding_profile.sql:53-72`.
  - `birth_year smallint` in 1900..2100
  - `sex text` in (`female`, `male`)
  - `smoking_status text` in (`never`, `current`, `former`)
  - `packs_per_day numeric(4,2)`, `smoking_years smallint`, `years_since_quitting smallint`
  - `pack_years` generated as `packs_per_day * smoking_years`
  - The consistency check `profiles_smoking_fields_match_status` is at `:64-71`.
- **Generated types:** in `src/lib/database.types.ts:58-70`, `sex` and `smoking_status` are `string` (text + check, so no DB enums). `src/lib/profile.ts` narrows them:
  - `SEX_VALUES`, `SMOKING_STATUSES` (`:7-11`)
  - `MIN_AGE = 18`, `MAX_AGE = 120` (`:13-14`)
  - `type Profile` (`:29`)
- **Age arithmetic:** S-01 computes age as `currentYear - birth_year` (`context/archive/2026-09-27-onboarding-profile/plan.md:239`). The research says NFZ programs count age "by birth year" (`screening-catalog-research.md:28`, `:114`). No document states whether catalog age ranges are inclusive at both ends.
- **Known accuracy caveat:** sex is at-birth female/male only. Organ override is parked with FR-010, so trans and intersex users get less accurate recommendations (`context/archive/2026-09-27-onboarding-profile/plan-brief.md:63`, `plan.md:40`).

### Catalog content (F-01 input)

Candidate entries come from `context/foundation/screening-catalog-research.md:146-163`. The research recommends seeding rows 1–5 first, then 6–14 (`:173`).

| #   | Entry                 | Eligibility (research)                                   | Interval                                  | Research tier              | Evaluable from current profile             |
| --- | --------------------- | -------------------------------------------------------- | ----------------------------------------- | -------------------------- | ------------------------------------------ |
| 1   | Mammografia           | F 45–74                                                  | 24 mo                                     | 1 if due                   | yes (post-treatment exclusion: no)         |
| 2   | HPV HR / cytologia    | F 25–64                                                  | 60 mo HPV / 36 mo cytology; 12 mo if risk | 1 if due                   | age+sex yes; risk interval no              |
| 3   | Kolonoskopia          | 50–65; 40–49 with family history                         | 120 mo                                    | 1 if due                   | 50–65 yes; family branch and exclusions no |
| 4   | LDCT płuc             | 55–74, ≥20 pack-years, quit ≤15 y; 50–74 with extra risk | "Per program"                             | 1 (risk-unlocked)          | main branch yes; exposure branch no        |
| 5   | Moje Zdrowie – bilans | 20–49 / 50+                                              | 60 / 36 mo                                | 1 if never/overdue, else 2 | yes (40 PLUS rule no)                      |
| 6   | Glukoza / HbA1c       | 45+; any age with risk                                   | 36 mo; 12 mo with risk                    | 2                          | 45+ yes; risk no                           |
| 7   | Ciśnienie             | all adults                                               | "Reviewer to confirm"                     | 2                          | yes                                        |
| 8   | Lipidogram            | all adults                                               | "With Moje Zdrowie"                       | 2                          | yes                                        |
| 9   | SCORE2                | 40+                                                      | "With Moje Zdrowie"                       | 2 (point to POZ)           | age yes                                    |
| 10  | Anty-HCV              | per questionnaire                                        | "Per POZ"                                 | 2                          | no                                         |
| 11  | FIT                   | per questionnaire                                        | "Per POZ"                                 | 2                          | no                                         |
| 12  | PSA                   | M 50+                                                    | "Shared decision"                         | 3                          | yes                                        |
| 13  | Funkcje poznawcze     | 60+                                                      | "With Moje Zdrowie"                       | 2                          | yes                                        |
| 14  | Szczepienia           | all adults                                               | "Per IPZ"                                 | 2 (link)                   | yes                                        |

- **Interval gaps:** F-01 requires "a repeat interval or an explicit 'no known interval' marker" (`roadmap.md:81`). Nine of the 14 rows give neither a number nor such a marker: 4, 7, 8, 9, 10, 11, 12, 13, 14 (table above). S-02 only displays eligibility, so these gaps matter to S-05 more than to S-02.
- **LDCT timing:** the LDCT program starts no earlier than 1 October 2026, and the research says to keep the row `pending_verification` until the regulation text is checked (`screening-catalog-research.md:173`). Whether S-02 hides non-`active` rows has not been decided.
- **PSA age range:** the row says "M 50+" (`:161`), but USPSTF C covers 55–69 (`:42`), flagged "confirm … before encoding".

### Tier and ordering model

- The research tier rule is at `screening-catalog-research.md:80-84`. It uses `evidence_level` (3/2/1, `:75`), `due_status` (`:76`), `risk_boost` (`:77`) and `burden_weight` as a tie-breaker (`:78`). Within a tier, items sort by `due_status`, then `risk_boost`, then `burden_weight` (`:86`).
- **Symptom/prior-cancer override banner:** defined at `:84`. It is not evaluable, because the profile has no symptom field.
- **PRD text:**
  - FR-004 replaced "continuous priority sorting" with "a simple importance tag/label" (`prd.md:96`).
  - US-01 still says "ordered by priority" and "ordered using at least the user's age" (`prd.md:47-51`).
  - The roadmap resolves this as "grouped by importance tier (most important first)" (`roadmap.md:125`).
- **Before S-05 there are no records, so `due_status` is +2 for every eligible row.** Under the research rule:
  - Every eligible `evidence_level = 3` row is Tier 1.
  - The branch "Tier 2 = evidence 3 up to date" cannot occur.
  - Row 5 ("1 if never/overdue") is Tier 1.
- **Naming collision:** "Tier A/B/C/D" in the research (`:24`, `:36`, `:41`, `:47`) are _source_ tiers, not importance tiers.

### Wording and compliance guardrails

- **PRD guardrail:** "Recommendations never state or imply a diagnosis" (`prd.md:37`).
- **Informational framing:** "which publicly funded screening programs and guideline checks you are eligible for, and when". Never compute individual risk or say "you have/don't have X" (`screening-catalog-research.md:141-142`; `roadmap.md:132`).
- **Disclaimer:** research recommends a visible "not medical advice, not a medical device" statement and a "consult your POZ doctor" CTA on every page (`screening-catalog-research.md:143`).
- **Per-item "why" with rule, source and review date.** Example: "Age 52 (by birth year) + no colonoscopy recorded → NFZ program 50–65 … Source: NFZ, reviewed 2026-09." (`:86`, `:174`).
- **Tier 3 items:** always shown with a benefits/harms note (`:83`).
- **Profile data and AI:** the profile is never sent to an AI model; recommendations come from deterministic rules (`prd.md:127`).
- **Accessibility:** core flows must work by keyboard and with screen readers (`prd.md:131`). The current section already uses `aria-labelledby` (`dashboard.astro:43`).

### i18n

- **Dictionaries:** flat dot-key dictionaries.
  - `pl.ts` is the source: `MessageKey = keyof typeof pl` (`src/i18n/index.ts:9`).
  - `en.ts` is `Record<MessageKey, string>` (`src/i18n/en.ts:5`), so a missing EN key fails typecheck.
  - Plurals use `t.plural` with `_one/_few/_many/_other` (`src/i18n/index.ts:47-51`). This matters for copy like "every N years".
- **Existing keys:** `dashboard.recommendations.heading` / `.placeholder` at `pl.ts:37-38` and `en.ts:37-38`.
- **Where catalog text lives:** the research schema has `name_pl`/`name_en` but `plain_summary_pl` and `how_to_access_pl` are PL-only (`screening-catalog-research.md:93`, `:104`). The CLAUDE.md rule sends user-facing strings through `src/i18n` with both PL and EN. Whether catalog text lives in the DB (per-locale columns) or in i18n keys (by slug) is undecided.

### Database access pattern (if the catalog is a table)

- **S-01 pattern:**
  - RLS on every table.
  - `revoke all … from anon`.
  - Policies `to authenticated` using `(select auth.uid())`.
  - Column-level insert/update grants (`20260927190303_onboarding_profile.sql:26-47`, `:92-129`).
- **Pitfall:** Supabase default privileges leave TRUNCATE/TRIGGER/REFERENCES/MAINTAIN with `authenticated`, and these must be revoked explicitly (S-01 review F2, `reviews/impl-review.md:70-81`; fix in `20260928061623_harden_consent_withdrawal.sql:34-42`).
- **No precedent for a publicly readable reference table.** Every existing table revokes anon. A select-only catalog table, perhaps anon-readable, would be a new pattern. CLAUDE.md requires a pgTAP case for every new policy or grant. The only pgTAP file today is `supabase/tests/database/onboarding_profile.test.sql` (`plan(33)`).
- **Seeding:** `supabase/config.toml:60-65` enables `seed.sql`, but the file does not exist.
  - Seed data in `seed.sql` never reaches production, because only migrations run through CI `migrate`.
  - A DB-backed catalog would therefore need its rows in a migration (CLAUDE.md hard rule on migrations).
  - After any schema change, regenerate types (`package.json:15` `db:types`).

### Runtime constraints

- **Worker CPU:** the Workers Free plan allows 10 ms CPU per invocation (`context/changes/deployment/deployment-plan.md:465`, written for cron triggers). Evaluating about 14 rules against one profile is small work either way, but a JSONLogic interpreter or a large bundled catalog adds cost.
- **Bundle size:** the bundle was 2.06 MiB raw / 455 KiB gzip against the Free 3 MiB limit, with a note to re-check after heavy dependencies (`deployment-plan.md:84`, F12).
- **Dependencies:** `package.json` has no JSONLogic library and no unit-test runner. "No unit suite is configured yet" (CLAUDE.md).
- **Where to evaluate:** the research's "evaluate in the browser" (`screening-catalog-research.md:109`) would mean shipping the profile to an island. The dashboard is server-rendered today and has the profile on the server.
- **No KV:** there is no KV namespace (deployment-plan F3), so a KV catalog cache would need a human to create one.

## Code References

- `src/pages/dashboard.astro:8-20` – locals, Supabase client, onboarding gate
- `src/pages/dashboard.astro:43-50` – recommendations placeholder section (S-02 target)
- `src/lib/consent.ts:27-40` – `getOnboardingState` returns `{ state, profile }`
- `src/lib/profile.ts:7-29` – `SEX_VALUES`, `SMOKING_STATUSES`, `MIN_AGE`/`MAX_AGE`, label keys, `Profile` type
- `src/middleware.ts:5`, `:28-32` – `PROTECTED_ROUTES`, `Cache-Control: private, no-store`
- `src/i18n/index.ts:9-51` – `MessageKey`, `createT`, `t.plural`
- `src/i18n/pl.ts:37-38`, `src/i18n/en.ts:37-38` – current recommendations keys
- `supabase/migrations/20260927190303_onboarding_profile.sql:53-72`, `:92-129` – profiles schema, RLS/grant pattern
- `supabase/migrations/20260928061623_harden_consent_withdrawal.sql:34-45` – default-privilege revokes
- `supabase/tests/database/onboarding_profile.test.sql` – the only pgTAP file
- `scripts/smoke.mjs:18-26`, `:128` – smoke profile fixture; dashboard 200 check
- `supabase/config.toml:60-65` – seed enabled, `seed.sql` absent

## Architecture Insights

- Static and display UI is written in `.astro` with `createT(Astro.locals.locale)` (e.g. `src/components/profile/WithdrawConsentForm.astro`). Interactivity goes into `.tsx` islands that receive `locale` as a prop. A read-only recommendations list fits the `.astro` side.
- `src/components/ui/` has only `button.tsx` and `LibBadge.astro`. There is no card, badge or alert primitive. Tier badges or cards would need `npx shadcn@latest add …` or plain Tailwind in the existing glass style (`border-white/10 bg-white/5`).
- Conditional classes use `class:list` in `.astro` and `cn()` in React (S-01 phase-1 review F6).
- Migrations are additive-first and reach production only through CI `migrate` before `deploy`. A Worker rollback never undoes schema (CLAUDE.md; `deployment-plan.md:451`).

## Historical Context (from prior changes)

- `context/archive/2026-09-27-onboarding-profile/plan.md:39`: S-02 was deferred; S-01 left a placeholder section.
- `plan.md:32` and `plan-brief.md:23-24`: the profile fields were chosen for eligibility rules. Birth year only, following NFZ age counting. Sex at birth, following NFZ program rules. Pack-years and years since quitting, because "the LDCT rule needs both".
- `plan.md:41`: last-exam dates are deferred to S-03/S-05. So S-02 has no due-status data (supported by the current schema).
- `reviews/impl-review.md` F2, F4, F5: default-privilege revokes, translated 500 page, and `no-store` on protected routes. All three are in the current code and apply to S-02.
- `context/foundation/shape-notes.md:31-32`, `:146`: "AI-driven analysis of user data". Contradicted by PRD v2 (`prd.md:113`, `:127`), which uses deterministic rules.
- `screening-catalog-research.md:167-170`, local-only profile: contradicted by S-01's server-side profile. Its recommendations to use a Supabase catalog table, seed rows 1–5 first and mark LDCT `pending_verification` are still consistent with the roadmap.

## Related Research

- `context/foundation/screening-catalog-research.md` – catalog sources, tier rule, schema, compliance framing (primary input)
- `context/archive/2026-09-27-onboarding-profile/plan.md` – profile design (no research.md in that archive)
- `context/changes/deployment/deployment-plan.md` – runtime limits (CPU, bundle, KV)

## Open Questions

These are for `/10x-plan` or the user. Each is a genuine choice unless marked otherwise.

1. **F-01 sequencing (blocking).** Should `screening-catalog-v1` (#17) be planned and built first as its own change, or should S-02 absorb a minimal catalog (e.g. research rows 1–5 + PSA)? The roadmap lists F-01 as a separate prerequisite (`roadmap.md:47`, `:128`).
2. **Catalog storage.** Options:
   - Supabase table seeded by migration: public read, pgTAP grants, `db:types`. Consistent with the research and "publicly readable".
   - Static TS/JSON module in `src/lib`: no migration, typed, testable. It does not match the research's `exam_rule` table.

   Also: where do localized names and summaries live (DB columns vs `src/i18n` keys by slug)?

3. **Rule representation.** Choose between typed TS predicates evaluated server-side, or JSONLogic data (a new dependency; the research wants reviewer-readable rules).
4. **Tier model.** Choose between three tiers computed as in the research, or a static tier per entry as in the roadmap and PRD Business Logic. Also: labels, and how PRD FR-004's "important vs. routine" with the prostate example is reconciled with PSA in Tier 3.
5. **Unevaluable criteria.** For criteria the profile cannot check (family history, exposure, questionnaire-gated rows 10–11, exclusions), choose: omit, show the base branch only, or show with a "talk to your doctor if…" caveat.
6. **Status filter.** Should S-02 show `pending_verification` rows (LDCT before 1 Oct 2026 or before verification), or only `active` ones?
7. **Age boundary.** Confirm inclusive ranges on `currentYear - birth_year`. Not stated in any source.
8. **Empty state reachability.** Rows 7, 8 and 14 cover "all adults", and profiles are 18+ (`src/lib/profile.ts:13`). So the empty state appears only if the catalog excludes those rows. The PRD still requires it (`prd.md:52-53`).
9. **Disclaimer placement.** The research asks for a disclaimer and a POZ CTA "on every page" (`screening-catalog-research.md:143`). Is it dashboard-only for S-02, or in the layout?
10. **Tests.** Choose between adding a unit test runner for the rule engine (none configured) or relying on smoke body assertions and pgTAP.
