# Screening Recommendations (S-02) Implementation Plan

## Overview

Turn the dashboard's placeholder section into the product's north star: the screenings due for the signed-in user's profile, grouped into three importance tiers. Each item shows how often it repeats, whether NFZ pays for it and whether it needs a referral, and, one click away, the rule and sources behind it. Entries that might apply, but depend on something the profile doesn't collect, go in a separate "may apply to you" section. Before any of that, the owner stamps the 19 active catalog entries as reviewed (a non-medical review), and the catalog tooling enforces that every active entry carries a review stamp, so the launch gate from #27 holds from now on. A last docs phase records unit tests as a new roadmap foundation (F-03) and brings the PRD and roadmap in line with the decisions made here.

## Current State Analysis

- **Dashboard.** `src/pages/dashboard.astro` is plain server-rendered Astro, with no islands. It builds a Supabase client (`:11`), loads the full `profiles` row through `getOnboardingState` (`:17`, `src/lib/consent.ts:27-40`) and redirects to `/onboarding` unless onboarding is complete (`:18-20`). The recommendations section is a placeholder (`:43-50`) with the i18n keys `dashboard.recommendations.heading` and `.placeholder` (`src/i18n/pl.ts:37-38`). `/dashboard` is already protected and served with `Cache-Control: private, no-store` (`src/middleware.ts:5`, `:28-32`). An uncaught error renders the translated `src/pages/500.astro`.
- **Catalog (F-01, archived).** `public.screening_catalog` (`supabase/migrations/20260928153742_screening_catalog.sql`) can be read by `anon` and `authenticated`, and RLS hides drafts. Rows come only from generated snapshot migrations built from `catalog/entries/<slug>.json`. It has 20 entries: 19 `active` and one `draft` (`lung-ldct-nfz-program`). **None is reviewed:** `reviewed_by`, `last_reviewed` and `next_review_due` are all `null`.
- **Rule semantics** are fixed in `src/lib/catalog/factors.ts:6-16` and `catalog/README.md` §Eligibility and §Interval:
  - An entry matches if ANY branch matches.
  - Ages are inclusive, with `age = currentYear − birth_year`.
  - A condition on an uncollected factor makes its branch *unknown*.
  - A condition whose profile value is null is false.
  - For intervals, the FIRST matching override wins.
  - F-01 left the implementation of these semantics to S-02.
- **Validation.** `CatalogEntrySchema` (`src/lib/catalog/schema.ts:187`) is a strict Zod object: unknown keys are rejected, so `created_at`/`updated_at` must not be selected. The Zod refinements (condition vs factor kind, fixed interval ⇔ months) exist only in Zod, not in the database. Zod is not in the Worker bundle yet: `src/` imports it only through `schema.ts`, which nothing in `src/pages` imports.
- **Conditions in the current data** (from all entries): `pack_years gte`, `years_since_quitting lte`, `smoking_status eq/in` (collected), and boolean `eq true` on `family_history_crc_first_degree`, `occupational_carcinogen_exposure`, `bmi gte`, `hypertension`, `dyslipidemia`, `cardiovascular_disease`, `fatty_liver`, `hiv_or_immunosuppression`, `diabetes` and `questionnaire_flags_risk` (uncollected).
- **Interval overrides** exist on five entries:
  - `blood-pressure-measurement` becomes 12 months from age 40;
  - `moje-zdrowie-health-check` becomes 36 months from age 50;
  - `cervical-screening-nfz-program`, `diabetes-screening-glucose` and `eye-exam-glaucoma` have overrides that depend only on uncollected factors.
- **Tests.** There is no unit-test runner. `scripts/smoke.mjs` already supports `bodyIncludes` (a single string) in its expectations (`:189`), but the dashboard step checks only the status code (`:128`). The pgTAP file `supabase/tests/database/screening_catalog.test.sql` has `plan(24)` and data sanity checks at `:48-55`.
- **Current year.** The profile code uses `new Date().getFullYear()` (`src/pages/api/profile.ts:35`).

## Desired End State

