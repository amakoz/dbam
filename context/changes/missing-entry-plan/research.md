---
date: 2026-10-28T09:06:01+0100
researcher: Claude (Opus 5.5, Dbam worker)
git_commit: a3d4b7e
branch: feat/missing-entry-plan
repository: 10xdevs (Dbam)
topic: "S-10 / B-04 — a plan whose catalog entry is missing must not hide or lose that exam"
tags: [research, dashboard, partitionDashboard, screening-plans, catalog]
status: complete
last_updated: 2026-10-28
last_updated_by: Claude (Opus 5.5, Dbam worker)
---

# Research: a plan whose catalog entry is missing (S-10, backlog B-04)

**Date**: 2026-10-28T09:06:01+0100
**Researcher**: Claude (Opus 5.5, Dbam worker)
**Git Commit**: a3d4b7e
**Branch**: feat/missing-entry-plan
**Repository**: 10xdevs (Dbam)

## Research Question

Roadmap S-10: "a user whose plan points to a catalog entry the dashboard cannot load still sees that screening's tier item and its completion; the plan never hides them. The F-08 test's expectation is updated to the fixed behaviour" (`context/foundation/roadmap.md:145`). Owner answer to Q-02: "B-04 is a bug: a user's plan must never disappear" (`context/domain/domain-distillation.md:262`). What does the code do today, when can an entry be "missing", and what must change?

## Summary

1. **The reported mechanism is real but not observable on the dashboard today.** `partitionDashboard` skips a plan with no entry (`src/lib/screenings/rules.ts:248-249`) yet builds `planned` from all plans (`rules.ts:268`), which then skips the completion (`rules.ts:274`) and hides tier and maybe items (`rules.ts:282,287,293`). The line numbers in the follow-up note (:257/:263/:271) have shifted by +11 since F-08. But on the only page caller, `entries = [...catalog, ...extraEntries]` (`src/pages/dashboard.astro:60`) and recommendations come from that same `catalog` (`dashboard.astro:53`). So for any slug whose plan has no entry: (a) it cannot have a tier/maybe item, because every recommended slug is in `catalog` ⊆ `entries`; and (b) its completion has no entry either (same `entryBySlug` map, `rules.ts:240,273`) and is skipped anyway. The other caller, the due-again cron, passes `plans = []` (`src/lib/screenings/due.ts:43`), so `planned` is empty there. **Changing `planned` to come from `planViews` alone changes no dashboard or cron output today.** It only matters if a caller ever passes `entries` narrower than its recommendations, which is what the follow-up note said (`context/archive/2026-10-06-recurrence-unit-tests/follow-ups/missing-entry-plan.md`, "Why it matters").
2. **What a user actually loses today is the plan row itself, and the done record for that slug.** Both are silently dropped (`rules.ts:249`, `rules.ts:274`). That is the owner's "a user's plan must never disappear".
3. **The F-08 test would still pass after the `planned`-only fix.** It uses a plan on `"ghost"` and a completion on `"exam"` with `entries = []` (`src/lib/screenings/rules.test.ts:418-430`). Different slugs, so `planned` never touches `"exam"`. Its assertions (`plans: []`, `done: []`, tier `["exam"]`) hold either way. To change the expectation as the roadmap requires, the plan must start showing (`plans` no longer `[]`), or the test must add a same-slug case.
4. **An entry is "missing" in two situations that are reachable in production**, and in one that is not:
   - **Draft** (the entry was demoted from active or retired): RLS lets users read only `active`/`retired` rows (`supabase/migrations/20260928153742_screening_catalog.sql:65-67`), and `getCatalogEntries` filters to the same statuses (`src/lib/catalog/read.ts:50`). The row, and so its name, is unreadable to the user's client. Backward moves are still possible until F-17 lands (`roadmap.md:91`).
   - **Fails `CatalogEntrySchema`**: logged and skipped (`read.ts:14-27`). An invalid active row is skipped by `getActiveCatalog`, so it lands in `missingSlugs` (`dashboard.astro:47-50`). `getCatalogEntries` then fetches it again and skips it again.
   - **Deleted**: not reachable while a plan or done record references it. Both FKs are plain `references public.screening_catalog (slug)` with no cascade (`supabase/migrations/20260930093108_screening_records.sql:15,41`), and the build refuses deletions (R-28, `domain-distillation.md:170`).
   - **Retired is not missing**: `getCatalogEntries` loads retired rows (`read.ts:50`), so a plan on a retired entry renders today with `tier: null` (`rules.ts:254`).
