# Decisions — merge-rule-docs

## 2026-10-28 Skip research, no interview

- Question: run /10x-research and the planning interview?
- Options: (a) full chain; (b) skip research (one file), plan with no questions.
- Choice: (b). The change edits one bullet in `CLAUDE.md`; the orchestrator's prompt fixed the content facts, so no solution decision is open.
- Evidence: `grep` finds the "human-only" merge rule only in `CLAUDE.md:11` outside historical change folders and `roadmap.md`.
- decided-by: orchestrator

## 2026-10-28 Complexity LOW, 0 questions, one phase

- Question: complexity, question budget and phase split.
- Options: LOW / MEDIUM; 0–6 questions; one or two phases.
- Choice: LOW, 0 questions (settled-input exception: the prompt resolves every material decision), one phase (one bullet, one rollback unit).
- decided-by: worker (delegated by the orchestrator)

## 2026-10-28 Roadmap status left alone

- The plan skill would flip F-18 to `planning`; the worker protocol forbids touching `roadmap.md` status during plan or implement. `/10x-archive` sets `done`.
- decided-by: orchestrator

## 2026-10-28 Wording

- The edited bullet keeps "never run `gh pr merge`" for workers and every agent other than the orchestrator, adds the temporary rule with its start date, the gitignored setting file, the land-script-only constraint and the switch-back step, and keeps the deploy and Workers Builds sentences verbatim.
- The orchestrator is bound to the land script too: the rule does not license a direct `gh pr merge`.
- decided-by: worker

## 2026-10-28 Gate 1.3 compared against HEAD, manual rows self-verified

- Local `main` is stale (3cdd464), so `git diff --stat main` showed 5+/3- lines of unrelated drift. Compared against `HEAD` instead: `CLAUDE.md | 1 insertion, 1 deletion`, the one bullet.
- The orchestrator said to implement without asking, so the worker checked manual rows 1.4 and 1.5 itself: the new bullet names who merges (orchestrator, land script), when (policy file value, missing file = human-only), that workers and other agents never run `gh pr merge`, and the switch-back; it is about 700 characters. impl-review can overrule.
- decided-by: worker
