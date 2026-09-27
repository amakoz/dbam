# Plan: Turn roadmap.md (M-01) into GitHub issues

## Context

`context/foundation/roadmap.md` (M-01 "First screening loop") is the backlog, but it
only exists as markdown. The user wants it as GitHub issues in `amakoz/dbam` so the work
can be tracked there. Repo state checked read-only: 0 issues, 0 milestones, default
labels only; `gh` token has `repo` scope (no `project` scope → no Projects board, but
milestones, labels and issue dependencies work). PR #16 is merged, so `main` has the
current roadmap (v3, prd_version 2).

User decisions: create **9 work issues + 3 open-question issues**, and **link issue
numbers back into roadmap.md via a small PR**.

## Approach

### 1. Grouping and labels (idempotent: skip if they exist)
- GitHub milestone **`M-01: First screening loop`**, description = milestone Intent + "Done when" line.
- New labels: `foundation` (F-NN), `slice` (S-NN). Open questions use existing `question`.
- No status labels — status lives in roadmap.md (downstream skills flip it there); labels would drift.

### 2. Generate issue bodies from roadmap.md (no hand-copying)
A Python script in the scratchpad parses roadmap.md on `main`:
- `### F-NN:` / `### S-NN:` blocks → fields (Outcome, Change ID, PRD refs, Unlocks,
  Prerequisites, Parallel with, Blockers, Unknowns, Risk).
- `## Backlog Handoff` table → issue titles.
- `## Open Roadmap Questions` → 3 question issues.

**Title:** `[S-01] Onboarding: health-data consent and minimal profile` (roadmap ID prefix + handoff title).

**Work-issue body:**
```
**Outcome:** <outcome>
**Change ID:** `<change-id>` → start with `/10x-plan <change-id>`
**PRD refs:** …
**Blocked by:** #N, #M   (or "—")        ← roadmap Prerequisites, as issue links
**Unlocks:** …   (foundations only)
**Parallel with:** #…
**Unknowns:** …
**Risk:** …
Source: context/foundation/roadmap.md (M-01, <ID>) — the roadmap stays the source of truth for status.
```
**Question-issue body:** question text, owner, what it gates, link to roadmap section.

### 3. Create in dependency order
Order: F-01, F-02, S-01 … S-07, then Q1–Q3. Topological order guarantees every
prerequisite already has an issue number when its dependent is created, so
"Blocked by #N" is filled in at creation.
`gh issue create --title … --body-file … --label … --milestone "M-01: First screening loop"`;
record `ID → issue number` in a map file.

### 4. Native dependencies (best effort)
For each Prerequisites edge, call the issue-dependencies REST API
(`POST repos/amakoz/dbam/issues/{n}/dependencies/blocked_by` with the blocker's
issue `id`). If the endpoint is unavailable, skip silently — the "Blocked by #N" text
already carries the link. Report which path was used.

### 5. Dry run first
Before creating anything, print all 12 titles + bodies to the terminal for a sanity
check; then run for real. Guard against duplicates: skip creation if an open issue
with the same `[ID]` title prefix already exists.

### 6. Back-link PR
- New branch `docs/roadmap-issue-links` from `origin/main`.
- `context/foundation/roadmap.md`:
  - `## Backlog Handoff` Notes column: prepend issue link, e.g. `#17 · Run /10x-plan screening-catalog-v1`.
  - `## Open Roadmap Questions`: append `(#NN)` to each question.
  - Fix leftovers: header note "`prd.md` (v1)" → "(v2)"; S-02 empty `Unknowns:` → `Unknowns: —`.
- Commit, push, open PR, watch checks with `gh run watch <run-id>` in the background
  (no unbounded until-loop). Stop at "checks green" — user merges.

## Critical files
- `context/foundation/roadmap.md` (read for generation; edited in the back-link PR)
- Scratchpad script: `…/scratchpad/roadmap_to_issues.py` (not committed)

## Verification
- `gh issue list --milestone "M-01: First screening loop" --state open` → 12 issues (9 work + 3 questions).
- Spot-check S-06: body shows "Blocked by" links to S-04 and S-05 issues; dependency panel shows them if the API path worked.
- `gh api repos/amakoz/dbam/milestones` → milestone with 12 open issues.
- Back-link PR: roadmap.md diff touches only Notes cells, question lines, and the two leftovers; `ci` + `smoke` pass.
