<!-- PLAN-REVIEW-REPORT -->

# Plan Review: English "screening" vs "exam" copy

- **Plan**: context/changes/en-copy-terms/plan.md
- **Mode**: Quick
- **Date**: 2026-10-29
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

6/6 paths ✓ (`src/i18n/en.ts`, `src/lib/consent.ts`, `src/lib/consent.test.ts`, `src/lib/reminders/due-screening.test.ts`, `context/domain/glossary.md`, `src/components/recommendations/ScreeningActions.astro`; the new `src/i18n/terms.test.ts` falls under vitest's `src/**/*.test.ts` include). Symbols 5/5 ✓: `MessageKey` and `createT` (`src/i18n/index.ts:9,40`), `HEALTH_DATA_CONSENT_VERSION = "2026-09-30"` (`src/lib/consent.ts:11`), the pinned EN subject and body (`due-screening.test.ts:294,298`), the glossary row (`glossary.md:63`). All 15 keys and their current text match the research table. `grep -nE '\btests?\b' src/i18n/en.ts` hits only lines 56, 76, 121, 124 and 179, all of them in the plan, so gate 1.5 will come back empty. No other code pins an affected string. The old consent version appears only in a pgTAP format fixture (`app_rules.test.sql:218`), which doesn't need to change. `origin/main` has nothing new since this branch. Brief↔plan ✓. Progress↔Phase ✓: 1 phase, 6 automated and 1 manual rows, no checkboxes in the phase body.

## Findings

### F1 — "No English message uses test" reads wider than the scope

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State; Phase 1 Manual Verification 1.7
- **Detail**: The end state says an English user reads "screening" for catalog items "wherever the app talks about a catalog item", and that "No English message uses 'test'". But catalog content stays out of scope on purpose, and it still shows "test" on the pages 1.7 asks the reader to check. Examples: `name_en` "HPV HR test in the cervical cancer screening program", and summaries such as "A blood test measuring…" and "a visual field test" (`catalog/entries/*.json`). These render through `EntryDetails.astro:16`, `DoneItem.astro:28` and `MaybeRecommendationItem.astro:18`. Someone doing 1.7 or the post-deploy PR check will see "test" on a tier row and details panel, and may fail the check or open a follow-up that `decisions.md` ("Catalog JSON English text") already turned down.
- **Fix**: Limit the end-state sentence to the dictionary ("No message in `src/i18n/en.ts` uses 'test'"). Add one line to 1.7, and to the PR's manual checks, saying that catalog names and summaries keep their procedure words ("HPV HR test", "eye examination") by decision.
- **Decision**: ACCEPTED — end state limited to `src/i18n/en.ts`; 1.7 and the PR manual-checks note say catalog names/summaries keep procedure words by decision (decided by orchestrator, 2026-10-29)

### F2 — Guard test covers only the 15 changed keys

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 — Term-rule guard test
- **Detail**: The rule is meant to hold "everywhere", but `terms.test.ts` lists only the 15 keys this change rewrites. The keys research found already compliant (`research.md`, "Keys that already follow the rule") are not guarded. These include `dashboard.screenings.plan.legend` "Plan this screening", `dashboard.status.open_*`, `dashboard.screenings.unavailable.*`, `confirm.prompt`, `done.monthLabel` and `email.followUpNudge.*`. A later edit to "Plan this exam" or "This screening isn't available" would pass the test. The only global guard is the "no test(s)" check.
- **Fix**: Add the research's "already follow" keys to the two `as const` arrays: catalog-item keys under S, user's-own keys under E, with every plural suffix. The list already exists in `research.md`, so this costs about 20 lines.
- **Decision**: ACCEPTED — the research's already-compliant keys (S and E, every plural suffix) added to the guard arrays; the 32 keys verified compliant against today's `en.ts` (decided by orchestrator, 2026-10-29)

### F3 — Guard's "screening" check is case-sensitive

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 — Term-rule guard test, Contract
- **Detail**: The contract uses `/\bexams?\b/i` and `/\btests?\b/i`, both case-insensitive, but says "contains `screening`" / "does not contain `screening`" for the other term. A plain `includes("screening")` would let a user's-own key that opens a sentence with "Screening…" through, which is exactly the drift the E check is meant to catch. The contract also leaves `createT("en")` versus the `en` record open. The record is the simpler choice, since the "no test(s)" case iterates `Object.values(en)` anyway, and plural keys don't need `t.plural`.
- **Fix**: Make the term check `/\bscreenings?\b/i` in both directions, and read values from the `en` record (`import { en } from "@/i18n/en"`).
- **Decision**: ACCEPTED — `/\bscreenings?\b/i` both ways; values read from the `en` record (decided by orchestrator, 2026-10-29)

### F4 — `domain-distillation.md` keeps "open exams"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 1 §5 — Glossary row
- **Detail**: The plan renames only `context/domain/glossary.md:63`. The same term also appears in the distillation map that the glossary is built from: `context/domain/domain-distillation.md:71` (T-41 "open exams (awaiting decision)"). The two files would then disagree, and the next `/10x-domain-distillation` run diffs against the map, so it could bring "open exams" back into the glossary.
- **Fix**: Rename T-41's term to "open screenings (awaiting decision)" in the same edit, and add `context/domain/domain-distillation.md` to §5.
- **Decision**: ACCEPTED — T-41 renamed in `domain-distillation.md` too, added to §5 (decided by orchestrator, 2026-10-29)
