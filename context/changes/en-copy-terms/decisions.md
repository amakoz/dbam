# Decisions — en-copy-terms

## 2026-10-29 Research: no sub-agents

- Question: dispatch research sub-agents?
- Options: (a) up to 2 sub-agents; (b) none.
- Choice: (b). The change touches 3 modules (`src/i18n`, `src/lib/consent.ts`, `src/lib/reminders` tests), and the prompt says no sub-agents in that case.
- Evidence: `research.md` Summary and Code References.
- Decided by: worker

## 2026-10-29 Due-again email wording

- Question: should the EN due-again email say "exam(s)" instead of "preventive screening(s)"?
- Options: (a) reword to "exam(s)" and update `src/lib/reminders/due-screening.test.ts:294,298`; (b) keep "preventive screening".
- Choice: (a).
- Evidence: the items are the user's done exams due again (`context/domain/glossary.md:60,72`); the nudge email already says "planned exams" (`src/i18n/en.ts:323`).
- Decided by: orchestrator

## 2026-10-29 Catalog JSON English text

- Question: do `catalog/entries/*.json` EN fields change too?
- Options: (a) out of scope; (b) reword `summary_en`/`how_to_access_en`.
- Choice: (a). A follow-up only if real misuse is found. Research found none: "test" and "examination" there name medical procedures ("HIV screening test", "Eye examination for glaucoma"), and "screening" there refers to the catalog item (e.g. `blood-pressure-measurement.json` summary). No follow-up is opened.
- Evidence: `research.md` Summary, open question 2.
- Decided by: orchestrator

## 2026-10-29 Glossary "open exams" row

- Question: rename `context/domain/glossary.md:63` "open exams" to "open screenings"?
- Options: (a) rename in this change; (b) leave it.
- Choice: (a).
- Evidence: the UI calls these tier items "screenings awaiting your decision" (`src/i18n/en.ts:39-42`).
- Decided by: orchestrator

## 2026-10-29 Plan: complexity, questions, phases

- Question: complexity, question budget and phase split for `/10x-plan`.
- Options: complexity LOW / MEDIUM; 0 or more questions; one phase or copy and docs split.
- Choice: LOW, 0 substantive questions (the research table fixes every key and its wording, and the orchestrator settled the three scope questions), one phase. Copy, consent bump, tests and the glossary row land together because the tests pin the copy and the consent version must move with the consent text.
- Evidence: `research.md` key table; `src/lib/consent.ts:6-11`.
- Decided by: worker (delegated by orchestrator)

## 2026-10-29 Regression guard for the term rule

- Question: how to keep the rule from drifting back?
- Options: (a) a table-driven unit test that, for each affected key, asserts the EN text uses its term and not the other one, plus no EN message using "test(s)"; (b) pin the full strings; (c) no test.
- Choice: (a). It checks the rule rather than the exact wording, so copy edits that keep the term don't break it. Full-string pins (b) would duplicate `en.ts`.
- Evidence: no test under `src/i18n` today; the wording tests pin no affected key (`research.md` Tests and suites).
- Decided by: worker

## 2026-10-29 Consent version value

- Question: which `HEALTH_DATA_CONSENT_VERSION` value?
- Choice: `"2026-10-29"`, the date of the consent text change, in the format `src/lib/consent.ts:6-11` requires (`.1` only if another consent change lands the same day). Existing consents stay valid (`hasActiveConsent` ignores the version).
- Decided by: worker

## 2026-10-29 Roadmap status

- `/10x-plan` asks to flip S-11 to `planning`; skipped per the worker protocol (only `/10x-archive` sets `done`).
- Decided by: orchestrator (protocol)

## 2026-10-29 Plan review triage (`plan-review.md`)

- F1 (end state reads wider than scope): accepted. The end state says "no message in `src/i18n/en.ts` uses 'test'". Check 1.7 and the PR manual-checks note say catalog names and summaries keep procedure words by decision.
- F2 (guard covers only the 15 changed keys): accepted. The guard arrays also hold the research's already-compliant keys, with every plural suffix. `email.followUpNudge` greeting, `confirm_*`, dashboard and opt-out name no item and stay out. All 32 already-compliant keys were checked against today's `en.ts` with a throwaway vitest run, and all pass.
- F3 (case-sensitive "screening" check): accepted. `/\bscreenings?\b/i` both ways; values read from the `en` record.
- F4 (`domain-distillation.md` keeps "open exams"): accepted. T-41 is renamed to "open screenings (awaiting decision)", and the file is added to plan §5.
- Decided by: orchestrator
