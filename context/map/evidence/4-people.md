# Evidence: people

- Window: whole history, 2026-09-24 .. 2026-10-27 (61 commits, 0 merges, squash-merged PRs). Noise filter from `.work/noise.txt` applied; 821 counted file changes.
- **humans_in_window = 1** (`evidence`): one person, Amadeusz Kozłowski, under two git identities. Display names "Amadeusz Kozłowski" (57 commits as author) and "Amadeusz Kozlowski" (4 as author, all on 2026-09-24..26: scaffold, infra doc, CLAUDE.md, wrangler flag; plus 55 human `Co-authored-by` trailers). Same name, different e-mail domains, and the second identity co-signs the first one's commits, so they are merged here. No `.mailmap`. On the forge both map to the login `amakoz`.
- **Baseline (false-signal rule 6)**: with one human, 100 % single-person ownership of every capability is the baseline, not a finding. Bus-factor language does not apply here and is not used.
- Agents: 56/61 commits carry an AI `Co-authored-by` trailer (Claude Opus 5.5 / Sonnet 5.5). They stay human commits (the human steered the change). Agents are never counted as people (rule 7). Bots: 0.
- Forge (`gh`, read-only): 58 PRs. 57 merged, all authored and merged by `amakoz`. **0 reviews, 0 review requests, 0 assignees** on any PR. The only PR comments are 1 from `amakoz` and 1 from the `cloudflare-workers-and-pages` integration, which is automation and not review. No CODEOWNERS, MAINTAINERS or OWNERS file in `git ls-files`.
- One outside account (`georgeatparallel`) opened PR #87, "Add Parallel Search MCP to the catalog drafting agent", on 2026-10-18. It touched `scripts/catalog/*`, `catalog/README.md` and `package.json`, and was closed unmerged on 2026-10-27 with no review recorded (`evidence`). It is not in git history and not counted as a team member.

## People per capability

Areas: every capability rated high or medium, plus the top 5 by counted changes (platform 84, catalog-curation 61, accounts 48, shared 45, reminders 42). All are already high or medium, so the top 5 adds no area. Docs (374 changes) is prose (rule 8) and is listed only for completeness. Localisation (low criticality, 31 changes) is left out.