5. **What a missing-entry row can still do**: removing it works. `unplan`/`undone` delete by `(user_id, catalog_slug)` with no consent, catalog or recommendation check (`src/pages/api/screenings.ts:64-71`), and the delete policies check ownership only (`…093108_screening_records.sql:113-115,162-164`). Every other action fails for a non-active entry. Confirm hits RLS and returns `screening_not_available` (`screenings.ts:81-89`). Plan and done require the slug in the user's current tiers (`screenings.ts:130-133`).

## Detailed Findings

### The partition rule (`src/lib/screenings/rules.ts:222-296`)

- The JSDoc states the contract: "`entries` must hold the catalog entry of every plan and done record (active or retired); a record whose entry is missing (e.g. it failed validation) is skipped" (`rules.ts:226-228`).
- Plan loop: `if (!entry) continue;` (`rules.ts:249`). `PlanView.entry` is a required `E` (`rules.ts:191-198`).
- `planned = new Set(plans.map(...))` uses the raw `plans` (`rules.ts:268`).
- Completion loop: `if (!entry || planned.has(slug)) continue;` (`rules.ts:274`). `DoneView.entry` is a required `E` (`rules.ts:203-208`).
- `hidden = planned ∪ done slugs` filters `tiers` (`rules.ts:287`) and `maybe` (`rules.ts:293`). So `maybe` is affected the same way as tiers; the follow-up note names tiers only.
- Invariant R-02, "plan, then not-yet-due completion, then tier" (each exam shows in one place, `domain-distillation.md:129`), is enforced only by this function. The roadmap risk says the existing partition tests are its guard (`roadmap.md:151`).

### Callers

- `src/pages/dashboard.astro:42-63`: loads the active catalog and the user's rows. It then loads the non-active slugs through `getCatalogEntries` and passes `[...catalog, ...extraEntries]`.
- `src/lib/screenings/due.ts:43`: the cron passes `plans = []` with rule entries. Its SQL already excludes planned slugs (`due.ts:30`) and requires `status = 'active'` (`domain-distillation.md:160`). The cron is not affected by any change to plan handling.
- `src/pages/dev/kitchen-sink.astro:29,110,159,181` builds `PlanView`/`DoneView` fixtures. A type change to `entry` (e.g. `E | null`) touches it.

### Rendering (`src/components/recommendations/PlanItem.astro`, `DoneItem.astro`)

- Both read `entry.name_pl`/`entry.name_en` for the heading and the sr-only action labels (`PlanItem.astro:32,59,85`; `DoneItem.astro:28`). Both read `entry.slug` for the row anchor `id="screening-<slug>"`, `data-slug` and the hidden form inputs (`PlanItem.astro:37-39,53,71,82`; `DoneItem.astro:32-34,64`).
- `PlanItem` shows a confirm form when `awaitingConfirmation` (`PlanItem.astro:50-61`). It also shows `ScreeningActions` (change date / mark done, `:70-78`) and an `unplan` form (`:80-87`). For a missing entry, only `unplan` can succeed (Summary point 5).
- The dashboard builds the anchor set from `plans`/`done`/tier `entry.slug` (`dashboard.astro:98-102`) and passes `view.entry.slug` to the error and saved lookups (`dashboard.astro:248`). The flash slug "is only compared, never rendered" as text (`dashboard.astro:78-80`). A fallback row should not render the slug as visible text, because the slug is health data (`screenings.ts:13-14`).
- For a draft entry no name is readable on the user's client. RLS hides the row (`…153742:65-67`), and lint forbids the admin client in pages (CLAUDE.md, `src/lib/reminders/admin-client.ts`). For a row that fails validation, a names-only select (`slug, name_pl, name_en`) would still return a name. That needs a new query; none exists today (`read.ts` exports three readers, `:34,44,76`).
- Existing copy: `errors.screening_not_available` reads "This exam isn't on your recommendations list right now. Refresh the page and try again." (`src/i18n/en.ts:361-362`, PL `pl.ts:365`). No dashboard key describes an exam whose catalog entry is unavailable (searched `pl.ts`/`en.ts` for `not_available`; only the error key exists).

