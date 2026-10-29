---
date: 2026-10-29T18:45:21+0100
researcher: Claude (worker, en-copy-terms)
git_commit: 0788d1a
branch: feat/en-copy-terms
repository: 10xdevs (Dbam)
topic: "Which English strings break the 'screening' (catalog item) vs 'exam' (user's own) rule, and what else changes with them"
tags: [research, i18n, en-copy, consent, reminders, wording-tests]
status: complete
last_updated: 2026-10-29
last_updated_by: Claude (worker, en-copy-terms)
---

# Research: EN copy, "screening" vs "exam"

**Date**: 2026-10-29T18:45:21+0100
**Researcher**: Claude (worker, en-copy-terms)
**Git Commit**: 0788d1a
**Branch**: feat/en-copy-terms
**Repository**: 10xdevs (Dbam)

## Research Question

Roadmap S-11 / PRD MS-05 / backlog B-16: an English-language user should read "screening" for a catalog item and "exam" for their own planned or done one, everywhere in the app, with Polish copy unchanged. Which strings break the rule, and which tests, suites or versioned texts change with them?

## Summary

- All UI copy is in `src/i18n/en.ts` (374 lines). A sweep of `src/components` and `src/pages` for literal English found no user-facing string outside the dictionary; the hits were code comments and the dev-only kitchen-sink title (`src/pages/dev/kitchen-sink.astro:271`).
- 15 keys break the rule (table below). There are two kinds: "test"/"exam" used for a catalog item (6 keys, including both lines the backlog cites, `en.ts:76,128`), and "screening" used for the user's own planned or done item (9 keys, 6 of them in plural sets).
- **Consent text is versioned.** Two of the keys are `onboarding.consent.data` and `onboarding.consent.purpose`. `src/lib/consent.ts:6-11` says to bump `HEALTH_DATA_CONSENT_VERSION` whenever `onboarding.consent.*` in `pl.ts` **or** `en.ts` changes. The bump is cheap: `hasActiveConsent` does not filter by version (`src/lib/consent.ts:17-25`), so existing consents stay valid. Only a consent form loaded before the deploy and submitted after it is refused (`src/pages/api/consent/grant.ts:18`, which then shows `errors.consent_outdated`).
- **Wording tests in `src/lib/catalog` and `src/lib/screenings` pin no affected string.** Their EN expectations (`src/lib/catalog/wording.test.ts:50-120`, `src/lib/screenings/format.test.ts:65-105`) cover factors, rules, intervals and dates. None of those uses screening/exam/test.
- **A test outside the two named modules does pin an affected string:** `src/lib/reminders/due-screening.test.ts:294,298` pins the EN due-again email subject and body ("preventive screening(s)"). It changes only if the due-again email is reworded (open question 1).
- **The e2e and smoke suites pin no EN copy.** e2e drives the Polish UI (`tests/e2e/support/core-loop.ts:21-139`; no `lang` cookie is set in `tests/e2e`). Smoke asserts only data attributes and markup (`scripts/smoke.mjs:123-380`, `bodyIncludes`/`bodyExcludes`). `ui:shots` forces `lang=pl` (`scripts/ui-shots.mjs:234`).
- The rule is already in the glossary: `context/domain/glossary.md:17` (screening = catalog item; avoid "exam"/"test" for it) and `:51` (exam = the user's handling of one screening). One glossary row reads "open exams" (`:63`) for tier items without a plan or done record. That clashes with keeping "screening" for those items (open question 3).
- Catalog content (`catalog/entries/*.json`, `name_en`/`summary_en`/`how_to_access_en`) uses "test" and "examination" as medical procedure names ("HIV screening test", "Eye examination for glaucoma", "A blood test…"). Changing it would need `npm run catalog:migration`. Recommended out of scope (open question 2).

## Detailed Findings

### Keys that break the rule (`src/i18n/en.ts`)

Where a key renders decides which term applies: tier rows are catalog items, while "Your plans", "Done", their confirmations and the reminder emails are the user's own exams.

| #   | Key (`en.ts` line)                                                 | Current EN                                                                         | Renders on                                                                                          | Should say             | Proposed EN                                                                                                     |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | `home.features.track.description` (:30)                            | "…or mark a screening as done — it comes back…"                                    | home page (`src/pages/index.astro:31`), about the user's action                                     | exam                   | "Save the appointment date or mark an exam as done — it comes back to the list when it is due again."           |
| 2   | `dashboard.status.plans_{one,few,many,other}` (:35-38)             | "{count} planned screening(s)"                                                     | dashboard status line (`src/pages/dashboard.astro:148`)                                             | exam                   | "{count} planned exam" / "{count} planned exams"                                                                |
| 3   | `dashboard.recommendations.tier.3.note` (:56)                      | "These tests have possible benefits…"                                              | tier 3 section (`src/components/recommendations/TierSection.astro:44`)                              | screening              | "These screenings have possible benefits…"                                                                      |
| 4   | `dashboard.recommendations.details.about` (:76) — backlog-cited    | "About the test"                                                                   | entry details (`src/components/recommendations/EntryDetails.astro:34`)                              | screening              | "About the screening"                                                                                           |
| 5   | `dashboard.recommendations.factor.questionnaire_flags_risk` (:121) | "…points you to this test"                                                         | "why"/"maybe" condition wording                                                                     | screening              | "…points you to this screening"                                                                                 |
| 6   | `dashboard.recommendations.maybe.intro` (:124)                     | "These tests depend on… next to a test…"                                           | "May apply to you" block (`src/pages/dashboard.astro:285`)                                          | screening              | "These screenings depend on details we don't ask about. If the condition next to a screening applies to you, …" |
| 7   | `dashboard.screenings.plans.empty` (:128) — backlog-cited          | "Choose “Plan or mark done” on an exam to add it here."                            | empty "Your plans"; the action sits on a tier row                                                   | screening              | "…on a screening to add it here."                                                                               |
| 8   | `dashboard.screenings.done.noInterval` (:157)                      | "This screening has no set interval…"                                              | done row (`src/components/recommendations/DoneItem.astro:52`)                                       | exam                   | "This exam has no set interval — talk to your doctor about when to repeat it."                                  |
| 9   | `dashboard.screenings.saved.undone` (:165)                         | "The screening is no longer marked as done."                                       | confirmation after undoing the user's done record                                                   | exam                   | "The exam is no longer marked as done."                                                                         |
| 10  | `onboarding.consent.data` (:176) — **versioned**                   | "…the screenings you plan (with appointment dates) and the ones you mark as done…" | consent step                                                                                        | exam                   | "…the exams you plan (with appointment dates) and the ones you mark as done (with the month of the last exam)." |
| 11  | `onboarding.consent.purpose` (:179) — **versioned**                | "…which screening tests you're eligible for…"                                      | consent step                                                                                        | screening              | "…which screenings you're eligible for…"                                                                        |
| 12  | `profile.withdraw.deleted` (:200)                                  | "…your planned screenings… and the screenings you marked as done."                 | profile → withdrawal                                                                                | exam                   | "…your planned exams with their appointment dates, and the exams you marked as done."                           |
| 13  | `email.dueScreeningReminder.subject` (:309)                        | "Dbam: time for a preventive screening"                                            | due-again email (items are done exams due again, glossary `:60,72`)                                 | exam (open question 1) | "Dbam: time to repeat a preventive exam"                                                                        |
| 14  | `email.dueScreeningReminder.body_{one,few,many,other}` (:311-318)  | "…since one of your preventive screenings has passed…"                             | due-again email                                                                                     | exam (open question 1) | "…since one of your preventive exams…" / "…since {count} of your preventive exams…"                             |
| 15  | `errors.screening_not_available` (:363-364)                        | "This exam isn't on your recommendations list right now."                          | error after plan/done/confirm on an entry that is not active (`src/pages/api/screenings.ts:88,132`) | screening              | "This screening isn't on your recommendations list right now. Refresh the page and try again."                  |

Keys 2 and 14 are plural sets, so all four suffixes (`_one`, `_few`, `_many`, `_other`) change together. `en.ts:3-4` requires every Polish suffix to exist in English.

### Keys that already follow the rule (checked, keep)

- Catalog item = "screening": `home.title`, `home.subtitle`, `home.features.profile.description`, `home.features.tiers.description`, `home.note`, `dashboard.status.open_*` (tier items still awaiting a decision), `dashboard.recommendations.disclaimer`, `.empty`, `dashboard.screenings.plan.legend` "Plan this screening" (shown on a tier row before any plan, `src/components/recommendations/ScreeningActions.astro:77`), `onboarding.consent.intro`, `.voluntary`, `.checkbox`, `onboarding.profile.intro`, `profile.intro`, `profile.form.sexHint` (`en.ts:19-32,39-42,51,58,132,173,185,187,191,195,220`).
- User's own = "exam": `dashboard.screenings.unavailable.name`/`.note` (the missing-entry row is the user's plan or done record; S-10 chose this wording, `context/archive/2026-10-28-missing-entry-plan/decisions.md:22,38`), `confirm.prompt`, `done.monthLabel`, `profile.reminders.disclosure`, `email.followUpNudge.*`, `errors.invalid_done_date`, `errors.appointment_not_passed` (`en.ts:139-140,144,147,207,323-332,361-367`).
- The comments at `en.ts:298,308,322` ("Never name an exam") are code comments, not copy, so they need no change.

