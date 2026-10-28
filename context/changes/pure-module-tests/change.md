---
change_id: pure-module-tests
title: Unit tests for the remaining pure modules (F-19)
status: plan_reviewed
created: 2026-10-28
updated: 2026-10-28
archived_at: null
---

## Notes

— roadmap F-19 (M-03, backlog B-11): unit tests (Vitest, colocated _.test.ts, reusing the F-03 runner) for the remaining pure modules: password.ts, parseProfileForm/packYears, errors.ts, auth-errors.ts, scripts/catalog/_ (whatever F-17 #103 didn't already cover), and isIsoDate, screeningFormBounds, formatDay, formatMonth directly. Tests only; no source change except making 'now' injectable where a module reads the clock.
