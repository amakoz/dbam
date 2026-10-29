# English "screening" vs "exam" copy — Plan Brief

> Full plan: `context/changes/en-copy-terms/plan.md`
> Research: `context/changes/en-copy-terms/research.md`

## What & Why

English copy mixes "screening", "exam" and "test". The owner's rule (roadmap S-11, PRD MS-05, backlog B-16): "screening" is the catalog item, the same for everyone, and "exam" is the user's own planned or done one. Polish copy stays as it is.

## Starting Point

All English UI copy is in `src/i18n/en.ts`. 15 keys break the rule: six say "test"/"exam" for a catalog item, and nine say "screening" for the user's own exam. Two of them are versioned consent text. One test (`due-screening.test.ts`) pins an affected email. The glossary already states the rule, but one row calls undecided tier items "open exams".

## Desired End State

An English-language user reads "screening" for catalog items (tiers, details, "may apply", plans empty state, consent purpose, errors) and "exam" for their own (status line, done rows, undo, consent data, withdrawal text, due-again email). No English message says "test". A unit test keeps the rule from drifting back.

## Key Decisions Made

| Decision                                  | Choice                                                          | Why (1 sentence)                                                                                    | Source          |
| ----------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------- |
| Which keys change                         | The 15 keys in the research table                               | Classified by where each key renders: tier rows are catalog items, plans/done/emails are the user's | Research        |
| "Plan this screening" (B-16 cites `:132`) | Keep                                                            | It renders on a tier row, before any plan exists                                                    | Research        |
| Due-again email                           | Reword to "exam(s)"; update `due-screening.test.ts`             | Its items are the user's done exams due again                                                       | Orchestrator    |
| Catalog JSON English text                 | Out of scope, no follow-up                                      | "test"/"examination" there are procedure names; no misuse found                                     | Orchestrator    |
| Glossary "open exams" row                 | Rename to "open screenings"                                     | Matches the UI and the rule                                                                         | Orchestrator    |
| Consent version                           | Bump to `2026-10-29`                                            | `consent.ts` requires a bump on any `onboarding.consent.*` change; existing consents stay valid     | Research / Plan |
| Regression guard                          | New `src/i18n/terms.test.ts`: per-key term check + no "test(s)" | Checks the rule, not the wording                                                                    | Plan            |
| Phases                                    | One                                                             | Copy, version and tests must change together to keep the suite green                                | Plan            |

## Scope

**In scope:**

- 15 values in `src/i18n/en.ts` (all plural suffixes)
- `HEALTH_DATA_CONSENT_VERSION` bump
- `due-screening.test.ts` English expectation
- new `src/i18n/terms.test.ts`
- glossary row rename

**Out of scope:**

- `src/i18n/pl.ts`
- `catalog/entries/*.json`
- code identifiers and comments
- e2e/smoke (they pin no affected string)
- roadmap status

## Architecture / Approach

Copy-only change through the existing dictionary. Emails render from the same keys, so the reminder transcript test catches email drift. The new test lists the catalog-item keys and the user's-own keys as typed `MessageKey` arrays and asserts the term in each English value.

## Phases at a Glance

| Phase                                                | What it delivers                                              | Key risk                                               |
| ---------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| 1. English copy, consent version, tests and glossary | Rule applied across `en.ts`, consent bumped, guard test added | Missing a plural suffix or forgetting the consent bump |

**Prerequisites:** none (no DB lock needed; no schema change).
**Estimated effort:** one short session.

## Open Risks & Assumptions

- A consent form loaded before the deploy and submitted after it is refused with "consent text has been updated", which is the intended behaviour.
- If another consent text change lands on `main` the same day, the version becomes `2026-10-29.1`.

## Success Criteria (Summary)

- English users see "screening" for catalog items and "exam" for their own on every page and in the due-again email.
- `npm test`, lint, `astro check` and build pass; `pl.ts` is unchanged.
- PR manual check after deploy: the English home page and dashboard read correctly, and a new consent row records version `2026-10-29`.
