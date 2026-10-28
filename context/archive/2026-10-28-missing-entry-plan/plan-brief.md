# A plan with a missing catalog entry stays visible — Plan Brief

> Full plan: `context/changes/missing-entry-plan/plan.md`
> Research: `context/changes/missing-entry-plan/research.md`
> Decisions: `context/changes/missing-entry-plan/decisions.md`

## What & Why

Roadmap S-10 fixes backlog B-04, the only owner-confirmed bug in M-03: "a user's plan must never disappear" (Q-02). Today the dashboard silently drops a plan or done record whose catalog entry it cannot load (an entry moved back to draft, or a row that fails validation).

## Starting Point

`partitionDashboard` skips a plan or completion with no entry (`src/lib/screenings/rules.ts:249,274`). `planned` already holds every plan (`rules.ts:268`), but on the dashboard a missing-entry slug never has a tier item. So the loss users actually see is the plan row and the done row themselves. F-08's test pins the skip (`rules.test.ts:418-430`).

## Desired End State

A missing-entry plan shows in "Your plans" (in date order) and a missing-entry done record shows in "Done". Each reads as a neutral "Exam not available" row. It keeps its own date line ("Appointment: …" / "Date not set yet" for a plan, "Last done: …" for a done record), so it matches the appointment email that is still sent. Under the date is the note "This exam isn't available in the app right now.", then only "Remove from plans" or "Undo", which names the date for screen readers. There is no tier badge. Every exam still shows in exactly one place, and the cron's due-again emails are unchanged.

## Key Decisions Made

| Decision                    | Choice                                                                        | Why (1 sentence)                                                                                          | Source                  |
| --------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- |
| Scope                       | Render the missing-entry plan and done record                                 | Fixing `planned` alone changes nothing users see; the owner requires the plan never to disappear          | Research / orchestrator |
| What `planned` holds        | Every plan, with or without an entry (unchanged)                              | The missing-entry plan row is now the exam's one place; otherwise plan + done on a draft entry show twice | Plan / orchestrator     |
| Label                       | One generic, neutral pl/en label, no new query                                | Users can't read a draft row at all (catalog RLS)                                                         | Orchestrator            |
| Actions                     | Remove (plan) / undo (done) only, a neutral note, no tier badge               | Every other action fails for an entry that isn't active                                                   | Orchestrator            |
| Row content (plan review)   | Keep the date line; the button's sr-only name includes it (F1 Fix A, F2)      | The reminder email still names the date (Q-01); two unavailable rows need distinct names                  | Plan review             |
| Representation              | `plans`/`done` become unions with `{ plan \| completion, entry: null }` views | Leaves `PlanView`/`DoneView`, `PlanItem`/`DoneItem` and the cron untouched; keeps the date order          | Plan                    |
| A missing-entry done record | Always in "Done", never due again                                             | No interval is known, the same as a no-interval record                                                    | Plan                    |

## Scope

**In scope:** the partition rule and its types; the rewritten F-08 test plus new one-place cases; a new `UnavailableItem.astro`; two i18n keys per locale; dashboard wiring; a kitchen-sink sample with screenshots.

**Out of scope:** a names-only catalog query; API/RLS/migration changes; appointment reminders (Q-01); guarding backward catalog moves (F-17); domain-map and roadmap status edits; a new e2e test.

## Architecture / Approach

The rule stays pure. It now emits "no entry" views instead of skipping them, and `planned` keeps hiding the slug's done record, tier item and maybe item. The dashboard branches on `entry === null`: `UnavailableItem` for those rows, `PlanItem`/`DoneItem` for the rest. Every row lookup (error, saved, anchor) is keyed by `plan.catalog_slug` / `completion.catalog_slug`.

## Phases at a Glance

| Phase                                 | What it delivers                                                         | Key risk                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1. Missing-entry records render       | Rule + tests + component + i18n + dashboard wiring, with all gates green | Breaking "each exam shows in one place"; the existing partition tests guard it |
| 2. Kitchen-sink sample + visual check | Unavailable rows in the kitchen sink; light/dark shots at 1440/390       | Token or contrast drift in the new row (`ui:check` + shots)                    |

**Prerequisites:** none (no migration; local Supabase only for the optional PR manual check).
**Estimated effort:** ~1 session, 2 phases, about 6 files.

## Open Risks & Assumptions

- The seed data has no missing entries, so the dashboard shots can't show the row. The kitchen sink is the visual evidence, and the draft-demotion check is a PR manual step on the local stack only.
- Assumes F-17 lands separately. Until then, a backward catalog move is the main way to reach this row.
- Only the PR manual check 2.5 proves the dashboard wiring end to end (including the `#screening-<slug>` anchor or a failed remove). The PR records that it ran.

## Success Criteria (Summary)

- A user whose plan's entry goes missing still sees that plan with its appointment date, and can remove it.
- A done record with a missing entry still shows in "Done", and can be undone.
- No exam ever shows in two places. `npm test`, `astro check`, lint, `ui:check` and the build stay green.
