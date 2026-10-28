# Merge rule in CLAUDE.md — Plan Brief

> Full plan: `context/changes/merge-rule-docs/plan.md`

## What & Why

Make `CLAUDE.md` state the temporary rule that the orchestrator merges green PRs to `main`, and how the owner switches back to human-only. Today it says merging is human-only, which contradicts what the orchestrator does since 2026-10-06 and misleads any agent that reads only `CLAUDE.md`.

## Starting Point

`CLAUDE.md:11` carries the human-only bullet. The setting lives in the gitignored `.claude/orchestra/merge-policy`; the orchestrator lands PRs through a land script that arms GitHub auto-merge (squash).

## Desired End State

The same bullet names who may merge (orchestrator only, via the land script, only while the setting says `orchestrator-merges-when-green`), keeps workers and other agents barred from `gh pr merge`, and tells the owner how to switch back. The deploy and Workers Builds sentences are unchanged.

## Key Decisions Made

| Decision       | Choice                                   | Why (1 sentence)                                            |
| -------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Research       | Skipped                                  | One bullet in one file, content facts given.                |
| Complexity     | LOW, 0 questions, one phase              | Nothing left to decide; one rollback unit.                  |
| Where          | Edit the existing bullet, no new section | Keeps `CLAUDE.md` short, as asked.                          |
| Orchestrator   | Bound to the land script                 | The exception must not read as a licence for `gh pr merge`. |
| Roadmap status | Untouched                                | `/10x-archive` sets `done`; avoids table realign conflicts. |

## Scope

**In scope:** the one hard-rule bullet in `CLAUDE.md`.

**Out of scope:** `roadmap.md`, the land script, the policy file, `.claude/settings.json`, other docs.

## Architecture / Approach

Rewrite the bullet: default rule and worker ban first, then the temporary exception with date, setting file and land-script constraint, then the switch-back, then the existing deploy sentences verbatim.

## Phases at a Glance

| Phase                            | What it delivers                  | Key risk                                  |
| -------------------------------- | --------------------------------- | ----------------------------------------- |
| 1. Rewrite the merge-rule bullet | New bullet wording in `CLAUDE.md` | Wording that loosens the rule for workers |

**Prerequisites:** none.
**Estimated effort:** one short session.

## Open Risks & Assumptions

- Assumes the setting file name and values given by the owner are final.

## Success Criteria (Summary)

- An agent reading only `CLAUDE.md` knows workers never merge and the orchestrator merges only under the setting, via the land script.
- Switching back is two steps the owner can read in the same bullet.
