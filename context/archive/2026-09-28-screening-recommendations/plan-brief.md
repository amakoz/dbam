# Screening Recommendations (S-02) — Plan Brief

> Full plan: `context/changes/screening-recommendations/plan.md`
> Research: `context/changes/screening-recommendations/research.md`

## What & Why

The dashboard gets the product's north star: the screenings due for the signed-in user's profile, grouped by importance tier, each with how often it repeats and the rule and sources behind it. Without this list, nothing in milestone M-01 delivers the product's promise. Every later slice (appointments, reminders, recurrence) builds on it.

## Starting Point

- **Dashboard:** `src/pages/dashboard.astro` loads the profile server-side and shows a placeholder where the recommendations go.
- **Catalog:** F-01 shipped `public.screening_catalog`, with 19 active entries, typed eligibility branches and fixed rule semantics (`src/lib/catalog/factors.ts:6-16`). No entry has a review stamp yet, there's no rule engine, and there's no unit-test runner.

## Desired End State

An onboarded user sees, in Polish or English:

- a short "informational only" disclaimer;
- up to three tiers ("Important — schedule now", "Worth planning", "Talk to your doctor"), each item showing "how often", NFZ and referral badges, and an expandable "why" with the matched rule and source links;
- a separate "may apply to you — ask your POZ doctor" section for entries that depend on facts the profile doesn't collect.

Only owner-stamped active entries are shown, and the catalog tooling refuses an active entry without a stamp.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Catalog storage, rule shape, PL/EN text | F-01 table, typed branches, text columns | Already built and shipped by F-01. | Research / F-01 |
| Launch gate | Owner stamps the 19 active entries `"owner (non-medical review)"`, next review in 12 months; S-02 shows only stamped entries | No doctor is available yet; the stamp is honest, publishes no personal name, and a later POZ sign-off replaces it. | Plan |
| Gate enforcement | `catalog:check` rejects active ⇒ unstamped; pgTAP asserts it on shipped data | An unstamped active entry would otherwise silently disappear from the dashboard. | Plan |
| Tiers | 3 tiers from `evidence_level` (3→1, 2→2, 1→3); PSA lands in "talk to your doctor" | Follows the catalog rubric; the PRD FR-004 example is updated to match. | Plan (research rule) |
| Sorting | `burden_weight` descending, then localized name | Research tie-breaker; before S-05 there's no due status to sort by. | Plan |
| Unknown-only entries | Separate "may apply" section with the missing conditions in plain words | Nothing relevant is silently dropped, and the tiers stay honest. | Plan |
| False vs unknown | A failed known condition makes a branch `no`, even if another condition is unknown | Otherwise never-smokers would see "may apply" LDCT branches. | Plan (F-01 semantics) |
| Interval display | Show "how often" now; the first known-matching override wins; unknown overrides are skipped | Delivers the informational "and when", and S-05 reuses it. | Plan |
| Item layout | Native `<details>` per item, server-rendered, no JS | Accessible by keyboard and screen reader, keeps the list scannable, and the profile stays server-side. | Plan |
| Disclaimer | Dashboard recommendations section only | Sits where recommendations are read; the layout stays untouched. | Plan |
| Errors | A DB error throws (500 page); an invalid row is skipped and logged by slug | An outage must not look like "nothing due", and one bad row must not blank the list. | Plan |
| Tests | Smoke body assertions + pgTAP now; unit tests become roadmap foundation F-03 | Owner decision: unit tests come later, as tracked milestone work. | Plan |

## Scope

**In scope:**
- review stamp and gate enforcement
- the pure `recommend` engine
- catalog read with row validation
- rule and interval wording in PL and EN
- the tiered list, "may apply" section, disclaimer and empty state
- smoke assertions
- roadmap F-03 + PRD sync + GitHub issues

**Out of scope:**
- unit tests (F-03)
- POZ medical sign-off (#27 stays open)
- exam records and due status (S-03/S-05)
- new profile factors (FR-010)
- hints for overrides that depend on uncollected factors
- a site-wide disclaimer
- client-side evaluation
- catalog schema changes

## Architecture / Approach

`dashboard.astro` → `getActiveCatalog(supabase)` (`src/lib/catalog/read.ts`: explicit columns, `status = active`, Zod-validated rows) → `recommend(entries, profile, currentYear)` (`src/lib/catalog/recommend.ts`: pure; gate, branch evaluation match/unknown/no, tier, interval, sort) → rendered with `createT(locale)` and `src/lib/catalog/wording.ts` (an exhaustive, typed factor-phrase map). Smoke asserts on `data-slug`/`data-tier`/`data-maybe` attributes, not on copy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Owner review stamp and gate | Stamped active entries shipped by snapshot; `catalog:check` + pgTAP enforce active ⇒ stamped | The stamp could be mistaken for medical sign-off (mitigated by the label, README and #27) |
| 2. Rule module and tiered list | Engine, catalog read, wording, dashboard tiers with details, disclaimer, empty state, smoke body checks | Zod entering the Worker bundle (size check); getting false-vs-unknown right without unit tests |
| 3. "May apply" section | Conditional entries with missing conditions in plain words, plus a smoke check | Copy that reads as "you have a risk" (keep it conditional and informational) |
| 4. Docs sync | Roadmap F-03, PRD FR-004 + NFR note (v3), F-03 issue, #27 comment | Roadmap structure edited by hand rather than via `/10x-roadmap` |

**Prerequisites:** F-01 and S-01 done (both are). Local Supabase for `db reset`/`test db`/smoke.
**Estimated effort:** ~3–4 sessions across 4 phases. Phase 2 is the largest.

## Open Risks & Assumptions

- The owner accepts the catalog data as correct without a doctor. The five medical-review points in `change.md` stay open, and public launch still needs POZ sign-off (#27).
- Without unit tests, the branch-evaluation edge cases rely on manual profiles (Phase 2/3 checklists) until F-03 lands.
- The smoke fixture's age drifts yearly; mammography (45–74) keeps the assertion valid until 2044.

## Success Criteria (Summary)

- An onboarded user sees their eligible, stamped screenings in three tiers, with "how often", badges and an expandable rule and sources, in PL and EN, with no diagnostic wording.
- Entries that depend on uncollected facts appear only under "may apply", with the missing condition spelled out.
- CI smoke proves the fixture's list content, and `catalog:check` plus pgTAP keep unstamped entries out of production.
