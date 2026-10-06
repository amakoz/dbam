---
change_id: due-screening-reminder
title: Email opted-in users when a screening becomes due, including repeat intervals
status: plan_reviewed
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

an opted-in user receives an email when a screening becomes due — including when a confirmed exam's repeat interval elapses — without re-entering the exam. Roadmap S-06; PRD refs: US-03, FR-009, Success Criteria (Primary); prerequisites S-04, S-05, F-08 done. Risk: reminders for many users can land on the same dates, which is where the scheduled-run CPU cap from F-02 bites. Constraints: reuse the S-04 reminder job and Resend path (src/lib/reminders/*, admin client), log failures with F-07's error events, no health data in logs or URLs (backlog B-01).
