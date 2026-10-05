# Confirm Exam and Recurrence — Plan Brief

> Full plan: `context/changes/confirm-exam-and-recurrence/plan.md`
> Research: `context/changes/confirm-exam-and-recurrence/research.md`

## What & Why

S-05 closes the screening loop (PRD US-03, FR-008, FR-009): once an appointment day arrives, the user confirms with one click that the exam happened. The exam then leaves the active lists and comes back when its repeat interval elapses, without the user entering anything again.

## Starting Point

S-03 already shipped month/year "mark done", the due-again logic (hidden until `month + interval`, then back in its tier) and the "no set interval" note. What's missing:

- a plan whose date has passed looks like a future plan;
- its change-date form can't be resubmitted;
- completions store only a month.

## Desired End State

From the appointment day on, the plan row asks "Did the exam take place on {date}?" with a "Yes, confirm" button. Confirming moves the exam to "Done" with "Last done: 20 October 2026" and its "Due again" month (or the no-interval note), and deletes the plan and any pending reminder rows. Future and undated plans can't be confirmed.

## Key Decisions Made

| Decision          | Choice                                                             | Why (1 sentence)                                                                                 | Source   |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------- |
| Scope             | Passed-plan state + one-click confirm only                         | Recurrence, due-again and the no-interval display already shipped in S-03.                       | Research |
| Confirm window    | `appointment_date <= Warsaw today`                                 | Same-day confirmation, and smoke can test it by planning for today.                              | Plan     |
| Date storage      | New nullable `last_done_on`, CHECK same month as `last_done_month` | Keeps the real day without touching the recurrence code; additive.                               | Plan     |
| Plan on confirm   | Deleted (cascades S-04 ledger rows)                                | Mirrors the existing done path; S-07 finds unconfirmed appointments as plans dated before today. | Plan     |
| Atomicity         | One `security invoker` SQL function                                | One transaction, under the same RLS and grants, with "today" decided on the server.              | Plan     |
| Next due for S-06 | Not stored; still computed in TS                                   | Avoids stale values when the profile changes; S-06 decides how its cron reads it.                | Plan     |
| Tier check        | Skipped on confirm                                                 | A fact the user acted on can always be recorded; mirrors unplan/undone.                          | Plan     |
| Dashboard         | Inline prompt on the plan row                                      | Smallest change, and stays out of the files issue #67 edits.                                     | Plan     |
| Testing           | pgTAP + smoke via a today-dated plan                               | Covers the full path over HTTP without test-only seeding.                                        | Plan     |

## Scope

**In scope:**

- the migration (column, CHECK, grants, `confirm_screening_plan`);
- the `confirm` intent, and `done` clearing the exact day;
- the passed-plan prompt and an empty change-date prefill;
- the exact day on "last done" lines;
- the reminders hint limited to future dates;
- i18n, kitchen sink, pgTAP, smoke;
- README, roadmap and issue #23 cleanup.

**Out of scope:**

- a stored next due date;
- reminder or nudge emails (S-06, S-07);
- a "didn't happen" action or confirming a different day;
- a separate "to confirm" section;
- tier-row changes (#67);
- history, unit tests (F-03), cervical test-type intervals.

## Architecture / Approach

The form posts `intent=confirm` to `POST /api/screenings`, which calls `rpc("confirm_screening_plan", { p_slug })`. The function runs as the caller, so the existing RLS (own rows, active consent, active entry) applies. It locks the plan, checks its date against Warsaw today, upserts the completion (month + day), deletes the plan and returns `confirmed`, `not_due` or `not_found`, which the endpoint maps to the existing `?saved=` / `?error=` redirects. The dashboard marks plans whose day has arrived in the pure `partitionDashboard` and renders the prompt inline.

## Phases at a Glance

| Phase                       | What it delivers                                                                   | Key risk                                                           |
| --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Database                 | `last_done_on`, CHECK, grants, confirm function, types, pgTAP                      | Getting RLS + upsert right inside an invoker function              |
| 2. Confirm on the dashboard | Intent, passed-plan prompt, exact-day display, hint fix, i18n, kitchen sink, smoke | Merge overlap with #67 in `dashboard.astro` / `kitchen-sink.astro` |
| 3. Docs and roadmap cleanup | README, roadmap S-05 text, issue #23 title                                         | —                                                                  |

**Prerequisites:** S-03 and S-04 merged (done). The local Supabase and :4321 are shared with the `10xdevs-second` worktree: coordinate before `db reset`.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- If the Worker is rolled back after users have confirmed exams, re-marking such an exam done in another month fails with `save_failed` until it is undone and re-marked. This is accepted to keep the schema additive.
- A plan dated days ago can't be created through the API, so that rendering is checked manually (local psql seed) and in pgTAP at the data level only.
- S-06 still has to choose how its cron gets next due dates (store vs. SQL interval resolution with overrides).

## Success Criteria (Summary)

- On or after the appointment day, one click turns a plan into a "Done" entry with the exact day and the right "Due again" month.
- Future and undated plans can't be confirmed, through either the UI or the API.
- pgTAP and smoke cover the new path in CI; existing S-03/S-04 checks still pass.