A signed-in, onboarded user opens `/dashboard` and sees, in their language (PL/EN):

1. A short disclaimer at the top of the recommendations section. It says the list is informational: not a diagnosis, not medical advice, not a medical device. It says the sources were checked by the app owner, not a doctor, and suggests talking to a POZ doctor.
2. Up to three tier groups, most important first:
   - **Tier 1**, "Important — schedule now": `evidence_level` 3.
   - **Tier 2**, "Worth planning": `evidence_level` 2.
   - **Tier 3**, "Talk to your doctor": `evidence_level` 1. It carries a benefits/harms note.

   Within a tier, items are sorted by `burden_weight` (highest first), then by localized name. Empty tiers are not rendered.
3. Each item shows:
   - the localized name;
   - a "how often" line (for example "every 2 years", "every 6 months", "no set interval", "decide with your doctor", "set by the program");
   - NFZ-funded and referral badges;
   - a native `<details>` holding the summary, how to access it, the "why" (the user's age by birth year and the matched rule: sex, age range, conditions), the sources (deduplicated by URL, as external links) and the date it was last reviewed.
4. A "may apply to you — ask your POZ doctor" section, when any exist. It lists active, reviewed entries that no branch matches but at least one branch could match if an uncollected factor were true. Each shows the missing conditions in plain words.
5. An explanatory empty state when no tier has items. With today's catalog this can't happen for a valid profile, so it is a fallback.

The launch gate holds: only `active` entries with a non-null `reviewed_by` are shown, and `npm run catalog:check` rejects an `active` entry without a review stamp. For the smoke fixture (female, born 1970, former smoker, 10 pack-years, quit 5 years ago):

- `mammography-nfz-program` renders in tier 1;
- `psa-shared-decision` is absent;
- `fecal-occult-blood-test` renders in the "may apply" section.

Verify with `npm run smoke` against a local preview, a manual PL/EN walk-through, and the Progress checklist below.

### Key Discoveries:

- The eligibility semantics S-02 must implement, word for word: `src/lib/catalog/factors.ts:6-16` and `catalog/README.md` §Eligibility, §Interval.
- A strict schema means the read must select an explicit column list, not `*` (`src/lib/catalog/schema.ts:187-188`, `strictObject`).
- Throwing in the page falls through to the translated 500 page, the same as `getOnboardingState` does (`src/pages/500.astro:5-6`).
- The smoke runner already understands `bodyIncludes` (`scripts/smoke.mjs:189`). Extending it to arrays and exclusions is small.
- `en.ts` is `Record<MessageKey, string>` (`src/i18n/en.ts:5`), so a missing EN key fails the typecheck. Plurals use `t.plural` with `_one/_few/_many/_other` (`src/i18n/index.ts:47-51`).
- The existing glass style for inner panels is `rounded-lg border border-white/10 bg-white/5`. Use `class:list` for conditional classes in `.astro` files.

## What We're NOT Doing

- **Unit tests** (Vitest or another runner). The owner defers them to the new roadmap foundation F-03 `unit-test-suite`, which Phase 4 adds. Verification in S-02 is smoke checks, pgTAP and manual checks.
- **A POZ doctor's medical sign-off.** The owner's non-medical review stamp is not a medical review. #27 stays open, and the medical-review points in `change.md` stay unresolved.
- **Exam records, due dates or "up to date" status** (S-03/S-05). In S-02, "due" means "eligible now".
- **Collecting new profile factors** (family history, questionnaire flags, BMI and so on; FR-010 is parked). Uncollected factors only feed the "may apply" section.
- **Interval overrides that depend on uncollected factors.** They are skipped, and the base interval is shown without a "may be more frequent if…" hint.
- **A site-wide disclaimer** or changes to `Layout.astro`. The disclaimer sits in the dashboard section only.
- **React islands or client-side evaluation.** The profile never leaves the server.
- **Schema or migration changes to `screening_catalog`.** The only new migration is the generated snapshot carrying the review stamps.
- **Activating the LDCT draft.** It stays `draft` and unreviewed.

## Implementation Approach

The work is server-side and deterministic. A small read module loads the active catalog rows through the user's Supabase client and validates each row with the existing `CatalogEntrySchema`: a row that fails validation is skipped and logged by slug, and a database error throws. A pure `recommend` module takes the entries, the profile and the current year and returns tiered recommendations plus "may apply" entries. It has no I/O, no Supabase and no i18n, so the deferred unit suite (F-03) can test it directly. The dashboard renders the result with `createT(locale)` and turns rules into words with an exhaustive, typed factor-phrase map, so adding a factor without phrases fails the typecheck. Smoke assertions key on `data-slug` and `data-tier` attributes, not on copy.

Phase 1 goes first because the gate filter (`reviewed_by` not null) would otherwise hide every entry.

## Critical Implementation Details

- **Branch evaluation order: false beats unknown.** Evaluate a branch as `no` if any *known* part fails: sex, age, or a condition on a collected factor (including a null profile value). Only if every known part holds and at least one condition is on an uncollected factor is the branch `unknown`. Otherwise it's `match`. Without this rule, the LDCT-style branches for ages 50–54 with occupational exposure would show as "may apply" to never-smokers. An entry is eligible if any branch is `match`. It is "may apply" only if no branch matches and at least one is `unknown`. An eligible entry never appears in "may apply".
- **Interval resolution.** For `fixed`, walk `interval_overrides` in order and use the first one whose `when` evaluates to `match`. An override whose `when` is `unknown` is skipped, not treated as matching. Show whole years when `months % 12 === 0`, otherwise months.
- **Year.** Use `new Date().getFullYear()`, as the profile form does, so age is computed the same way in onboarding and on the dashboard.

## Phase 1: Owner review stamp and gate enforcement

### Overview

Stamp the 19 active entries as reviewed by the owner (non-medical), ship the stamp through a generated snapshot migration, and make the tooling reject any future `active` entry without a stamp. After this phase the gate filter in Phase 2 lets the whole active catalog through.

### Changes Required:

#### 1. Review stamp on active entries

**File**: `catalog/entries/*.json` (the 19 files with `"status": "active"`; not `lung-ldct-nfz-program.json`)

**Intent**: The owner accepts the current sources and data as correct. Record that as a review stamp that is clearly different from a future POZ doctor sign-off, and that publishes no personal name (the catalog is publicly readable).

**Contract**: `reviewed_by: "owner (non-medical review)"`, `last_reviewed: <the stamping date, YYYY-MM-DD>`, `next_review_due: <stamping date + 12 months>`. No other field changes.

#### 2. Schema: active ⇒ reviewed

**File**: `src/lib/catalog/schema.ts`

**Intent**: Enforce the launch gate at the source, so an entry can't become visible to users unreviewed, and an unreviewed active entry never silently disappears from the dashboard.

**Contract**: A `CatalogEntrySchema` refinement: when `status` is `active`, both `reviewed_by` and `last_reviewed` must be non-null. The issue paths are `reviewed_by` and `last_reviewed`, and the message says an active entry needs a review stamp. Update the `reviewed_by` `.describe()` to: "Who signed off the entry: a POZ doctor, or 'owner (non-medical review)' until one does; required for active entries." Regenerate `catalog/entry.schema.json` with `npm run catalog:schema`.

#### 3. Snapshot migration

**File**: `supabase/migrations/<UTC timestamp>_screening_catalog_snapshot.sql` (generated)

**Intent**: Ship the stamps to production through CI `migrate`, the only allowed path for catalog rows.

**Contract**: Generated by `npm run catalog:migration`. Never hand-edited.

#### 4. pgTAP data check

**File**: `supabase/tests/database/screening_catalog.test.sql`

**Intent**: Prove that the shipped data honours the gate: no active entry without a stamp.

**Contract**: Add one assertion in the "Shipped catalog data" block: the count of `status = 'active'` rows (excluding `test-%` slugs) with `reviewed_by is null` or `last_reviewed is null` is 0. Bump `plan(24)` to `plan(25)`.

#### 5. Catalog docs

**File**: `catalog/README.md`

**Intent**: The lifecycle and the review checklist must match the new rule, and must say that the owner's stamp is not medical sign-off.

**Contract**:
- §Lifecycle `active`: requires a review stamp.
- §Entry fields, the `reviewed_by`/`last_reviewed`/`next_review_due` row: who signed off. Until a POZ doctor does, the owner's `"owner (non-medical review)"` label is used; a doctor's later sign-off replaces it.
- Review checklist step 6: set `active` together with the stamp.

#### 6. Change notes

**File**: `context/changes/screening-recommendations/change.md`

**Intent**: Record the owner decision and keep the medical-review points visible for #27.

**Contract**: Append a dated note under `## Notes`. The owner stamped the active entries as a non-medical review, and S-02 renders only stamped entries. The existing medical-review points (Moje Zdrowie evidence level, PSA age range, "powyżej X", colonoscopy 120 months, LDCT 50–54) remain open for the POZ sign-off.

### Success Criteria:

#### Automated Verification:

- Catalog validates and matches the newest snapshot: `npm run catalog:check`
- Published JSON Schema is current: `npm run catalog:schema` leaves `git diff --exit-code catalog/entry.schema.json` clean
- A temporary copy of an active entry with `reviewed_by: null` makes `npm run catalog:check` fail, pointing at `reviewed_by`
- Local database applies the snapshot: `npx supabase db reset`
- pgTAP suites pass, including the new stamp check: `npx supabase test db`
- Lint and type checks pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- A local REST read with the publishable key shows all 19 active entries with `reviewed_by = "owner (non-medical review)"` and the two dates, and the LDCT draft stays hidden
- After merge, CI `migrate` succeeds, and the production REST endpoint returns the stamped entries

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Rule module and tiered dashboard list

### Overview

Implement the eligibility, tier and interval logic as a pure module, read the catalog on the dashboard, and render the tiered list with disclaimer, per-item details and empty state in PL and EN. Extend smoke to assert the list's content.

### Changes Required:

#### 1. Catalog read

**File**: `src/lib/catalog/read.ts` (new)

**Intent**: Load the recommendable catalog through the user's own Supabase client and hand back validated, typed entries. One bad row must not blank the dashboard, and a database outage must not look like "nothing is due".

**Contract**: `getActiveCatalog(supabase: SupabaseClient<Database>): Promise<CatalogEntry[]>`.
- Select an explicit column list matching `CatalogEntrySchema`'s keys, with no timestamps, filtered on `status = 'active'`.
- On a query error, throw, which renders the 500 page.
- Parse each row with `CatalogEntrySchema.safeParse`. On failure, `console.error` the slug and the issue paths (no profile data) and skip the row.

#### 2. Recommendation engine

**File**: `src/lib/catalog/recommend.ts` (new)

**Intent**: The single, pure implementation of the F-01 semantics plus S-02's gate, tiering, sorting and interval resolution. There is no I/O, so the future unit suite (F-03) can test it directly.

**Contract**:
- `type BranchResult = "match" | "unknown" | "no"`
- `evaluateBranch(branch, profile, age)`, following the order in Critical Implementation Details
- `resolveInterval(entry, profile, age): { kind: "months"; months: number } | { kind: "no_known_interval" | "shared_decision" | "per_program" }`
- `recommend(entries, profile, currentYear)` returns `{ tiers: { 1: Recommendation[]; 2: Recommendation[]; 3: Recommendation[] }; maybe: MaybeRecommendation[]; age: number }`, where:
  - `Recommendation = { entry, tier, matchedBranch, interval }`, and `matchedBranch` is the first matching branch in document order;
  - `MaybeRecommendation = { entry, missing: Condition[][] }`, one array per `unknown` branch, holding only that branch's conditions on uncollected factors.
- **Gate:** only entries with `status === "active"` and non-null `reviewed_by` are considered.
- **Tier:** `4 − evidence_level`, so 3→1, 2→2, 1→3.
- **Sort within a tier:** `burden_weight` descending, then `name_pl` or `name_en` by locale. Sorting needs the locale, so either `recommend` takes a `locale` parameter or the page sorts. Pick one and keep `recommend` pure.
- Profile values are read through `FACTORS[factor].column`. Uncollected factors are never read.

#### 3. Rule wording

**File**: `src/lib/catalog/wording.ts` (new)

**Intent**: Turn branches, conditions and intervals into localized phrases, with a typed map that fails the typecheck when a factor has no wording.

**Contract**:
- A map from every `FactorId` to its i18n key(s), declared with `satisfies`, so it's exhaustive over `FACTORS`:
  - **boolean factors:** one key for the `true` phrase, plus a shared negation key for `eq false`;
  - **number factors:** keys per op (`gte`/`lte`/`eq`) with `{value}`;
  - **`smoking_status`:** one key with `{values}`, where values are the existing `SMOKING_STATUS_LABEL_KEYS` labels joined with `Intl.ListFormat` (disjunction for `in`).
- Helpers take `t` and the locale:
  - `describeBranch` gives sex, age range ("45–74", "from 50") and conditions joined with "and";
  - `describeInterval` uses `t.plural` for years and months, plus a phrase per non-fixed kind;
  - `describeMissing` joins conditions with "and" and branches with "or" (`Intl.ListFormat`).
- Phase 2 needs phrases for all factors anyway (exhaustiveness), so Phase 3 only consumes `describeMissing`.

#### 4. Dashboard section

**File**: `src/pages/dashboard.astro` (and optionally `src/components/recommendations/*.astro` if the page gets long)

**Intent**: Replace the placeholder with the disclaimer, the tier groups, the items and the empty state, all server-rendered and accessible.

**Contract**:
- Call `getActiveCatalog` after the onboarding gate, then `recommend(…, new Date().getFullYear())`.
- The section keeps `aria-labelledby="recommendations-heading"`. Each tier is a `<section>` with its own `<h3>` and a list (`<ul>`/`<li>`).
- Each `<li>` carries `data-slug="<slug>"` and `data-tier="<n>"`.
- Details go in a native `<details>`/`<summary>`: summary, how to access, "why" (the user's age by birth year plus `describeBranch(matchedBranch)`), sources (deduplicated by URL, `target="_blank" rel="noopener noreferrer"`, showing title and publisher) and the last-reviewed date formatted with `Intl.DateTimeFormat(locale)`.
- Tier 3 shows a benefits/harms note under its heading.
- The empty state renders when all three tiers are empty.
- The card may widen from `max-w-lg` (for example to `max-w-2xl`) to fit the list.
- Use `class:list` for conditional classes.

#### 5. Translations

**File**: `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: All user-facing copy goes through i18n. The wording is informational and never implies a diagnosis.

**Contract**:
- Replace `dashboard.recommendations.placeholder` with new `dashboard.recommendations.*` keys:
  - the disclaimer;
  - three tier headings: PL "Ważne – umów się teraz" / "Warto zaplanować" / "Porozmawiaj z lekarzem", EN "Important — schedule now" / "Worth planning" / "Talk to your doctor";
  - the tier-3 note;
  - the interval phrases (plural `_one/_few/_many/_other` for years and months, plus the three non-fixed kinds);
  - the NFZ-funded and referral badges;
  - the detail labels (about, how to access, why, sources, reviewed on);
  - the age-by-birth-year phrase (plural);
  - the sex and age-range phrases;
  - the empty state.
- Add the factor phrases for all 17 factors plus the negation key (Polish copy first, since `MessageKey = keyof typeof pl`).

#### 6. Smoke assertions

**File**: `scripts/smoke.mjs`

**Intent**: Prove the dashboard renders real catalog content for a known profile, independent of copy.

**Contract**:
- Let an expectation's `bodyIncludes` be a string or an array (all must be present), and add `bodyExcludes` (a string or array, none may be present). Keep the existing single-string behaviour.
- The step "dashboard renders for onboarded user" expects status 200, `data-slug="mammography-nfz-program" data-tier="1"` (in the attribute order the page emits) and the absence of `data-slug="psa-shared-decision"`.
- Add a short comment: the fixture is 56 in 2026, and mammography covers ages 45–74 until 2044.

### Success Criteria:

#### Automated Verification:

- Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- Worker bundle stays under the Free plan limit with Zod now included: `npx wrangler deploy --dry-run` reports < 3 MiB
- Full smoke passes against a local preview, including the new dashboard body assertions: `npx supabase db reset`, then `npm run build && npm run preview` and `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- As the smoke profile (female, 1970, former smoker 10 pack-years), in PL and EN:
  - tier 1 lists mammography, cervical screening, colonoscopy, blood pressure (yearly, since 56 ≥ 40), Moje Zdrowie (every 3 years, since ≥ 50) and HIV;
  - tier 2 lists the rest of the 12 eligible entries;
  - there's no tier 3;
  - there's no PSA, AAA, osteoporosis, Lp(a) or cognitive screening.
- As a male profile born 1958 who currently smokes: PSA appears in tier 3 with the benefits/harms note, and AAA appears in tier 1.
- Each item's `<details>` opens with Enter/Space, and the "why" line states the user's age by birth year and the matched rule. Source links open in a new tab and the reviewed date shows. A screen reader announces the tier headings.
- The disclaimer is visible above the tiers, and no copy states or implies a diagnosis.
- With local Supabase stopped, `/dashboard` renders the translated 500 page, not an empty list.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: "May apply to you" section

### Overview

Render the entries whose only possible branches depend on uncollected factors. They go below the tiers, with the missing conditions in plain words, so nothing relevant is silently dropped.

### Changes Required:

#### 1. Dashboard section

**File**: `src/pages/dashboard.astro` (or the recommendations component from Phase 2)

**Intent**: Show `recommend(...).maybe` as a separate, clearly conditional section that never reads as "due".

**Contract**:
- A `<section>` with its own heading ("May apply to you — ask your POZ doctor") and a one-line intro. It renders only when `maybe` is non-empty.
- Each `<li>` carries `data-slug="<slug>" data-maybe` and shows the name plus `describeMissing(missing)`, for example "if a first-degree relative had colorectal cancer".
- The same `<details>` shows the summary, how to access and the sources. There is no "how often" line, because the interval may depend on the unknown factor.

#### 2. Translations

**File**: `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: Copy for the section heading, the intro and the "if …" lead-in.

**Contract**: New `dashboard.recommendations.maybe.*` keys. The factor phrases already exist from Phase 2.

#### 3. Smoke assertion

**File**: `scripts/smoke.mjs`

**Intent**: Prove the "may apply" section renders for the fixture.

**Contract**: The dashboard step also expects `data-slug="fecal-occult-blood-test" data-maybe` (stool blood test, 50+, needs `questionnaire_flags_risk`).

### Success Criteria:

#### Automated Verification:

- Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- Full smoke passes against a local preview, including the "may apply" assertion: `npm run build && npm run preview` and `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- As the smoke profile, "may apply" lists the stool blood test and hepatitis C with their questionnaire condition, and none of the tier entries repeat there
- As a profile born 1981 (age 45) who never smoked: colonoscopy appears under "may apply" with the family-history condition, and diabetes screening is in tier 2 (the 45+ branch matches), not under "may apply"
- As a profile born 1996 (age 30): diabetes screening appears under "may apply" with its conditions joined by "or" (BMI ≥ 25, hypertension, …)
- A never-smoker aged 52 does not see LDCT anywhere (it's a draft, and false beats unknown)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Docs sync — F-03 unit-test foundation, PRD and roadmap

### Overview

Record the deferred unit tests as a tracked foundation, reconcile the PRD with the three-tier decision, and update the launch-gate status everywhere it's described.

### Changes Required:

#### 1. Roadmap: F-03 and launch-gate text

**File**: `context/foundation/roadmap.md`

**Intent**: Track unit tests as milestone work (the owner chose a foundation over a parked item), and make Open Question 2 reflect the owner review.

**Contract**:
- Add **F-03** `unit-test-suite` in `## At a glance` (after F-02), in `## Foundations` (all mandatory fields plus `Unlocks`) and in `## Backlog Handoff`:
  - **Outcome:** "(foundation) a unit-test runner (Vitest) runs in CI and covers the catalog eligibility, tier and interval rules (`src/lib/catalog/recommend.ts`, `wording.ts`)";
  - **PRD refs:** FR-004, FR-009, NFR (testing);
  - **Prerequisites:** S-02;
  - **Parallel with:** S-03, F-02;
  - **Unlocks:** safer changes to S-05's recurrence logic;
  - **Status:** `proposed`.
- Optionally list it in `## Streams` under Stream B.
- Update Open Question 2: the active entries carry the owner's non-medical review stamp, S-02 shows only stamped entries, and a POZ doctor's sign-off is still required before public launch.
- Bump `updated:` and `prd_version: 3`.

#### 2. PRD

**File**: `context/foundation/prd.md`

**Intent**: Bring the PRD in line with the decisions made in this plan.

**Contract**:
- FR-004's parenthetical example becomes the three tiers ("important — schedule now / worth planning / talk to your doctor"). The Socrates note gets a one-line resolution update: PSA, a shared decision, is in "talk to your doctor".
- Add a Non-Functional Requirements bullet: the catalog rule logic is covered by unit tests, tracked as roadmap F-03; until then, by smoke and pgTAP.
- Bump `version: 3`.

#### 3. GitHub issues

**File**: none (GitHub)

**Intent**: Keep the issue backlog in line with the roadmap, as for #17–#28.

**Contract**:
- Open a `[F-03] Unit test suite for catalog rules` issue with label `foundation`, milestone "M-01: First screening loop", and a body in the same format as #18. Put its number in the Backlog Handoff notes.
- Comment on #27: the owner's non-medical stamp is in place, the gate is enforced by `catalog:check` and pgTAP, and POZ sign-off is still pending.

### Success Criteria:

#### Automated Verification:

- Docs are formatted: `npx prettier --check context/foundation/roadmap.md context/foundation/prd.md`

#### Manual Verification:

- The roadmap's F-03 row matches its Foundations body (Change ID, Prerequisites, PRD refs, Status), and F-03 appears exactly once in Backlog Handoff with its issue number
- The F-03 GitHub issue exists with the `foundation` label and the M-01 milestone, and #27 has the launch-gate comment

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- None in this change (owner decision), deferred to F-03 `unit-test-suite`. Cases that suite should cover first:
  - inclusive `age_max` and `age_min` bounds;
  - a null `pack_years` treated as false;
  - false beating unknown;
  - `in` on `smoking_status`;
  - the first override that matches, skipping unknown overrides;
  - the tier mapping;
  - sort ties.

### Integration Tests:

- `npm run smoke` (CI `smoke` job) asserts the dashboard body for the fixture: mammography in tier 1, no PSA, and the stool blood test under "may apply".
- pgTAP asserts that every shipped active entry carries a review stamp.

### Manual Testing Steps:

1. Run `npx supabase db reset`, build and preview, then sign up and onboard as the smoke profile. Check the tiers, intervals and "may apply" in PL, switch to EN and check again.
2. Edit the profile to a male born 1958 who currently smokes, and check PSA (tier 3 with the note) and AAA (tier 1).
3. Edit to born 1981, never smoked, and check colonoscopy under "may apply".
4. Walk the list by keyboard only (Tab to each `<summary>`, Enter to open) and with VoiceOver.
5. Stop local Supabase, reload `/dashboard`, and expect the 500 page.

## Performance Considerations

About 20 catalog rows, fetched once per dashboard request alongside the onboarding reads. Evaluation is a few hundred comparisons, well inside the Worker CPU budget. There's no caching: the page is `private, no-store`, and the catalog changes only on deploy. Zod enters the Worker bundle for the first time, so check the size with `wrangler deploy --dry-run` (the Phase 2 criterion).

## Migration Notes

- The only migration is the generated catalog snapshot in Phase 1. It's additive: an upsert of existing slugs with the review fields filled in. It reaches production only through CI `migrate`. A Worker rollback leaves the stamps in place, which is harmless.
- There's no schema change, so no `npm run db:types`.

## References

- Research: `context/changes/screening-recommendations/research.md`
- Owner-decision notes: `context/changes/screening-recommendations/change.md`
- Catalog semantics: `src/lib/catalog/factors.ts:6-16`, `catalog/README.md`
- Catalog schema: `src/lib/catalog/schema.ts:187`
- F-01 plan (archived): `context/archive/2026-09-28-screening-catalog-v1/plan.md`
- Dashboard: `src/pages/dashboard.astro:17-50`
- Smoke runner: `scripts/smoke.mjs:18-26`, `:128`, `:183-197`
- Roadmap S-02 and Open Question 2: `context/foundation/roadmap.md`
- Tier rule origin: `context/foundation/screening-catalog-research.md:80-86`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Owner review stamp and gate enforcement

#### Automated

- [x] 1.1 Catalog validates and matches the newest snapshot: `npm run catalog:check` — b488b11
- [x] 1.2 Published JSON Schema is current: `npm run catalog:schema` leaves `git diff --exit-code catalog/entry.schema.json` clean — b488b11
- [x] 1.3 A temporary copy of an active entry with `reviewed_by: null` makes `npm run catalog:check` fail, pointing at `reviewed_by` — b488b11
- [x] 1.4 Local database applies the snapshot: `npx supabase db reset` — b488b11
- [x] 1.5 pgTAP suites pass, including the new stamp check: `npx supabase test db` — b488b11
- [x] 1.6 Lint and type checks pass: `npm run lint` and `npx astro check` — b488b11

#### Manual

- [x] 1.7 A local REST read with the publishable key shows all 19 active entries with `reviewed_by = "owner (non-medical review)"` and the two dates, and the LDCT draft stays hidden — b488b11
- [ ] 1.8 After merge, CI `migrate` succeeds, and the production REST endpoint returns the stamped entries

### Phase 2: Rule module and tiered dashboard list

#### Automated

- [x] 2.1 Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- [x] 2.2 Worker bundle stays under the Free plan limit with Zod now included: `npx wrangler deploy --dry-run` reports < 3 MiB
- [x] 2.3 Full smoke passes against a local preview, including the new dashboard body assertions

#### Manual

- [x] 2.4 Smoke profile in PL and EN shows the expected tier 1 and tier 2 entries and none of the ineligible ones
- [x] 2.5 Male 1958 current smoker sees PSA in tier 3 with the benefits/harms note and AAA in tier 1
- [x] 2.6 Item details open by keyboard, the "why" line states age by birth year and the matched rule, and sources and reviewed date show
- [x] 2.7 Disclaimer is visible above the tiers and no copy states or implies a diagnosis
- [x] 2.8 With local Supabase stopped, `/dashboard` renders the translated 500 page

### Phase 3: "May apply to you" section

#### Automated

- [ ] 3.1 Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- [ ] 3.2 Full smoke passes against a local preview, including the "may apply" assertion

#### Manual

- [ ] 3.3 Smoke profile sees the stool blood test and hepatitis C under "may apply", with no tier entries repeated there
- [ ] 3.4 A profile born 1981 who never smoked sees colonoscopy under "may apply" and diabetes screening in tier 2
- [ ] 3.5 A profile born 1996 sees diabetes screening under "may apply" with its conditions joined by "or"
- [ ] 3.6 A never-smoker aged 52 does not see LDCT anywhere

### Phase 4: Docs sync — F-03 unit-test foundation, PRD and roadmap

#### Automated

- [ ] 4.1 Docs are formatted: `npx prettier --check context/foundation/roadmap.md context/foundation/prd.md`

#### Manual

- [ ] 4.2 Roadmap F-03 row matches its Foundations body and appears once in Backlog Handoff with its issue number
- [ ] 4.3 F-03 GitHub issue exists with the `foundation` label and M-01 milestone, and #27 has the launch-gate comment