### Versioned consent text

- `src/lib/consent.ts:6-11`: bump on any `onboarding.consent.*` change in `pl.ts` or `en.ts`. Format: the change date, with `.N` for a second change on the same day. The database check `health_data_consents_version_format` refuses any other shape. The current value is `"2026-09-30"`.
- `src/lib/consent.test.ts:11-17` checks only the format, so a bump to e.g. `"2026-10-29"` (or the merge date) needs no test change.
- Effect: new consent rows record the new version. Existing active consents pass because `hasActiveConsent` filters only on `withdrawn_at` (`src/lib/consent.ts:17-25`), so no user is asked to consent again.

### Tests and suites

- `src/lib/catalog/wording.test.ts`: EN cases for `describeCondition`, `describeBranch`, `describeInterval` and `describeMissing` (`:50-120`). None of the cases contain an affected key's text. `questionnaire_flags_risk` (row 5) appears in no test under `src/lib/catalog` or `src/lib/screenings` (grep).
- `src/lib/screenings/format.test.ts:65-105`: EN month and date names only. `due.test.ts:28` and `rules.test.ts:46` use `name_en: "Exam"` as a fixture value, not copy.
- `src/lib/reminders/due-screening.test.ts:294,298`: pins the EN due-again subject and the `_other` body. It changes with rows 13–14.
- `src/lib/reminders/nudge-message.test.ts:58-61,75,93-97` and `follow-up-nudge.test.ts:240,246`: pin "planned exam(s)" and the disclosure thresholds. These keys already comply and stay unchanged.
- e2e: Polish UI only (`tests/e2e/support/core-loop.ts`). Smoke: data attributes only (`scripts/smoke.mjs:388-401` defines the matcher). Neither suite changes.

