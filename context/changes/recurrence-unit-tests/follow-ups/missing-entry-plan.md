# Follow-up: a plan whose catalog entry is missing still hides its tier item

F-08 (`recurrence-unit-tests`) pins `partitionDashboard` without changing production code. Its implementation review (impl-review.md F2) found a behaviour the tests deliberately leave unpinned. This note records it so it is not lost. The PR description lists it under follow-ups.

## Behaviour

In `src/lib/screenings/rules.ts`, the plan loop skips a plan whose `catalog_slug` has no entry, so it never shows in `plans`. But `planned` is built from **all** plans (`rules.ts:257`, `new Set(plans.map((plan) => plan.catalog_slug))`), including the skipped ones. So a plan whose entry is missing:

- hides its tier item (`hidden` includes every `planned` slug, `rules.ts:271`), and
- hides its completion (the completion loop skips `planned.has(...)`, `rules.ts:263`).

The user sees neither the plan nor the recommendation nor the completion for that slug.

## Why it matters (low)

Recommendations come from valid catalog entries, and entries are never deleted (`"status": "retired"`, see CLAUDE.md), so a tier item and a missing-entry plan for the same slug should not coexist today. It would matter if `entries` passed to `partitionDashboard` were ever a narrower set than the one recommendations are built from (e.g. a filter on status).

## Options

- Build `planned` from `planViews` (plans with an entry) so a missing-entry plan hides nothing, then pin it with a test.
- Or keep the current behaviour and pin it explicitly with a test, so it stops being implicit.

## Next step

A human decides whether this becomes a GitHub issue or a roadmap item. Out of scope for F-08 (no production changes).
