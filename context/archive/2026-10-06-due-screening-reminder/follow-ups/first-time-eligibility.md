# Follow-up: remind on first-time eligibility

- **What:** S-06 reminds only when a done/confirmed exam's repeat interval elapses. A screening that becomes due for the first time — the user ages into its range on 1 January, edits a profile factor, or a catalog entry is added — gets no email; it only appears in its dashboard tier.
- **Why deferred:** the PRD defines the recurrence reminder (US-03, FR-009); first-time eligibility has no date in the current model (`partitionDashboard` has no "became eligible on"), so it needs its own trigger and dedupe key (e.g. per user, slug and eligibility year). Decided by the orchestrator on 2026-10-06 (`decisions.md`).
- **Next:** _Human:_ decide whether the product wants it (PRD Success Criteria "receives an opt-in reminder when a screening becomes due" can be read either way). _Agent:_ if yes, a slice that adds an eligibility ledger and reuses the S-06 job and budget.