### Data today

- `catalog/entries/` holds 19 `active` entries, 1 `draft` and 0 `retired` (`grep '"status"' catalog/entries/*.json`). Users cannot plan the draft entry, because insert requires `status = 'active'` (`…093108:74-85`). So no production user can have a missing-entry plan unless an active entry is demoted or a row stops validating.

## Code References

- `src/lib/screenings/rules.ts:191-198` — `PlanView` (required `entry`)
- `src/lib/screenings/rules.ts:203-208` — `DoneView` (required `entry`)
- `src/lib/screenings/rules.ts:222-296` — `partitionDashboard`; skips at `:249`, `:274`; `planned` at `:268`; `hidden` at `:282`
- `src/lib/screenings/rules.test.ts:418-430` — F-08's missing-entry test (different slugs; holds under the `planned`-only fix)
- `src/pages/dashboard.astro:42-63` — catalog + extra entries loading and the partition call
- `src/lib/catalog/read.ts:14-27,44-53` — validation skip; active+retired reader
- `src/lib/screenings/due.ts:34-55` — cron caller (`plans = []`)
- `src/pages/api/screenings.ts:64-71,76-97,122-133` — unplan/undone, confirm, tier check
- `supabase/migrations/20260928153742_screening_catalog.sql:65-67` — catalog read policy (active, retired)
- `supabase/migrations/20260930093108_screening_records.sql:15,41,74-115,162-164` — FKs, write and delete policies
- `src/components/recommendations/PlanItem.astro`, `DoneItem.astro` — row rendering that needs `entry`
- `src/pages/dev/kitchen-sink.astro:110-190` — `PlanView`/`DoneView` fixtures

## Architecture Insights

- The user's exam has no type; its identity is `(user_id, catalog_slug)` and its "one place" rule lives only in `partitionDashboard` (T-02, R-02, `domain-distillation.md:32,129`). Any representation of a missing-entry plan has to keep "a plan wins over a done record" for its slug. Otherwise a missing-entry plan and a missing-entry done record on the same slug would both render.
- The rules module is pure, with "now" as a parameter (`rules.ts:14-16`), so the fix and its tests stay in Vitest. No migration or pgTAP change is implied: RLS already allows the only actions such a row can take.
- `E extends RuleEntry` is generic so the cron can pass rule-only entries (`rules.ts:203,210,230`). A fallback needs a display name that `RuleEntry` lacks, so it has to live on the dashboard side (in the views or the components), not in rule fields.

## Historical Context (from prior changes)

- `context/archive/2026-10-06-recurrence-unit-tests/follow-ups/missing-entry-plan.md`. Claim "`planned` is built from all plans": **supported** (`rules.ts:268`). Claim "hides its tier item … hides its completion": **supported** as code behaviour, but **not reachable** on the current dashboard (Summary point 1), which the note itself said ("should not coexist today"). Line anchors :257/:263/:271: **stale**, now :268/:274/:282. Its two options ("build `planned` from `planViews`" or "pin the current behaviour") predate the owner's Q-02 answer, which rules out keeping the plan hidden.
- `context/domain/domain-distillation.md:216` (D-02): "the dashboard … skips records whose entry is missing". **Supported** (`rules.ts:249,274`).
- `context/foundation/roadmap.md:91` (F-17): backward catalog moves will be refused by `catalog:check`. That lowers how likely the draft case is but does not remove the validation-failure case.

## Related Research

Not applicable (no earlier research.md covers this slice).

## Open Questions

1. **Scope**: is the slice only the `planned` fix, or must the missing-entry plan (and done record) itself render? Summary points 1–3 show the `planned` fix alone changes nothing a user sees, and it leaves F-08's test passing unchanged.
2. **Label for a row with no readable entry**: a generic i18n label for all missing cases, or a best-effort name via a new names-only query (works for invalid rows, never for draft)?
3. **Actions on that row**: only "remove" for a plan and "undo" for a done record, since every other action fails for a non-active entry (Summary point 5)? Or also explanatory copy (neutral, no diagnosis wording)?
