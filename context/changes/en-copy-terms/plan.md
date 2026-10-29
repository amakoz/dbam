# English "screening" vs "exam" copy Implementation Plan

## Overview

Reword 15 keys in `src/i18n/en.ts` so that English copy says "screening" for a catalog item and "exam" for the user's own planned or done one (roadmap S-11, PRD MS-05, backlog B-16). Polish copy stays as it is. The same change bumps the consent version (two of the keys are consent text), updates the one test that pins affected copy, adds a unit test that guards the rule, and renames one glossary row.

## Current State Analysis

- All UI copy is in `src/i18n/en.ts`, typed against the Polish keys (`src/i18n/en.ts:3-5`). No user-facing English string lives outside it (`research.md` Summary).
- 15 keys break the rule: six use "test"/"exam" for a catalog item, and nine use "screening" for the user's own exam (`research.md`, "Keys that break the rule").
- `onboarding.consent.data` and `onboarding.consent.purpose` are versioned consent text. `src/lib/consent.ts:6-11` requires a `HEALTH_DATA_CONSENT_VERSION` bump on any `onboarding.consent.*` change in `en.ts`. Existing consents stay valid because `hasActiveConsent` ignores the version (`src/lib/consent.ts:17-25`).
- `src/lib/reminders/due-screening.test.ts:294,298` pins the English due-again email subject and `_other` body. No other test, e2e step or smoke check pins an affected string: e2e runs in Polish, and smoke checks markup only (`research.md`, "Tests and suites").
- `context/domain/glossary.md:63` names tier items without a decision "open exams", while the UI calls them "screenings awaiting your decision" (`en.ts:39-42`).

## Desired End State

An English-language user reads "screening" wherever the app talks about a catalog item: the home page, tiers, details, the "may apply" block, the plans empty state, consent purpose and errors. They read "exam" wherever it talks about their own planned or done item: the status line, done rows, the undo confirmation, consent data, the withdrawal text and the due-again email. No English message uses "test". A unit test fails if any of the 15 keys drifts back. Polish messages are byte-identical to `main`.

### Key Discoveries:

- Plural sets (`dashboard.status.plans_*`, `email.dueScreeningReminder.body_*`) need all four suffixes changed (`src/i18n/en.ts:3-4`).
- `dashboard.screenings.plan.legend` "Plan this screening" (`en.ts:132`, cited by B-16) is correct: it renders on a tier row (`src/components/recommendations/ScreeningActions.astro:77`). It stays.
- `dashboard.screenings.unavailable.*` keeps "exam", as decided in S-10 (`context/archive/2026-10-28-missing-entry-plan/decisions.md:22,38`).

## What We're NOT Doing

- No change to `catalog/entries/*.json`. Their "test"/"examination" words are medical procedure names, research found no misuse, and no follow-up is opened (`decisions.md`, "Catalog JSON English text").
- No change to `src/i18n/pl.ts`, code identifiers (`screening_*`), routes, the database or the e2e/smoke suites.
- No change to code comments that say "exam".
- No roadmap status change (worker protocol; `/10x-archive` sets `done`).

## Implementation Approach

One phase. The copy, the consent version bump, the pinned email test and the new guard test all change together. Splitting them would leave a red test suite or consent text out of step with its version between commits.

## Phase 1: English copy, consent version, tests and glossary

### Overview

Reword the 15 keys, bump the consent version, update the pinned email test, add the term-rule test, and rename the glossary row.

### Changes Required:

#### 1. English dictionary

**File**: `src/i18n/en.ts`

**Intent**: Apply the term rule to the 15 keys in the research table, using the proposed English there as the target wording. Values only; no key is added or removed.

**Contract**: These keys change, with "screening" (S) or "exam" (E) as the required term:

- E: `home.features.track.description` → "Save the appointment date or mark an exam as done — it comes back to the list when it is due again."
- E: `dashboard.status.plans_one` "{count} planned exam"; `_few`/`_many`/`_other` "{count} planned exams"
- S: `dashboard.recommendations.tier.3.note` → "These screenings have possible benefits as well as possible harms. It's worth deciding whether to have them together with your doctor."
- S: `dashboard.recommendations.details.about` → "About the screening"
- S: `dashboard.recommendations.factor.questionnaire_flags_risk` → "the program's health questionnaire (e.g. Moje Zdrowie) points you to this screening"
- S: `dashboard.recommendations.maybe.intro` → "These screenings depend on details we don't ask about. If the condition next to a screening applies to you, ask your POZ (primary care) doctor about it."
- S: `dashboard.screenings.plans.empty` → "Nothing planned yet. Choose “Plan or mark done” on a screening to add it here."
- E: `dashboard.screenings.done.noInterval` → "This exam has no set interval — talk to your doctor about when to repeat it."
- E: `dashboard.screenings.saved.undone` → "The exam is no longer marked as done."
- E: `onboarding.consent.data` → "…and — if you add them — the exams you plan (with appointment dates) and the ones you mark as done (with the month of the last exam)."
- S: `onboarding.consent.purpose` → "Only to show which screenings you're eligible for and when. …" (rest unchanged)
- E: `profile.withdraw.deleted` → "…your planned exams with their appointment dates, and the exams you marked as done. …" (rest unchanged)
- E: `email.dueScreeningReminder.subject` → "Dbam: time to repeat a preventive exam"
- E: `email.dueScreeningReminder.body_one` → "The recommended interval since one of your preventive exams has passed. It's time to repeat it."; `_few`/`_many`/`_other` → "The recommended interval since {count} of your preventive exams has passed. It's time to repeat them."
- S: `errors.screening_not_available` → "This screening isn't on your recommendations list right now. Refresh the page and try again."

