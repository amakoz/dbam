# Evidence: discussion

Sources: `gh` read-only for amakoz/dbam (58 PRs, 31 issues, all comments) + git (`.work/git-log.txt`, 61 counted commits) + planning prose under `context/`. Window: whole history, 2026-09-24 .. 2026-10-27 (~5 weeks). No limits hit (one page each, < 100 items). Humans in window: 1 (team-size baseline, rule 6). PR→capability attribution is through squash subjects `(#N)` → files in the git log → `attribute.mjs` after `noise.txt`; docs files excluded from the code columns. Raw output: `.work/discussion-prs.json`, `discussion-issues.json`, `discussion-commits.tsv` (+ `.mjs`), `discussion-buzz.txt`, `discussion-prose-churn.txt`, `discussion-markers.txt`, `discussion-pr87.json`.

## Buzz per capability

PRs = merged PRs whose commit touches the capability's code (cross-cutting counted for every capability, contract rule). X = commits touching > 3 capabilities. Fix PRs = subject matches the contract's fix keywords; "own" = the fix was about this capability (rule 12), "spill" = brushed by another capability's fix. Plans = change folders (archive + changes) named for the capability. Agent-review flags = `NEEDS ATTENTION`/`REVISE` verdicts in `reviews/*` (agent output, not human review). Human review, reverts and debt markers are 0 for every row, so they are not repeated as columns.

