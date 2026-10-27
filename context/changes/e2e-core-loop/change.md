---
change_id: e2e-core-loop
title: Browser E2E for the core loop (test-plan Phase 1, S-08)
status: impl_reviewed
created: 2026-10-27
updated: 2026-10-27
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Browser E2E for the core loop" (roadmap M-02 S-08, PRD MS-02). Risks covered: #2 (core loop breaks in a real browser), #4 (confirmed exam lost or wrong next due date), #1 at browser level (second user sees another user's data). Test types planned: e2e (Playwright, CI on PR, local build + local Supabase only). Risk response intent: #2: a fresh user completes sign-up -> onboarding -> due list -> plan -> confirm by clicking through the rendered UI, and each step shows its business result. #4: after confirming, the exam leaves "due", shows as done on the appointment date, and shows the next due date the catalog interval implies (oracle from the catalog entry, not the production date helper). #1: user B in a separate browser session sees none of user A's exams or profile.
