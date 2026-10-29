# Decisions: validate-consent

## 2026-10-29 Research scope

- **Question:** dispatch research sub-agents?
- **Options:** (a) none, local reads; (b) 2 sub-agents.
- **Choice:** (a). The change touches one migration, one pgTAP file and the backlog.
- **Evidence:** `research.md` Summary.
- **Decided by:** orchestrator

## 2026-10-29 Planning complexity and question budget

- **Question:** complexity level and number of planning questions.
- **Options:** LOW with 0 questions (settled-input exception); LOW with 3–5 questions.
- **Choice:** LOW, 0 questions. The follow-up note fixes the SQL statement and the assertion to flip, the owner's
  production query returned zero rows on 2026-10-29, and research left no open question.
- **Evidence:** `context/archive/2026-10-28-db-check-constraints/follow-ups/validate-consent.md` §3; `research.md`
  Open Questions (one owner step only).
- **Decided by:** worker (delegated by orchestrator)

## 2026-10-29 Phase split

- **Question:** how many phases?
- **Options:** (a) one phase: migration + pgTAP flip + backlog; (b) two phases: database, then backlog.
- **Choice:** (a). The migration and the assertion flip must land in one commit (the old `convalidated = false`
  assertion fails once the migration exists), and the backlog edit is one paragraph.
- **Evidence:** `supabase/tests/database/app_rules.test.sql:228-231`.
- **Decided by:** worker (delegated by orchestrator)

## 2026-10-29 Backlog B-18

- **Question:** remove B-18 or move it to Done?
- **Options:** (a) delete the P2 entry; (b) delete it from P2 and add a Done line with a pointer.
- **Choice:** (b), as the backlog header asks ("move it to **Done** with a pointer", `context/foundation/backlog.md:3`).
  It ships in this change's phase commit, not in the archive commit.
- **Evidence:** `context/foundation/backlog.md:3`, `:50-52`, `:74-92`.
- **Decided by:** orchestrator (ship in this change), worker (format)

## 2026-10-29 Production checks

- **Question:** where do the production steps go?
- **Choice:** the PR's "Manual checks for the human": the owner re-runs the read-only query right before merge
  (follow-up note §3), and checks that the `migrate` job on `main` passes after merge. Neither is a local gate.
- **Decided by:** orchestrator

## 2026-10-29 Plan review triage (`plan-review.md`, verdict SOUND)

- **F1 (warning) pre-merge query re-run is not a merge gate:** accepted as written. Row 1.5 is a non-blocking extra
  check under `orchestrator-merges-when-green`; Migration Notes and the brief's Open Risks now say that since F-20 the
  check refuses every new malformed value for all roles, so `VALIDATE` can fail only if the constraint was dropped or
  altered by hand, and that a red `migrate` on `main` blocks every later deploy.
- **F2 (warning) shared local stack keeps the validated constraint:** Fix A. Options: (A) note it and report it;
  (B) restore the stack to `main`'s state by hand after each gate run. A chosen: no hand-written SQL against the
  shared stack, and the window closes when the PR lands. The Implementation Note now says so; the worker logs the
  effect here and in its final report at implement time.
- **F3 (observation) stale F-20 comments:** both parts accepted. The new migration's header names
  `20261028131057_app_rule_checks.sql:23-27` and `:148`; the comment above `HEALTH_DATA_CONSENT_VERSION` in
  `src/lib/consent.ts` names both migrations (comment-only app edit, now allowed in What We're NOT Doing).
- **Decided by:** orchestrator

## 2026-10-29 Shared local stack keeps the validated constraint (plan review F2)

- **Question:** the gates applied the new migration to the shared local Supabase; what about other worktrees?
- **Options:** (A) note and report it; (B) restore the stack by hand after the gate run.
- **Choice:** (A). Until this PR lands, any other worktree still on `main`'s `app_rules.test.sql` fails the one
  `convalidated = false` assertion in `npx supabase test db`; it clears after that worktree merges `origin/main`.
- **Evidence:** gates 1.1–1.3 ran green on 2026-10-29; `migration up` applied `20261029172839` cleanly, types unchanged.
- **Decided by:** orchestrator (plan review), worker (logged)

## 2026-10-29 Deliberate-break check skipped

- **Question:** run the deliberate-break check for the flipped assertion?
- **Choice:** skipped. Breaking it means un-validating the constraint on the shared stack by hand SQL (rejected in
  F2). The assertion reads the same `convalidated` query that `main` pinned as `false` before the migration, so it
  flips with the migration by construction.
- **Decided by:** worker
