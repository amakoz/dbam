# S-03 Record appointment date — Plan Brief

> Full plan: `context/changes/record-appointment-date/plan.md`
> Research: `context/changes/record-appointment-date/research.md`

## What & Why

A user can **plan** a recommended screening (with an optional date of an appointment booked outside the app) or **mark it done** (with an optional month and year). The dashboard then shows only what's still left to handle: "what else should I focus on".

This delivers US-02 / FR-005, and pulls S-05's "mark already done" forward. It also stores the records that later reminders (S-04, S-06) and nudges (S-07) will read.

## Starting Point

- S-02's dashboard lists `recommend()` tiers and "may apply" items from the active catalog.
- Nothing stores per-user exam data yet.
- S-01 set the pattern for consent-gated health data, and its withdrawal function deletes only `profiles`.
- The consent text lists only birth year, sex and smoking.

## Desired End State

Each tier item has a "Plan or mark done" panel.

- **Planned exams** move to a **Your plans** section above the tiers: dated ones by date, undated ones as "date not set yet".
- **Done exams** move to a **Done** section:
  - with a fixed interval: "due again [Month YYYY]", after which they return to their tier with a "last done" line;
  - without one: they stay in Done with a "check with your doctor or the program" note until undone.

Withdrawing consent deletes all of it, and the consent text now says so.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Select vs date (FR-011) | Plan with an optional date; an undated plan is the "selected, no date" state | FR-011's nudge has its state from day one, with no later schema change | Plan |
| "Mark done" scope | Pulled into S-03; S-05 narrows to confirming an appointment | The user gets a filtered focus list now | Plan |
| Records per exam | One plan and one done record per (user, exam); overwrite on save; remove/undo deletes | Simple upsert like `profiles`; no PRD need for reschedule history | Plan |
| Appointment dates | Today (Warsaw) to today + 2 years, inclusive; no past dates | Past exams go through "mark done" instead | Plan |
| Done date | Optional month/year; blank = counted from the month it was marked | One click still works; users who remember get an accurate due date | Plan + Research (month/year precision) |
| Due again | From the 1st of the month the interval ends (March 2024 + 24 months → 1 March 2026) | Matches month precision; easy to explain | Plan |
| No fixed interval (11/20 entries) | Stays in Done until undone, with a note | Never invents an interval the catalog doesn't source | Plan |
| Which exams | Tiers 1–3 only; the endpoint re-runs `recommend()`; RLS requires an `active` entry | Matches "a due recommendation"; blocks draft/forged slugs (FKs ignore RLS) | Plan + Research |
| Dashboard layout | "Your plans" above tiers, "Done" below; rendered from the user's own rows | Tiers show only what's unhandled; records survive retired entries | Plan + Research |
| Forms | Plain Astro forms, no JS; month + year selects, not `type="month"` | Same shape as `WithdrawConsentForm`; `type="month"` is missing on desktop Firefox/Safari | Plan |
| Consent | New text + version bump, no re-consent | Pre-launch: no real user consented under the old text | Plan |
| Storage | Two tables, `screening_plans` and `screening_completions`, S-01 RLS pattern + active-entry check | Different lifecycles and different later readers (S-04/S-07 vs S-06) | Plan + Research |

## Scope

**In scope:**

- Two tables with RLS, grants, the withdrawal cascade and pgTAP.
- A pure rules module (Warsaw dates, parsers, next due, dashboard split).
- `/api/screenings` with four intents: `plan`, `unplan`, `done`, `undone`.
- The dashboard sections and forms.
- The consent and withdrawal wording, and the consent version bump.
- Smoke steps.
- A roadmap outcome update for S-03 and S-05.

**Out of scope:**

- All emails (S-04, S-06, S-07) and the opt-in flag.
- Confirming an appointment with an exact date (S-05).
- Reschedule history, and past-dated appointments.
- "May apply" entries.
- Re-consent.
- A cron read path or `service_role` grants.
- React islands and new shadcn components.

## Architecture / Approach

1. The form POSTs to `/api/screenings`, which:
   - checks auth and onboarding state (consent + profile);
   - parses the form against Warsaw "today";
   - checks that the slug is in the user's `recommend()` tiers;
   - upserts the record, or deletes it for remove/undo.

   "Mark done" also deletes that exam's plan. The completion is written first, so a failure never loses the plan.
2. It redirects with `?saved=` or `?error=&slug=#screening-<slug>`.
3. The dashboard reads the user's plans and completions (joined to active or retired catalog entries) and runs `partitionDashboard()`. That gives the plans, done, filtered tiers and "last done" lines.
4. RLS independently enforces own rows, active consent and an active catalog entry.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database and contract | Tables, RLS, grants, withdrawal cascade, pgTAP, types, roadmap text | Upsert needs UPDATE on `catalog_slug`, or a re-save fails with 42501 |
| 2. Rules and endpoint | `screenings/rules.ts`, reads, `/api/screenings`, protected route, error keys | Warsaw vs UTC "today" off-by-one around midnight |
| 3. Dashboard, wording and smoke | Plan/done panel, two sections, due-again line, messages, consent text, smoke | Error placement and the reopened panel after a redirect |

**Prerequisites:** S-02 merged (done). Local Supabase running for `db reset` / `test db` / smoke.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- **No re-consent** is safe only because the app is pre-launch. After launch, a consent-text change needs a re-consent decision.
- **A withdrawal race** (S-01 F1 residual): a write running at the same time as a withdrawal can still land after it. This applies to the new tables too; accepted, as in S-01.
- **A blank done date counts from the day it was marked**, so "due again" can be late by however long ago the exam really was.
- **Re-dating a plan for an exam the user no longer qualifies for** is rejected (`screening_not_available`). Removing it still works.
- **No unit runner exists yet** (F-03). The rules module is pure so F-03 can cover its date edges.

## Success Criteria (Summary)

- A user can plan an exam (dated or not) and mark exams done. The dashboard then lists only what's still unhandled, with plans and done items in their own sections.
- A done exam with a fixed interval comes back as due from the right month. One without an interval stays done with a clear note.
- Withdrawing consent deletes plans and done records. pgTAP and smoke prove the access rules and the flow.
