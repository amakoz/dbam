# Cross-job overlap: appointment and due-screening emails

## Observation

The appointment job (S-04) and the due-screening job (S-06) each send at most one email per user per run, but nothing de-duplicates across the two. A user with a plan dated 1–3 days ahead and an exam that is due again gets two emails on the same 10:00 Warsaw run. S-07 found this while adding the follow-up nudge job: it skips a user who already got an appointment or due email that Warsaw day (`claim_follow_up_nudges` reads `sent_at` on both ledgers), so the nudge never adds a third email, but the first two still overlap.

## Impact

Low. A user gets two emails instead of one on the days both apply, and both draw on the shared daily budget (`REMINDER_EMAIL_DAILY_BUDGET`, 92). Neither email names an exam, and each has its own opt-out link.

## Option

Give `claim_due_screening_reminders` the same "emailed today" exclusion as the nudge claim: skip a user with an `appointment_reminders` row whose Warsaw `sent_at` date is `p_today`. The due ledger rows stay unsent and roll to the next daily run. Appointments keep priority, which matches the chain order. A dry run marks nothing, so it would not show the effect.