## Code References

- `src/i18n/en.ts:30,35-38,56,76,121,124,128,157,165,176,179,200,309-318,363-364` — the 15 keys to change
- `src/i18n/en.ts:3-5` — typed against Polish keys; all plural suffixes required
- `src/lib/consent.ts:6-11` — consent version and bump rule
- `src/lib/consent.ts:17-25` — `hasActiveConsent` ignores the version
- `src/pages/api/consent/grant.ts:18` — refuses a stale form version
- `src/lib/reminders/due-screening.test.ts:294,298` — pinned EN due-again email
- `context/domain/glossary.md:17,51,63,96` — screening/exam rule, "open exams" row, the "badanie" disambiguation

## Architecture Insights

- Copy and code terms are separate: identifiers stay `screening_*` for both concepts (glossary `:51` notes that "exam" is missing as a code identity). This change touches only EN copy, so no identifier or Polish string moves.
- Emails render through the same dictionary (`email.*` keys) and are pinned by transcript tests, so email copy changes are caught by `npm test`.
- The glossary already states the rule, so the backlog's "add a glossary line if useful" (B-16 Next, commit `6bf2187`) is mostly done. The open item is the "open exams" row.

## Historical Context (from prior changes)

- B-16 (added in `6bf2187`, `context/foundation/backlog.md`) cites `en.ts:76,128,132`. Verdicts: `:76` "About the test" is supported (breaks the rule, row 4). `:128` "on an exam" is supported (row 7). `:132` "Plan this screening" is contradicted: it renders on a tier row, so "screening" is right under the owner's rule. Its inconsistency was with `:128`, which this change fixes.
- `context/archive/2026-10-28-missing-entry-plan/decisions.md:22,38` — S-10 chose "exam isn't available" for a missing-entry row. That row is the user's own, so the wording stays.

## Related Research

- `context/archive/2026-10-28-missing-entry-plan/research.md` — missing-entry rows (the `unavailable.*` keys)
- `context/archive/2026-10-06-follow-up-nudges/research.md` — nudge email copy ("planned exams")

## Open Questions

1. **Due-again email (rows 13–14).** The items are the user's done exams whose interval ran out (glossary `:60,72`), so the rule says "exam". Options: (a) reword the subject and body to "exam(s)" and update `due-screening.test.ts:294,298`; (b) keep "preventive screening" as a general health-reminder phrase. Recommended: (a). The rule says "everywhere", and the follow-up nudge email already says "planned exams" (`en.ts:323`).
2. **Catalog JSON EN text.** Options: (a) out of scope: "blood test", "HPV HR test" and "Eye examination" name medical procedures, not the app's concepts, B-16 asks for an `en.ts` audit only, and a change would need `catalog:migration` plus a review stamp; (b) reword `summary_en`/`how_to_access_en`. Recommended: (a). Record it in `decisions.md`.
3. **Glossary "open exams" (`glossary.md:63`).** These are tier items without a plan or done record, and the EN UI calls them "screenings awaiting your decision" (`en.ts:39-42`). Options: (a) rename the glossary row to "open screenings"; (b) leave it. Recommended: (a), a one-line doc edit in the same change.
4. **Consent version value.** Bump to the date the change lands, in `YYYY-MM-DD` form (`.1` if a second consent change lands the same day). This is not a product choice; it follows from `consent.ts:6-11`.
