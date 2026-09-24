---
project: "Dbam"
context_type: greenfield
created: 2026-09-23
updated: 2026-09-23
product_type: web-app
target_scale:
  users: medium
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona scope"
      decision: "individuals broadly, across ages/situations (not a single named user or narrow role)"
    - topic: "screening scope"
      decision: "all age/risk-appropriate exams, free and paid — not limited to NFZ-eligible free screenings"
    - topic: "geography"
      decision: "Poland-first (NFZ, Polish guidelines), designed to generalize later"
    - topic: "pain category"
      decision: "decision paralysis/forgetting + data trapped somewhere + coordination overhead"
    - topic: "insight"
      decision: "not yet articulated — routed to Open Questions"
    - topic: "access model"
      decision: "login required (mechanism TBD downstream); flat user model, no roles"
    - topic: "MVP scope"
      decision: "scoped down to screening reminders only; NFZ queue-watcher and medicine tracker deferred to v2+"
    - topic: "recommendation engine approach"
      decision: "AI-driven analysis of user data from the start (user's explicit choice, accepted extra build cost)"
    - topic: "importance labeling vs priority sorting"
      decision: "simple importance tag (important vs routine) instead of continuous priority-ranking algorithm"
    - topic: "repeat-interval data source"
      decision: "static curated table for v1 (guideline fact), kept separate from AI-driven exam recommendation"
    - topic: "onboarding shape"
      decision: "minimal upfront form + optional follow-up profiling after first recommendations shown"
  frs_drafted: 12
  quality_check_status: accepted
---

# Shape Notes

## Seed idea

> Health screening nudge engine — opt-in reminders + behavioral nudges for eligible free screenings + NFZ queue watcher

## Vision & Problem Statement

In Poland, adults 30+ forget or postpone routine, age-appropriate exams and screenings — no system prompts them at the point when they become eligible, so exams silently lapse and a treatable condition can go undetected until it's more serious. Separately, patients already on an NFZ waiting list for a procedure (commonly multi-year waits, e.g. ~2 years for some surgeries) have no way to learn when an earlier slot opens up from another patient's cancellation, so they wait the full queue length even when a shorter path exists.

Insight not yet articulated — see Open Questions.

## User & Persona

Primary persona: an adult aged 30+ living in Poland, with a busy daily routine and no strict health-tracking habit, who tends to let non-urgent medical appointments (age-eligible screenings, checkups, or a booked procedure) slip without an external prompt. They reach for this product at two distinct moments: (1) when they'd benefit from being told they're now eligible/due for a screening, before it silently lapses, and (2) once they're already on an NFZ waiting list for a procedure, wanting to know as soon as an earlier slot opens up.

Persona scope note: the underlying population is broad ("individuals broadly, across ages/situations") — the above is the representative instantiation used to drive MVP decisions, not a narrowing of who the product ultimately serves.

## Success Criteria

### Primary
- The end-to-end v1 flow works: a user signs up, completes onboarding, receives personalized screening recommendations from their profile data, can mark an exam as already handled (which schedules the next due date by its repeat interval), and receives an opt-in reminder when a screening becomes due.

### Secondary
- Users act on a reminder — i.e. book or attend the suggested exam, not just see the recommendation.

### Guardrails
- Recommendations never state or imply a diagnosis — the app surfaces which screening/exam is due, never a claim of detecting or diagnosing a condition.
- A user's health/profile data is never exposed to another user.

## User Stories

### US-01: User sees prioritized screening recommendations

- **Given** a logged-in user who has completed onboarding with their
  profile data (e.g. age)
- **When** they open their dashboard
- **Then** they see screening recommendations ordered by priority based
  on their profile data, showing which screenings are currently due

#### Acceptance Criteria
- Recommendations are ordered using at least the user's age from onboarding
- A user with no due screenings sees an explanatory empty-state, not a
  blank dashboard

### US-02: User records an appointment and gets reminded as it approaches

- **Given** a user viewing a due screening recommendation
- **When** they select the exam and enter the date of an appointment
  they've booked outside the app
- **Then** the app records that date and sends a reminder as the
  appointment date approaches

#### Acceptance Criteria
- The app does not attempt to book, schedule, or contact any provider —
  only the date is recorded
- The appointment-approaching reminder only fires for users who opted in

### US-03: User confirms an exam happened and gets a future recurrence reminder

- **Given** a user with a recorded appointment date that has passed
- **When** they confirm the exam was executed on that date
- **Then** the exam drops off the "due now" list, and — if it has a
  repeat interval — a future recurrence reminder is scheduled
  automatically, without the user re-entering the exam

#### Acceptance Criteria
- If the exam has no known repeat interval, no reminder is silently
  dropped — the gap is surfaced to the user instead
- The exam reappears as "due" once its repeat interval elapses

## Functional Requirements

### Account & Onboarding
- FR-001: User can create an account. Priority: must-have
  > Socrates: Counter-argument considered: "mandatory accounts mean handling health-adjacent personal data from day one." Resolution: kept; accounts are needed for reminders across sessions. The privacy concern is addressed as an explicit Non-Functional Requirement (see Business Logic & Quality phase), not by removing accounts.
- FR-002: User can log in to an existing account. Priority: must-have
  > Socrates: Counter-argument considered: "if most engagement happens via reminder notifications, login friction for return visits barely matters." Resolution: kept; already compatible with the access model (Login, including passwordless as one option) — the exact mechanism is a downstream decision, not a PRD concern.
- FR-003: User can complete a minimal onboarding profile (e.g. age, sex)
  sufficient to generate initial recommendations. Priority: must-have
  > Socrates: Counter-argument considered: "a long onboarding form before any value is shown risks drop-off." Resolution: revised — split into this minimal upfront form plus optional follow-up profiling after first recommendations are shown (see FR-010).