| Capability (crit.)        | Commits / changes | People                                                               | Topic groups (from subjects + touched paths)                                                                                                                                                                                                                                                 | Active period       |
| ------------------------- | ----------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| accounts (high)           | 9 / 48            | Amadeusz Kozłowski (8), same person under 2nd identity (1, scaffold) | starter auth scaffold; confirmation-email callback `/api/auth/callback` (#14); auth error codes and pages touched by onboarding review fixes (#37); auth UI redesign (#69); failure logging (#81). Paths: `src/components/auth`, `src/pages/api/auth`, `src/pages/auth`, `src/middleware.ts` | 09-24 .. 10-06      |
| onboarding-consent (high) | 7 / 28            | Amadeusz Kozłowski (7)                                               | health-data schema + migration (#30); consent, onboarding, profile edit, withdrawal (#35); implementation-review fixes (#37); reminders opt-in on profile (#66); redesign (#69). Paths: `src/pages/api/consent`, `src/lib/consent.ts`, `src/components/profile`                              | 09-27 .. 10-06      |
| recommendations (high)    | 16 / 41           | Amadeusz Kozłowski (15), 2nd identity (1, scaffold)                  | catalog rule engine (#44, #45); tiered dashboard + "may apply" + owner review gate (#50); dashboard redesign (#64, #73); catalog-rule unit tests (#77); redirect privacy (#85). Paths: `src/lib/catalog`, `src/components/recommendations`, `src/pages/dashboard.astro`                      | 09-24 .. 10-06      |
| exam-records (high)       | 9 / 37            | Amadeusz Kozłowski (9)                                               | plan / mark done (#59); confirm passed appointment + next due date (S-05, #75); recurrence-rule unit tests (#79); slug out of redirect URLs (#85); due-screening reminders hook-in (#84). Paths: `src/lib/screenings`, `src/components/recommendations/*Item`, `supabase/tests/database`     | 09-30 .. 10-06      |
| reminders (high)          | 7 / 42            | Amadeusz Kozłowski (7)                                               | cron heartbeat dispatch path (F-02, #48, #53); appointment reminder (S-04, #66); due-screening emails (S-06, #84); follow-up nudges (S-07, #86); failure email (#81). Paths: `src/lib/reminders`, `src/worker.ts`, `src/lib/email.ts`                                                        | 09-29 .. 10-06      |
| catalog-curation (high)   | 3 / 61            | Amadeusz Kozłowski (3)                                               | catalog v1 schema, tooling, drafting script, first entry batch (#44); review fixes (#45); owner review gate (#50). Paths: `catalog/entries/*.json`, `catalog/entry.schema.json`, `scripts/catalog`                                                                                           | 09-28 .. 09-29 only |
| platform (high)           | 33 / 84           | Amadeusz Kozłowski (31), 2nd identity (2: scaffold, wrangler flag)   | deploy pipeline and smoke (#8–#13, #36); CI and tooling gates (#77, #78, #80, #83). Paths: `.github/workflows/ci.yml`, `scripts/smoke.mjs`, `package.json`, `eslint.config.js`                                                                                                               | 09-24 .. 10-06      |
| ops-alerting (medium)     | 9 / 16            | Amadeusz Kozłowski (8), 2nd identity (1, scaffold)                   | heartbeat + config status (F-02); Workers Logs error tracking + failure email (F-07, #81). Paths: `src/lib/{heartbeat,config-status,observability}.ts`                                                                                                                                       | 09-24 .. 10-06      |
| shared (medium)           | 16 / 45           | Amadeusz Kozłowski (15), 2nd identity (1, scaffold)                  | UI primitives and layout for the theme-A redesign (#64, #69); PostgREST "JWT issued at future" retry (#72); DB-types regeneration with each migration (mechanical, lockstep). Paths: `src/components/ui`, `src/lib/database.types.ts`, `src/layouts`                                         | 09-24 .. 10-06      |
| docs (prose)              | 59 / 374          | Amadeusz Kozłowski (55), 2nd identity (4)                            | PRD, roadmap, change archives, test plan                                                                                                                                                                                                                                                     | 09-24 .. 10-27      |

All code work in the business capabilities stops on 2026-10-06. The two later commits (2026-10-27, #88 and #89) are docs only (`evidence`).

## Concentration

**Small team: concentration is the baseline.** One human authored 100 % of the commits in every capability, so no capability is concentrated relative to the team.

Every capability has only ever been touched by this one person. That is all twelve buckets, including catalog-curation, which has only 3 commits, all on 2026-09-28..29. Cross-cutting note: most commits per capability touch more than 3 capabilities (for example reminders 7/7, localisation 13/13). Feature PRs here are vertical slices, so per-capability topic lists overlap.

## Agent co-authorship

Context only, not a filter. Share of each capability's commits that carry an AI `Co-authored-by` trailer:

| Capability                                                                  | Agent co-authored |
| --------------------------------------------------------------------------- | ----------------- |
| exam-records, reminders, onboarding-consent, catalog-curation, localisation | 100 %             |
| recommendations, platform, shared                                           | 94 %              |
| accounts, ops-alerting                                                      | 89 %              |
| public-site                                                                 | 75 %              |
| docs                                                                        | 92 %              |

Below 100 % only because of the four second-identity commits from the first three days and one archive move (#71) (`evidence`). Inference: since 2026-09-26 every code change is human-steered, agent-written work (the repo's own orchestrator/worker workflow). The PR history therefore records intent in plan, research and review files under `context/`, not in reviewer discussion.

## Implications

- `inference`: there is only one person to ask about every capability, the repository owner. Before a change, read that owner's change folders instead of looking for a second opinion:
  - **reminders**: `context/archive/*follow-up-nudges*`, `*appointment-reminder*`, `*reminder-dispatch*` (PRs #48, #53, #66, #84, #86).
  - **exam-records**: PRs #59, #75, #79, #85.
  - **onboarding-consent**: PRs #30, #35, #37 (#37 is the review-findings fix).
  - **catalog-curation**: PRs #44, #45, #50, and the closed outside PR #87 as an earlier, rejected attempt at changing the drafting agent.
  - **accounts**: #14.
  - **platform/deploy**: #8–#13, #36.
- `inference`: "somebody already tried this" can be found only in archived plans and reviews under `context/archive/` (discussion evidence), not in PR reviews. There are none.

## Unknowns

- `unknown`: **no second maintainer.** Nobody besides the single owner has authored, reviewed or merged code, so nobody else can be asked.
- `unknown`: **no reviewer.** All 57 merged PRs were self-merged with 0 formal reviews. Agent impl- and plan-reviews exist as files, but they are not people (rule 7).
- `unknown`: **no domain or medical owner for catalog content.** Screening entries (medical guidance, high criticality) were written in 3 commits by the same person through an agent drafting script. Subject #50 names an "owner review gate", but who signs off medical correctness, and with what qualification, is not visible in git or on the forge.
- `unknown`: **no formal ownership.** There is no CODEOWNERS, no `.mailmap` and no PR assignees.
- `unknown`: whether the second git identity (work-domain e-mail) means a separate employer or organisational context with its own access or ownership rights.
- `unknown`: whether the owner is still active on code. The last code commit was on 2026-10-06; since then there are docs commits only (to 2026-10-27).

## Commands run

- `node <scratchpad>/people.mjs .work/capabilities.tsv .work`: parses `.work/git-log.txt`, applies `noise.txt` and `attribute.mjs`, and writes `.work/people-commits.tsv`, `.work/people-summary.tsv` and `.work/people-subjects.txt`.
- `grep -v '^@' .work/git-log.txt | … | grep -v -E -f noise.txt | node attribute.mjs capabilities.tsv | …`: writes `.work/people-paths.txt` (top paths per capability).
- `git -c core.quotepath=off ls-files | grep -iE 'codeowners|maintainers|\.mailmap|owners'`: no match.
- `gh pr list -R amakoz/dbam --state all --json number,state,author,mergedBy,reviews,reviewRequests,assignees`: writes `.work/people-prs.json`.
- `gh pr list -R amakoz/dbam --state closed --author georgeatparallel --json …`: writes `.work/people-external-pr.json`.
- `gh pr list -R amakoz/dbam --state all --json number,comments`: counts comment authors.