#### 2. Consent version

**File**: `src/lib/consent.ts`

**Intent**: The English consent text changes, so new consent rows must record a new version as proof of what the user agreed to.

**Contract**: `HEALTH_DATA_CONSENT_VERSION = "2026-10-29"` (use `.1` only if another consent change landed on `main` the same day). The comment and `consent.test.ts` stay unchanged.

#### 3. Pinned due-again email test

**File**: `src/lib/reminders/due-screening.test.ts`

**Intent**: Bring the pinned English subject and body (`:294,298`) in line with the new copy.

**Contract**: The transcript expectation for the `en` recipient matches the new `email.dueScreeningReminder.subject` and `body_other`. The Polish expectations stay unchanged.

#### 4. Term-rule guard test

**File**: `src/i18n/terms.test.ts` (new)

**Intent**: Fail when an English message drifts back to the wrong term. The test checks the rule, not the exact wording.

**Contract**: Uses `createT("en")` (or the `en` record) and covers three cases:

- each catalog-item key above (S) contains `screening` and does not match `/\bexams?\b/i`;
- each user's-own key above (E, every plural suffix) matches `/\bexams?\b/i` and does not contain `screening`;
- no value in the English dictionary matches `/\btests?\b/i`.

Keys are listed in two `as const` arrays typed as `MessageKey`, so a renamed key fails the type check.

#### 5. Glossary row

**File**: `context/domain/glossary.md`

**Intent**: Rename the row at `:63` from "open exams" to "open screenings", so the glossary matches the UI and the rule.

**Contract**: First column becomes `open screenings — PL **czeka na Twoją decyzję**`. The definition reads "Screenings still in a tier, with no plan or current done record." Code term and "avoid" columns stay unchanged.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new `src/i18n/terms.test.ts` and the updated `due-screening.test.ts`: `npm test`
- Lint passes: `npm run lint`
- Type and template check passes: `npx astro check`
- `src/i18n/pl.ts` is unchanged: `git diff --quiet origin/main -- src/i18n/pl.ts`
- No English message uses "test": covered by `terms.test.ts`, and `grep -nE '\btests?\b' src/i18n/en.ts` returns nothing
- Build succeeds: `npm run build`

#### Manual Verification:

- With `lang=en` on a local dev server (`npx astro dev --host 127.0.0.1 --port $DBAM_PORT`), the home page, onboarding consent step, dashboard (tiers, details, "may apply" block, plans, done rows, undo confirmation) and profile withdrawal text read "screening" for catalog items and "exam" for the user's own

**Implementation Note**: Production checks go to the PR's Manual checks list, not to this phase: after deploy, read the English home page and a signed-in English dashboard (read-only), and confirm a new consent row records version `2026-10-29`.

---

## Testing Strategy

### Unit Tests:

- `src/i18n/terms.test.ts`: per-key term rule for the 15 keys (all plural suffixes), plus no "test(s)" anywhere in English.
- `src/lib/reminders/due-screening.test.ts`: the English due-again transcript with the new subject and body.
- Existing `consent.test.ts` checks the new version's format.

### Integration Tests:

- None new. The e2e suite (Polish UI) and smoke (markup only) pin no affected string and stay unchanged.

### Manual Testing Steps:

1. Start the local dev server, set the language switcher to English, and sign up a local user.
2. Read the consent step: "the exams you plan", "which screenings you're eligible for".
3. On the dashboard, open a tier-3 note, the details ("About the screening") and the "may apply" block. Check the plans empty state.
4. Plan one item, mark another as done and undo it: check the status line ("planned exam") and the undo confirmation ("The exam is no longer marked as done.").
5. On the profile page, read the withdrawal text ("your planned exams…").

## Migration Notes

No schema change. The consent version bump affects only new consent rows. A consent form loaded before the deploy and submitted after it is refused with `errors.consent_outdated` (`src/pages/api/consent/grant.ts:18`), which is the intended behaviour.

## References

- Research: `context/changes/en-copy-terms/research.md`
- Decisions: `context/changes/en-copy-terms/decisions.md`
- Term rule: `context/domain/glossary.md:17,51,96`
- Consent version rule: `src/lib/consent.ts:6-11`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: English copy, consent version, tests and glossary

#### Automated

- [ ] 1.1 Unit tests pass, including the new `src/i18n/terms.test.ts` and the updated `due-screening.test.ts`: `npm test`
- [ ] 1.2 Lint passes: `npm run lint`
- [ ] 1.3 Type and template check passes: `npx astro check`
- [ ] 1.4 `src/i18n/pl.ts` is unchanged: `git diff --quiet origin/main -- src/i18n/pl.ts`
- [ ] 1.5 No English message uses "test": covered by `terms.test.ts`, and `grep -nE '\btests?\b' src/i18n/en.ts` returns nothing
- [ ] 1.6 Build succeeds: `npm run build`

#### Manual

- [ ] 1.7 With `lang=en` on a local dev server, home, onboarding consent, dashboard and profile withdrawal read "screening" for catalog items and "exam" for the user's own