### Screening recommendations
- FR-004: User can view screening/exam recommendations, tagged by
  importance (e.g. important vs. routine) based on their profile data.
  Priority: must-have
  > Socrates: Counter-argument considered: "priority ordering implies a scoring model that doesn't exist yet, and a mis-ranked list could be worse than an unranked one." Resolution: revised — replaced continuous priority sorting with a simple importance tag/label (e.g. "important" like a prostate exam vs. "routine" like a vitamin D level), avoiding an unproven ranking algorithm.
- FR-005: User can select a recommended exam and record an appointment
  date for it (booked outside the app). Priority: must-have
  > Socrates: Counter-argument considered: "without any booking integration, users may forget to return and enter the date." Resolution: kept, plus mitigated — an explicit nudge is added if the user hasn't logged a date within some days (see FR-011).

### Reminders & recurrence
- FR-006: User can opt in (or out) of receiving reminders. Priority: must-have
  > Socrates: Counter-argument considered: "if reminders are the entire point of the product, offering opt-out could undermine the core value loop from day one." Resolution: kept as originally written — respects user autonomy over health-adjacent notifications.
- FR-007: User receives a reminder as a recorded appointment date
  approaches. Priority: must-have
  > Socrates: Counter-argument considered: "this assumes users reliably enter a future appointment date (FR-005) — if adoption is low, this reminder rarely fires." Resolution: kept; mitigated indirectly by the FR-011 nudge that encourages users to log the date in the first place.
- FR-008: User can confirm that an exam was executed on its appointment
  date. Priority: must-have
  > Socrates: Counter-argument considered: "manual confirmation is fragile — if users forget, the recurrence logic (FR-009) never triggers and the loop silently breaks." Resolution: revised — added a fallback follow-up reminder if not confirmed some time after the appointment date passes (see FR-012).
- FR-009: Confirming an exam was executed automatically schedules the
  next recurrence reminder, if that exam has a repeat interval.
  Priority: must-have
  > Socrates: Counter-argument considered: "this assumes a canonical, correct repeat interval per exam type exists — unclear where that data comes from or how it's validated." Resolution: revised — repeat intervals are sourced from a static curated table for v1 (a guideline fact), kept separate from the AI-driven logic that decides which exam to recommend.
- FR-010: User can optionally provide additional profile data after
  seeing their first recommendations, to refine future recommendations.
  Priority: nice-to-have
- FR-011: User receives a nudge if they selected an exam but haven't
  recorded an appointment date within some days. Priority: must-have
- FR-012: User receives a follow-up reminder to confirm exam completion
  if they haven't confirmed within some time after the appointment date
  passes. Priority: must-have

## Non-Functional Requirements

- A user's health/profile data is never shared with or exposed to any other user or third party without explicit consent.
- The product is accessible entirely through a web browser, with no dedicated native app installation required.
- The product remains usable on the latest two major versions of mainstream desktop and mobile browsers.
- The interface remains fully usable on mobile-sized screens, with no loss of core functionality compared to desktop.
- Core flows are operable via keyboard and compatible with screen readers (baseline accessibility commitment; no formal certification target for v1).

## Business Logic

Given a user's profile, the app determines which health screenings are due, labels each by importance, and keeps reminding the user until each is completed and rescheduled for its next repeat date.

Inputs: the user's onboarding profile data (age, sex, and other health-relevant answers), plus a catalog of screening types with their eligibility criteria, importance level, and repeat interval.

Output: a personalized, importance-labeled list of due screenings, each trackable from recommendation → appointment date → confirmed completion → next due date.

Encounter: the user sees this on their dashboard as prioritized recommendations, and through reminders — as an appointment approaches, if a selected exam's date goes unlogged, and again once the next repeat interval brings an exam back into view.

## Access Control

Login required (email/password, OAuth, or passwordless — exact mechanism is a downstream tech-stack decision, not a PRD concern). Flat user model: every authenticated user has the same capabilities. No admin/member role split for the MVP.

## Non-Goals

- No NFZ queue-watcher in v1 — waitlist polling/alerting for earlier cancellation openings is deferred to v2+.
- No medicine tracker in v1 — medication adherence is a separate domain from screening reminders, deferred to v2+.
- No in-app appointment booking with providers — the app only records a date the user enters; it never books, schedules, or contacts a provider on the user's behalf.
- No multi-tenant / family or shared accounts — single-user-per-account only for v1; no shared household or dependent-tracking profiles.

## Open Questions

1. **What's the insight/differentiator?** — Why hasn't a personal screening-nudge + NFZ-queue-watcher been built already? Owner: user. Block: no (doesn't block MVP scoping, but affects positioning).

## Forward: deferred scope (v2+)

- NFZ queue-watcher (polling/alerting for earlier waitlist openings) — deferred from v1; NFZ's API is confirmed open and usable.
- Medicine tracker (active medications + adherence) — separate domain from screening reminders; deferred from v1.

## Forward: tech-stack

Informational only — NOT part of the PRD schema. Captured here for the downstream tech-stack-selection step.

- User's stated intent: an AI agent analyzes user profile data to generate/personalize exam recommendations, and can also help populate the underlying database of exam types and their metadata (what/when/who should exam).
- Repeat-interval data (per Business Logic resolution) is meant to be a static curated table for v1 — kept separate from the AI-driven recommendation logic.
- NFZ's API is confirmed open and usable (relevant when the deferred queue-watcher is picked back up in v2+).
- Delivery is web-based (no native app install) — already captured as `product_type: web-app` in frontmatter, noted here too since it was volunteered alongside other stack-shaped context.