| Capability         | PRs | X share | Fix PRs own / spill                | Issues opened / open                | Plans (change folders)                                                                                                          | Agent-review flags                                    | Label                           |
| ------------------ | --- | ------- | ---------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| platform           | 31  | 16/33   | 1 (#36) / 3                        | 0 / 0                               | 5: deployment, agent-stop-hook, ui-verification-script, agent-docs-mcp, bootstrap-verification                                  | 3 (stop-hook plan; ui-verification plan + impl)       | evidence; mechanical, see below |
| shared             | 15  | 14/16   | 2 (#72, #65) / 1                   | 2 / 0 (#60, bug #68)                | 1 (ui-refactor) + continue-ui-redesign                                                                                          | 1 (ui-refactor impl)                                  | evidence                        |
| recommendations    | 15  | 13/16   | 0 / 2                              | 4 / 0                               | 3: screening-recommendations, unit-test-suite, dashboard-tier-polish (still in `changes/`)                                      | 0 (screening-recommendations has no impl-review file) | evidence                        |
| localisation       | 13  | 13/13   | 0 / 2                              | 1 / 0                               | 0 dedicated (S-01 phase 1)                                                                                                      | 0                                                     | evidence; mechanical hub        |
| exam-records       | 9   | 7/9     | 0 / 1                              | 5 / 0                               | 4: record-appointment-date, confirm-exam-and-recurrence, recurrence-unit-tests, redirect-query-privacy                          | 1 (confirm-exam impl)                                 | evidence                        |
| accounts           | 8   | 8/9     | 0 / 1                              | 1 / 0                               | 1 (auth-ui-redesign) + continue-ui-redesign                                                                                     | 0 (no impl-review file)                               | evidence                        |
| ops-alerting       | 8   | 7/9     | 1 (#53, shared with reminders) / 0 | 2 / 1 (both shared with reminders)  | 2: error-tracking, reminder-dispatch-path (shared)                                                                              | 1 (error-tracking plan)                               | evidence                        |
| reminders          | 7   | 5/7     | 1 (#53) / 0                        | 5 / 3                               | 4: reminder-dispatch-path, appointment-reminder, due-screening-reminder, follow-up-nudges; + 2 roadmap items ahead (F-12, F-13) | 3 (due-screening plan + impl; follow-up-nudges plan)  | evidence                        |
| onboarding-consent | 7   | 7/7     | 1 (#37) / 0                        | 5 / 0                               | 1 (onboarding-profile) + continue-ui-redesign                                                                                   | 1 (onboarding impl)                                   | evidence                        |
| catalog-curation   | 3   | 2/3     | 1 (#45) / 0                        | 6 / 2 (#42, #28)                    | 1 (screening-catalog-v1)                                                                                                        | 1 (catalog impl)                                      | evidence                        |
| public-site        | 3   | 4/4     | 0 / 1                              | 2 / 0                               | continue-ui-redesign (shared)                                                                                                   | 0                                                     | evidence                        |
| unattributed       | —   | —       | —                                  | 2 / 2 (#26, #27: product questions) | —                                                                                                                               | —                                                     | evidence                        |

Issue → capability mapping is by title vocabulary (roadmap ids S-0x/F-0x and `[UI]` subjects); inference where an issue spans two capabilities (#18, #57 → reminders + ops-alerting; #60 → shared + recommendations; #62 → accounts + public-site).

## Friction

- **No human review anywhere** (evidence). 58 PRs, 0 reviews; 2 PR comments total — a Cloudflare preview bot on #6 and the owner's screenshots on #64. Issue comments: 25, all by the owner. Median PR open time 0.12 h (7 min), p90 3.8 h; only #65 (111.5 h) and #66 (10.9 h) stayed open longer. PRs are a merge mechanism here, not a discussion venue; the discussion lives in `context/` prose and agent review files.
- **Reverts and hotfixes: 0** in all 61 subjects (evidence). The only "rollback" subject is a planned drill (#11).
- **One bug ever labelled:** #68 "JWT issued at future" (500 on /dashboard after idle), opened and fixed same day by #72 (`shared`, Supabase client retry). Open bugs: 0 (evidence).
- **Second attempts = the review-fix PR that follows each feature** (evidence; inference: this is the 10x workflow, not breakage):
  - onboarding-consent: #30 → #35 → #37 "address full implementation review (withdrawal hardening, GDPR fixes)" (+519/-73) → #38, in 2 days. Largest own fix in the repo by lines; touches the consent-withdrawal path.
  - catalog-curation: #44 → #45 "implementation review fixes" (+996/-34) → #46 → #47.
  - reminders/ops-alerting: #48 → #52 → #53 "close out, review fixes" (+233/-48).
  - shared/recommendations (UI): #64 → #65 "review fixes" (+273/-63, open 4.6 days), then #69 → #73 polish.
  - exam-records: redirect privacy found as a follow-up of error-tracking (`follow-ups/redirect-slug-leak.md`) → backlog B-01 → F-09 #85 "keep the screening slug out of redirect URLs". Recurrence tests deferred from unit-test-suite (`follow-ups/recurrence-tests.md`) → F-08 #79. exam-records is the capability most often reopened by a later change (inference).
- **Closed without merge: 1** — #87 "Add Parallel Search MCP to the catalog drafting agent" (catalog-curation + platform: `scripts/catalog/*`, `package.json`, `vitest.config.ts`), +1623/-92, by an outside contributor who states "I work at Parallel"; open 9 days, 0 comments, closed 2026-10-27 (evidence). Not team friction; a vendor pitch at the catalog drafting script.
- **Deferred follow-ups still in the archive** (evidence that the files exist; status `unknown`, not read): reminders 2 (`due-screening-reminder/follow-ups/first-time-eligibility.md`, `follow-up-nudges/follow-ups/cross-job-overlap.md`), exam-records 1 (`recurrence-unit-tests/follow-ups/missing-entry-plan.md`, matches backlog B-04 "a plan with a missing catalog entry hides its screening").
- **Tracker drift** (evidence): #24 (S-06) and #25 (S-07) are still OPEN though #84 and #86 shipped them; #42 (F-01 phase 3 drafting script) open since 2026-09-28, waiting on an API key with owner-approved spend (issue comment). `context/changes/dashboard-tier-polish/` stays un-archived although #73 merged.

## Planning attention

- 21 change folders in the window (19 archived, 2 + `deployment` in `changes/`). Per capability: platform 5, reminders 4 (+1 shared with ops), exam-records 4, recommendations 3, UI redesign 3 (spread over shared/accounts/onboarding-consent/public-site), ops-alerting 2, onboarding-consent 1, catalog-curation 1, accounts 1, localisation 0 (evidence).
- Prose churn (A/M/D, screenshots and renames removed): deployment 16, then screening-catalog-v1, onboarding-profile and error-tracking 9 each; reminders' four changes sum to 28, exam-records' four to 24 (evidence; `.work/discussion-prose-churn.txt`).
- **Reminders is where attention is heading** (evidence): the open milestone M-02 names F-12 "reminder pipeline research" and F-13 "refactoring plan for one reminder-pipeline debt item"; `test-plan.md` risks #3 (wrong/duplicate/silent reminder emails) and #5 (withdrawal keeps reminders going) are about it; parked #57 asks for automated post-deploy verification of the reminder dispatch path. reminders also collects the most agent-review flags (3) with platform.
- Test-plan risk map (`context/foundation/test-plan.md` §2) by capability (inference by wording): cross-user data access #1 (onboarding-consent, exam-records, reminders), core-loop browser break #2 (accounts → onboarding → recommendations → exam-records, S-08 planned), reminders #3, exam-records #4, onboarding-consent withdrawal #5, health-data leaks into logs/URLs/alerts #6 (ops-alerting, exam-records).
- Changes without an impl-review artifact (evidence of absence of the file only): screening-recommendations, record-appointment-date, appointment-reminder, auth-ui-redesign, continue-ui-redesign.

## Debt markers

- `git grep -E 'TODO|FIXME|HACK|XXX'` over all tracked files at HEAD: **0 hits** (evidence) — 0 per 1000 lines for every capability. Debt is tracked in prose instead:
- `context/foundation/backlog.md` open items by capability (attribution by title, inference): ops-alerting B-02 (P1, F-07 production checks not done), B-09 (P2, Workers Logs Free-plan change 2026-12-01); exam-records/recommendations B-04 (P2); platform B-05, B-13; shared B-07, B-12; docs B-03 (P1, CLAUDE.md merge rule out of date), B-06; cross-cutting B-11 (unit tests for remaining pure modules).
- `context/foundation/lessons.md`: 3 lessons — 2 platform deploy (rename Worker, post-deploy checks race rollout), 1 privacy guard (grep gates vs privacy tests).

## Mechanical signals

- platform PR count (31) — 13 of them are the 2026-09-26 deploy-setup run (#1–#13, mostly docs of the deployment plan), and `package.json`/`eslint.config.js`/CI files are touched by most features (rule 4). CI fix subjects #8 (wrangler bump), #9 (pin Supabase CLI), #36 (retry post-deploy smoke), #74 (cancel superseded runs) are iteration on the pipeline (rule 5).
- localisation 13/13 PRs cross-cutting — every user-facing feature adds `pl.ts`/`en.ts` keys (rule 3, guarded by type-checked lint/`astro check`).
- shared 14/16 cross-cutting — UI redesign PRs and `database.types.ts` regeneration lockstep with migrations (rule 7).
- Fix spillover (rule 12): #37 touches 6 capabilities (about onboarding-consent), #65 touches 5 (about the UI refactor), #45 brushes recommendations (about catalog). Spill counts are kept out of the "own" column.
- PR sizes: #48 (18,006 lines) is 16,934 lines of generated `worker-configuration.d.ts` (noise file); #44 includes the generated catalog snapshot migration. Not used for ranking.
- Agent review verdicts are output of the author's agent workflow (rule 7): they show where the process found issues, not human scrutiny.
- Prose churn of auth-ui-redesign (75 raw file changes) is screenshots (86 PNG changes repo-wide under `context/`) and the archive move 1c7a5d5 (73 renames) — reduced to 5 after filtering (rule 8).
- cdeff9a (starter scaffold, no PR) inflates week-1 accounts/platform/shared code volume; no discussion attached.

## Unknowns

- Human review quality is `unknown`: there is none to measure (single human, agent-driven merges).
- Production errors: Workers Logs + failure-alert email are used (F-07, `ops-alerting`), but their content is out of scope — `unknown`. Backlog B-02 says F-07 production checks are not done yet.
- Status of the three archived `follow-ups/*.md` items and of backlog items — `unknown` (not read).
- Discussion outside GitHub and the repo (chat, the owner's local orchestrator skill notes, which `backlog.md` says are gitignored) — `unknown`.
- Issue → capability mapping relies on titles; issues have no capability labels — `inference`.

Commands run: `gh pr list --state all --search created:>=2026-09-20 --json …`; `gh issue list --state all --json …`; `gh pr view 87/6/64`, `gh issue view 42` (read-only); `node .work/discussion-commits.mjs .work/capabilities.tsv` (uses `attribute.mjs` + `noise.txt`); `grep` over `.work/subjects.txt` and `.work/git-log.txt` for reverts/hotfixes and prose churn; `git ls-files context/…`; `grep Verdict` over `reviews/*`; heading greps of `backlog.md`, `lessons.md`, `roadmap.md`, `test-plan.md`; `git grep -cE 'TODO|FIXME|HACK|XXX'`; `git show --numstat 792156e 33f1914`.
