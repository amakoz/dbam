<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: English "screening" vs "exam" copy

- **Plan**: context/changes/en-copy-terms/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1
- **Date**: 2026-10-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Evidence

- **Diff** (`origin/main...HEAD`, 3 code commits plus the change-folder docs): `src/i18n/en.ts`, `src/i18n/terms.test.ts` (new), `src/lib/consent.ts`, `src/lib/reminders/due-screening.test.ts`, `context/domain/glossary.md`, `context/domain/domain-distillation.md`. Every file is in plan Phase 1 §1–§5; the distillation map came in with plan-review F4. Nothing is unplanned. `pl.ts`, `catalog/entries/*.json`, the e2e/smoke suites and `roadmap.md` are untouched, as "What We're NOT Doing" requires.
- **Plan adherence**: all 15 keys, every plural suffix included, match the plan's Contract wording word for word. `HEALTH_DATA_CONSENT_VERSION = "2026-10-29"`. The `en` due-again transcript (subject + `_other` body) is updated, and the Polish expectations are unchanged. `terms.test.ts` follows the plan-review fixes F2/F3: the 15 changed keys plus the already-compliant ones go in two `as const satisfies readonly MessageKey[]` arrays, the checks use case-insensitive `/\bscreenings?\b/i` and `/\bexams?\b/i`, values come from the `en` record, and a global no-`/\btests?\b/i` check covers every message. The glossary row and distillation T-41 are renamed to "open screenings".
- **Consent version check** (requested by the orchestrator): the bump matches the consent copy that actually changed. Only `onboarding.consent.data` and `onboarding.consent.purpose` in `en.ts` differ from `main`. `pl.ts` is byte-identical, and no other `onboarding.consent.*` key moved. A changed consent text is exactly what the bump rule in `src/lib/consent.ts:6-10` covers. The value passes `consent.test.ts` (format + real date). **No re-consent is forced.** The version is read in only two places: the onboarding hidden field (`src/pages/onboarding.astro:77`) and the form-freshness check plus insert in `src/pages/api/consent/grant.ts:18,29`. `hasActiveConsent` filters only on `withdrawn_at` (`src/lib/consent.ts:17-25`), and `getOnboardingState` uses nothing else (`:29-42`). No SQL compares stored versions; the migrations only add the column, the grant and the format check. Existing users keep `state: "complete"`. The only effect is that a consent form opened before the deploy and submitted after it gets `consent_outdated` and is re-read, which is intended (plan Migration Notes).
- **Automated criteria** (run in this review): `npm test` passed (29 files, 651 tests). `npm run lint` passed. `npx astro check` passed (0 errors, 0 warnings, 0 hints). `npm run build` passed. `git diff --quiet origin/main -- src/i18n/pl.ts` exited 0. `grep -nE '\btests?\b' src/i18n/en.ts` returned nothing.
- **Safety**: copy and test changes only. No new endpoints, queries, secrets or schema.

## Findings

### F1 — Manual row 1.7 is ticked without a recorded read-through

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/en-copy-terms/plan.md, Progress row 1.7
- **Detail**: Row 1.7 (read the English home, consent, dashboard and withdrawal copy on a local dev server) is `- [x] … — 7b73e01`. Neither `decisions.md`, `change.md` nor the commit messages record a dev-server run or what was read. The SHA points at the code commit, which a human-judgement row cannot be evidence for. The orchestrator says this row stays open for the PR's manual checks, so ticking it here would mark as verified something nobody looked at.
- **Fix**: Change row 1.7 back to `- [ ]`, keep its title, drop the SHA, and list the read-through, including the catalog-names note, under the PR's Manual checks.
- **Decision**: ACCEPTED

### F2 — Distillation T-42 still quotes the old no-interval copy

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/domain/domain-distillation.md:72
- **Detail**: The change renamed T-41 to keep the map in step with the glossary. The next row, T-42, still gives the EN word as `"This screening has no set interval" (EN:155)`, but `en.ts:157` now reads "This exam has no set interval…". That quote now shows the rule broken in the very map that defines it. The `context/domain/evidence/*.md` files also quote old copy ("About the test", "time for a preventive screening"), but they are dated run evidence and should stay as they are.
- **Fix**: Change T-42's EN cell to `"This exam has no set interval" (EN:157)`, in the same kind of edit as T-41.
- **Decision**: ACCEPTED
