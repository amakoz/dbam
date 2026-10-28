# Merge rule in CLAUDE.md Implementation Plan

## Overview

Roadmap F-18 (M-03, backlog B-03). Since 2026-10-06 the owner, with production still a test environment, lets the orchestrator merge PRs to `main` through its land script. `CLAUDE.md` still says "Merging PRs to `main` is human-only", so an agent reading only `CLAUDE.md` gets a stale rule. This change rewrites that one hard-rule bullet.

## Current State Analysis

- `CLAUDE.md:11` holds the only live statement of the rule: human-only, never `gh pr merge`, then the deploy-on-merge and Workers Builds sentences.
- The merge-policy setting lives in the gitignored `.claude/orchestra/merge-policy` (`orchestrator-merges-when-green`; a missing file means human-only). The orchestrator's land script arms GitHub auto-merge (squash), so a merge happens only when the required checks `ci` and `smoke` pass.
- Workers and other agents are separately bound by the worker protocol never to run `gh pr merge`.

## Desired End State

`CLAUDE.md` states, in the same bullet: who may merge and how (orchestrator, land script, only while the setting says so), that workers and all other agents still never run `gh pr merge`, where the setting lives, and how the owner switches back. The deploy and Workers Builds sentences are unchanged. `CLAUDE.md` grows by a few lines at most.

### Key Discoveries:

- `CLAUDE.md:11` is the only place to edit; other mentions are history (`context/changes/deployment/deployment-plan.md:482`, `context/domain/evidence/1-docs-language.md:375`) or roadmap text.
- `.claude/*` is gitignored except `settings.json` (`git check-ignore` hit `.gitignore:31`), so the policy file cannot be committed; the docs must name it, not ship it.

## What We're NOT Doing

- No change to `roadmap.md` status, the land script, the policy file, `.claude/settings.json` or the worker protocol.
- No new section in `CLAUDE.md`; no edit to any other bullet.
- No re-wording of the deploy or Workers Builds sentences.

## Implementation Approach

Rewrite the single bullet: keep a short rule up front (workers and other agents never run `gh pr merge`), add the temporary orchestrator exception in the same bullet, keep the tail sentences verbatim.

## Phase 1: Rewrite the merge-rule bullet

### Overview

One edit to `CLAUDE.md`, one commit.

### Changes Required:

#### 1. Merge hard rule

**File**: `CLAUDE.md`

**Intent**: Replace the "Merging PRs to `main` is human-only" bullet so it states the temporary orchestrator rule and the switch-back, without loosening the rule for workers and other agents.

**Contract**: The bullet still opens the merge rule under "Hard rules" and keeps the deploy sentence ("A merge to `main` deploys to production automatically once `ci` + `smoke` pass on `main` (… no approval step); Cloudflare Workers Builds is disconnected, so never reconnect it.") character-for-character. It must say:

- default is human-only; workers and every agent other than the orchestrator never run `gh pr merge`: open the PR, report check status, stop;
- since 2026-10-06, while production is a test environment, and only when `.claude/orchestra/merge-policy` (gitignored) reads `orchestrator-merges-when-green`, the orchestrator may land green PRs, only through its land script, which arms GitHub auto-merge (squash) so the merge happens once `ci` + `smoke` pass; a missing file means human-only;
- to switch back, the owner sets the file to `human-only` and reverts this wording once production is ready for users.

### Success Criteria:

#### Automated Verification:

- Prettier accepts the file: `npx prettier --check CLAUDE.md`
- The deploy and Workers Builds sentences are unchanged: `git diff -U0 CLAUDE.md` shows them only as unchanged text inside the rewritten line (checked by eye against the old bullet), and `grep -c "Cloudflare Workers Builds is disconnected, so never reconnect it" CLAUDE.md` prints 1
- Only the one bullet changed: `git diff --stat main -- CLAUDE.md` shows `CLAUDE.md` as the only changed tracked file besides `context/changes/merge-rule-docs/`

#### Manual Verification:

- A reader who sees only `CLAUDE.md` can tell who may merge, when, how, that workers still may not, and how to switch back
- The bullet is no more than about six lines long in the rendered file

---

## Testing Strategy

Docs only; no unit tests. Prettier is the only automated gate (it also runs in lint-staged on commit).

## References

- Backlog B-03 in `context/foundation/backlog.md`; roadmap F-18 in `context/foundation/roadmap.md:102`
- Decisions: `context/changes/merge-rule-docs/decisions.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rewrite the merge-rule bullet

#### Automated

- [x] 1.1 Prettier accepts the file: `npx prettier --check CLAUDE.md` — f4d8d17
- [x] 1.2 The deploy and Workers Builds sentences are unchanged: `grep -c "Cloudflare Workers Builds is disconnected, so never reconnect it" CLAUDE.md` prints 1 — f4d8d17
- [x] 1.3 Only the one bullet changed: `git diff --stat main -- CLAUDE.md` shows `CLAUDE.md` as the only changed tracked file besides `context/changes/merge-rule-docs/` — f4d8d17

#### Manual

- [x] 1.4 A reader who sees only `CLAUDE.md` can tell who may merge, when, how, that workers still may not, and how to switch back — f4d8d17
- [x] 1.5 The bullet is no more than about six lines long in the rendered file — f4d8d17
