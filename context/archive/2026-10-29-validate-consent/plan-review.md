<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Validate the consent version check

- **Plan**: context/changes/validate-consent/plan.md
- **Mode**: Deep (claims verified inline; the change touches one migration, one pgTAP file and the backlog)
- **Date**: 2026-10-29
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

6/6 paths ✓ (F-20 migration, `app_rules.test.sql`, `backlog.md`, `src/lib/consent.ts`, `ci.yml`, follow-up note),
8/8 symbols and line refs ✓ (`not valid` at `:151-153`, header `:23-27`, `plan(35)` at `:7`, assertion at
`:228-231`, `HEALTH_DATA_CONSENT_VERSION` at `consent.ts:10`, `ci.yml:49-54/141/146`, `backlog.md:3/50-52`),
brief↔plan ✓, Progress↔Phase ✓ (1 phase, 4 automated + 2 manual rows match; no checkboxes in the phase body).
Blast radius: no other code or test reads `convalidated`; the only "NOT VALID" mentions outside this change are the
F-20 migration comments (F3) and backlog B-18 (moved by the plan).

## Findings

### F1 — Pre-merge query re-run is not a merge gate, and the risk it guards is mis-stated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Manual Verification 1.5; Migration Notes
- **Detail**: Row 1.5 says the owner re-runs the query "right before merge", but the merge policy is
  `orchestrator-merges-when-green` and the orchestrator skill states that "Manual checks for the human in the PR body
  don't block the merge" (`.claude/skills/dbam-orchestrate/SKILL.md:24`), so auto-merge can land before the owner
  re-runs it. That matters little, because Migration Notes overstate the risk: "a malformed row reaches production
  between the query and the merge". A CHECK constraint, even `NOT VALID`, is enforced for every role on every INSERT
  and UPDATE. Since F-20's migration reached production (#106, 2026-10-28), no malformed row can be written. The only
  exposure was rows written before F-20, and the owner's 2026-10-29 query covered those. Research already says this
  (`research.md:40-43`); the plan's Migration Notes and the brief's Open Risks don't carry it over.
- **Fix**: Rewrite Migration Notes (and the brief's Open Risks) to say that since F-20 the check has refused every new
  malformed value for all roles, so `VALIDATE` can fail only if the constraint was dropped or altered by hand. State
  that 1.5 is a non-blocking extra check under the current merge policy, not a merge gate. Keep the `23514` →
  `migrate` fails → `deploy` skipped → follow-up note §2 remedy. Add that a red `migrate` on `main` also blocks every
  later deploy until it is fixed.
- **Decision**: ACCEPTED — fix as written: row 1.5 is a non-blocking extra check, not a merge gate; Migration Notes and the brief's Open Risks restated (orchestrator, 2026-10-29)

### F2 — Validating on the shared local stack breaks other worktrees' pgTAP run

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 Success Criteria 1.1–1.3; Implementation Approach
- **Detail**: Local Supabase is shared by every worktree (worker protocol; `feat-reminders-runner` is live). After
  gate 1.1 (`npx supabase migration up`), the shared database holds the validated constraint. Every worktree based on
  `main` still has `app_rules.test.sql:228-231` expecting `convalidated = false`, so its `npx supabase test db` fails
  that assertion until this PR lands and the branch merges `origin/main`. Earlier additive migrations never asserted
  their own absence, so this side effect is new to this change, and the plan doesn't mention it. Two smaller effects
  of the same shared state: gate 1.3 (`npm run db:types` + `git diff --exit-code`) also fails if another worktree has
  applied a schema migration of its own to the stack. And `migration up` refuses an out-of-order migration (needs
  `--include-all`) if another worktree has already applied a later-timestamped one.
- **Fix A ⭐ Recommended**: Note it and tell people. Add a line to the Implementation Note: after the gates, the
  shared stack keeps the validated constraint. The worker logs this in `decisions.md` and in the final report, so the
  orchestrator can warn other workers that this one assertion fails until they merge `main`. If gate 1.3 shows a diff
  outside this change, check what other worktrees applied before treating it as red.
  - Strength: No extra SQL against the shared stack; the stage-7 rerun of `supabase test db` (orchestrator skill
    stage 7 prompt) still finds the migration applied; the window closes as soon as the PR lands.
  - Tradeoff: Other workers may see one red pgTAP assertion in the meantime and have to read the note.
  - Confidence: HIGH — follows from the assertion text and the shared-stack rule.
  - Blind spot: Whether another worktree runs `supabase test db` during the window is not known.
- **Fix B**: After the gates (still under the lock), restore the stack to `main`'s state: drop the constraint, re-add
  it `not valid`, and delete this migration's row from `supabase_migrations.schema_migrations`.
  - Strength: Other worktrees never see the side effect.
  - Tradeoff: Hand-written SQL against the shared stack. It must be redone before every later local
    `supabase test db` in this change (impl-review, PR stage). Getting it wrong leaves the stack in a state no branch
    matches.
  - Confidence: MED — the restore is simple but easy to forget on reruns.
  - Blind spot: The CLI's reaction to a removed `schema_migrations` row on the next `migration up` has not been
    tested.
- **Decision**: FIX A — noted in the Implementation Note; the worker logs the shared-stack effect in `decisions.md` and in its final report (orchestrator, 2026-10-29)

### F3 — The F-20 migration comments still say NOT VALID after this lands

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 §1 Migration (header intent); What We're NOT Doing
- **Detail**: The plan rightly leaves `20261028131057_app_rule_checks.sql` alone. Its header (`:23-27`) and section
  comment (`:148`) will still say the check is `NOT VALID`, and `src/lib/consent.ts:9` and `src/lib/consent.test.ts:6`
  send readers to that file. Nothing there points to the new migration, so a reader following the pointer gets
  outdated information.
- **Fix**: In the new migration's header, name the F-20 comment lines it supersedes
  (`20261028131057_app_rule_checks.sql:23-27, :148`). Optionally, extend the `consent.ts:9` comment to name both
  migrations. That would be a comment-only app edit, so the plan's "no app code change" line would need to allow it.
- **Decision**: ACCEPTED (both parts) — the new migration's header names `app_rule_checks.sql:23-27, :148`; the `src/lib/consent.ts` comment names both migrations, a comment-only app edit the plan now allows (orchestrator, 2026-10-29)
