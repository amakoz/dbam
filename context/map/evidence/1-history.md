# Evidence: history

Window: whole history, cdeff9a 2026-09-24 .. 159e566 2026-10-27 (~5 weeks), HEAD 159e566. Buckets: ISO week (W39 = Sep 21–27, W40 = Sep 28–Oct 4, W41 = Oct 5–11, W42–W43 = no commits, W44 = Oct 26–Nov 1). Commits counted: 61 of 61 (0 merges, 0 bots, 0 agent-authored, 0 mass excluded). Noise removed first (`.work/noise.txt`): 17 file changes. File changes counted: 821. Humans in window: 1 (two identities) — every concentration figure is the solo baseline (rule 6). Raw output: `.work/history-*.tsv`, script `.work/history-analyze.mjs`.

## Activity per capability

`evidence`. Changes = file changes (a commit counts for every capability it touches); commits = once per capability touched. Agent = commits carrying a Claude `Co-authored-by` trailer (human commits; agent share is context).

| Capability         | Changes | % all (821) | % code (447) | Commits | Agent-co-authored |
| ------------------ | ------: | ----------: | -----------: | ------: | ----------------: |
| docs (prose)       |     374 |        45.6 |            — |      59 |                54 |
| platform           |      84 |        10.2 |         18.8 |      33 |                31 |
| catalog-curation   |      61 |         7.4 |         13.6 |       3 |                 3 |
| accounts           |      48 |         5.8 |         10.7 |       9 |                 8 |
| shared             |      45 |         5.5 |         10.1 |      16 |                15 |
| reminders          |      42 |         5.1 |          9.4 |       7 |                 7 |
| recommendations    |      41 |         5.0 |          9.2 |      16 |                15 |
| exam-records       |      37 |         4.5 |          8.3 |       9 |                 9 |
| localisation       |      31 |         3.8 |          6.9 |      13 |                13 |
| onboarding-consent |      28 |         3.4 |          6.3 |       7 |                 7 |
| ops-alerting       |      16 |         1.9 |          3.6 |       9 |                 8 |
| public-site        |      14 |         1.7 |          3.1 |       4 |                 3 |
| **unmapped**       |   **0** |     **0.0** |              |         |                   |

- Agent share: 56 of 61 commits (92 %) carry a Claude co-author; the 5 human-only commits are the 4 bootstrap commits (W39) and archive move 1c7a5d5. `evidence`
- Change counts are volume, not churn, for two capabilities: `evidence` catalog-curation's 61 changes come from 3 commits (33f1914 F-01 first batch 31, of which 21 are new `catalog/entries/*.json`; ed1c052 S-02 21; 6974e92 review fixes 9). accounts' 48 come mostly from the scaffold cdeff9a (13), the S-01 translations commit 670912f (11) and UI redesign ba40c8f (10); its only own feature commit is 93280d5 (#14, confirmation callback, 3 changes). `inference`: accounts is not hot by its own work.
- By commits, the busiest business capabilities are recommendations (16) and localisation (13), then accounts/exam-records/ops-alerting (9 each). `evidence`

## Top files in top capabilities

`evidence` (changes in window; † = gone at HEAD).

| Capability         | Top files (changes)                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| platform           | `.github/workflows/ci.yml` 15, `scripts/smoke.mjs` 12, `package.json` 10, `eslint.config.js` 9, `astro.config.mjs` 8, `wrangler.jsonc` 5                                                             |
| catalog-curation   | `catalog/entry.schema.json` 3, `supabase/tests/database/screening_catalog.test.sql` 3, `catalog/entries/{cognitive-screening-60-plus,fecal-occult-blood-test,hepatitis-c-antibody-test}.json` 3 each |
| accounts           | `src/middleware.ts` 7, `src/pages/api/auth/signup.ts` 5, `src/pages/auth/signin.astro` 4, `src/pages/api/auth/signin.ts` 4                                                                           |
| shared             | `src/lib/database.types.ts` 7 (regenerated), `src/layouts/Layout.astro` 6, `src/pages/dev/kitchen-sink.astro` 5, `src/lib/supabase.ts` 3, `src/styles/global.css` 3                                  |
| reminders          | `src/worker.ts` 5, `src/lib/email.ts` 4, `src/lib/reminders/admin-client.ts` 3, `src/lib/reminders/appointment.ts` 3                                                                                 |
| recommendations    | `src/pages/dashboard.astro` 11, `src/components/recommendations/RecommendationItem.astro` 5, `src/lib/catalog/read.ts` 4, `src/lib/catalog/schema.ts` 4, `src/lib/catalog/factors.ts` 3              |
| exam-records       | `src/pages/api/screenings.ts` 4, `src/components/recommendations/{DoneItem,PlanItem}.astro` 4 each, `src/lib/screenings/rules.ts` 3                                                                  |
| localisation       | `src/i18n/en.ts` 12, `src/i18n/pl.ts` 12, `src/components/LanguageSwitcher.astro` 4                                                                                                                  |
| onboarding-consent | `src/lib/consent.ts` 4, `src/pages/profile.astro` 4, `src/pages/onboarding.astro` 3, `src/components/profile/ProfileForm.tsx` 3, `src/pages/api/consent/withdraw.ts` 3                               |
| ops-alerting       | `src/lib/heartbeat.ts` 4, `src/lib/observability.ts` 3, `src/lib/config-status.ts` 3                                                                                                                 |
| public-site        | `src/components/Topbar.astro`† 3, `src/components/Welcome.astro`† 3, `src/components/Banner.astro`† 2, `src/pages/500.astro` 2, `src/pages/index.astro` 2                                            |

## Trend

`evidence` commits per capability per ISO week (W42 and W43 had **zero commits in the whole repo**; the last code commit is 0d065e6 on 2026-10-06; W44 is docs only).

| Capability         | W39 | W40 | W41 | W42 | W43 | W44 | Label                                           |
| ------------------ | --: | --: | --: | --: | --: | --: | ----------------------------------------------- |
| docs               |  24 |  16 |  17 |   0 |   0 |   2 | constant                                        |
| platform           |  12 |   9 |  12 |   0 |   0 |   0 | constant (W39 deploy campaign)                  |
| recommendations    |   3 |   6 |   7 |   0 |   0 |   0 | rising                                          |
| exam-records       |   0 |   2 |   7 |   0 |   0 |   0 | rising                                          |
| reminders          |   0 |   3 |   4 |   0 |   0 |   0 | rising                                          |
| shared             |   3 |   5 |   8 |   0 |   0 |   0 | rising                                          |
| localisation       |   2 |   5 |   6 |   0 |   0 |   0 | rising (follows features)                       |
| ops-alerting       |   3 |   3 |   3 |   0 |   0 |   0 | constant                                        |
| onboarding-consent |   2 |   3 |   2 |   0 |   0 |   0 | constant (S-01 W39–40, then cross-cutting only) |
| accounts           |   4 |   3 |   2 |   0 |   0 |   0 | fading                                          |
| public-site        |   2 |   1 |   1 |   0 |   0 |   0 | fading                                          |
| catalog-curation   |   0 |   3 |   0 |   0 |   0 |   0 | seasonal (one campaign)                         |

Labels are over W39–W41; the W42–W44 stop is repo-wide (project pause), not a per-capability fade. `inference`

Campaigns (from subjects, `evidence`): W39 — deploy phases #1–#13 (platform) + S-01 onboarding (#30, #35); W40 — F-01 catalog (#44–#47), S-02 recommendations (#50), F-02 reminder dispatch (#48–#53), S-03 record appointment (#59), S-04 appointment reminder (#66), UI refactor theme A (#64); W41 — UI redesign (#69), S-05 confirm (#75), agent-workflow F-03..F-09 (#77–#85), S-06 due reminders (#84), S-07 nudges (#86); W44 — M-02 roadmap and F-10 test plan.

## Fix pressure

Heuristic (contract): subject matches `fix|review fixes|address .* findings|retry|revert|hotfix|repair`; brief's `bug|regression|broken|incident` adds no extra commit. Each fix commit counts for every capability it touches; cross-cutting = touches > 3 capabilities. **Reverts: 0.** 6 fix commits in total (10 % of 61).

| Capability         | Commits | Fix commits | Fix share | Cross-cutting among them | Reverts |
| ------------------ | ------: | ----------: | --------: | -----------------------: | ------: |
| catalog-curation   |       3 |           1 |      33 % |                        0 |       0 |
| public-site        |       4 |           1 |      25 % |                        1 |       0 |
| shared             |      16 |           3 |      19 % |                        2 |       0 |
| localisation       |      13 |           2 |      15 % |                        2 |       0 |
| reminders          |       7 |           1 |      14 % |                        1 |       0 |
| onboarding-consent |       7 |           1 |      14 % |                        1 |       0 |
| recommendations    |      16 |           2 |      13 % |                        1 |       0 |
| platform           |      33 |           4 |      12 % |                        3 |       0 |
| accounts           |       9 |           1 |      11 % |                        1 |       0 |
| exam-records       |       9 |           1 |      11 % |                        1 |       0 |
| ops-alerting       |       9 |           1 |      11 % |                        1 |       0 |
| docs               |      59 |           5 |       8 % |                        3 |       0 |

The six fix commits, attributed to what they were about (rules 5, 12; files in `.work/history-fix-files.txt`):

| Commit  | Subject (short)                                                  | About                          | Kind                                                                                     | Spillover                                                                   |
| ------- | ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 417df13 | Retry PostgREST once on "JWT issued at future" (#68)             | shared (`src/lib/supabase.ts`) | **production bug** — issue #68 labelled `bug`: "500 on /dashboard" after idle            | none (1 capability)                                                         |
| a5ad7d5 | fix(onboarding-profile): address full impl-review findings (#37) | onboarding-consent             | pre-close review fixes, incl. migration `20260928061623_harden_consent_withdrawal.sql`   | 7 capabilities: accounts, public-site, localisation, shared, platform, docs |
| 6974e92 | Screening catalog v1: impl-review fixes (F-01) (#45)             | catalog-curation               | review fixes, incl. migration `20260928195335_harden_screening_catalog_service_role.sql` | recommendations (`src/lib/catalog/{factors,schema}.ts`)                     |
| 7f1a38b | Reminder dispatch path: close out, review fixes (F-02) (#53)     | reminders / ops-alerting       | review fixes (`email.ts`, `heartbeat.ts`, CI, `.env.example`)                            | platform, docs                                                              |
| f65e73c | Close out ui-refactor: review fixes (#65)                        | recommendations (dashboard UI) | UI polish — **mechanical** (rule 5)                                                      | exam-records, localisation, shared, platform, docs                          |
| e7921c9 | ci: retry post-deploy read-only smoke (#36)                      | platform                       | CI iteration — **mechanical** (rule 5)                                                   | docs                                                                        |

- `evidence` Only one fix commit is a production defect (417df13, shared Supabase client). Four are the 10x workflow's impl-review step at change close-out; two of those added `harden_*` migrations (consent withdrawal, catalog service_role privileges).
- `inference` Per-capability fix shares are not a ranking signal here: with ≤ 3 fix commits per capability and 4 of 6 being cross-cutting close-outs, every share is driven by one commit. public-site's 25 % and localisation's 15 % are pure spillover from a5ad7d5/f65e73c.

## Co-change between capabilities

Co-change set: 52 commits; **9 dropped** for touching > 6 of 12 buckets — ea360ee S-06 (8), 1a20481 F-07 (9), ba40c8f UI redesign (8), d85fe14 S-04 (9), 826f9c2 S-03 (8), a5ad7d5 (7), 6f1a980 S-01 (8), 670912f S-01 (9), cdeff9a scaffold (7). Confidence = shared ÷ commits of the less active side (in the 52-commit set). Docs pairs omitted below (docs co-changes with 50 of 52 commits; rule 8).

| A                | B                                | Support | Confidence | Driver (`evidence` from files)                                                                     |
| ---------------- | -------------------------------- | ------: | ---------: | -------------------------------------------------------------------------------------------------- |
| platform         | recommendations                  |       7 |       0.78 | `scripts/smoke.mjs` extended per feature; `ci.yml`/`package.json` for F-03 Vitest, catalog tooling |
| localisation     | platform                         |       6 |       1.00 | same commits: i18n keys + smoke assertions                                                         |
| exam-records     | recommendations                  |       5 |       0.83 | shared dashboard components (`PlanItem`, `DoneItem`, `dashboard.astro`) — S-05, F-09, UI refactor  |
| localisation     | recommendations                  |       5 |       0.83 | new dashboard strings                                                                              |
| recommendations  | shared                           |       5 |       0.71 | UI refactor/redesign (`Layout.astro`, `ui/*`, kitchen sink)                                        |
| platform         | shared                           |       5 |       0.71 | `astro.config.mjs`, `ui-check.mjs` with theme A                                                    |
| exam-records     | localisation / platform / shared |  4 each |       0.67 | same 4 commits (4b8b2f9, f65e73c, e166a2f, 8345164)                                                |
| ops-alerting     | reminders                        |       3 |       1.00 | F-02 heartbeat on cron (`worker.ts`, `email.ts`, `heartbeat.ts`), S-07                             |
| catalog-curation | recommendations                  |       3 |       1.00 | `src/lib/catalog/schema.ts` reads the curated JSON (F-01, S-02)                                    |
| platform         | ops-alerting / reminders         |  3 each |       1.00 | `ci.yml`, `.env.example`, `eslint.config.js`                                                       |
| catalog-curation | platform                         |       2 |       0.67 | `ci.yml` (`catalog:check`), `package.json`                                                         |

- `inference` Four commits (4b8b2f9, f65e73c, e166a2f, 8345164) generate most exam-records/recommendations/localisation/shared/platform pairs — one shared cause (dashboard work, rule 4); count that cluster once.
- `evidence` reminders has only 3 commits in the co-change set; its feature commits S-04 (d85fe14) and S-06 (ea360ee) are among the 9 dropped. Its coupling to exam-records and recommendations is therefore not measurable under the contract rule (see Unknowns).

## Hub files and freshness

Partners = other capabilities seen in ≥ 2 co-change commits with the file (excl. docs).

| File                                                                                                                          | Own capability                 |      Commits |  Partners | What it is / rule                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -----------: | --------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`                                                                                                    | platform                       |           15 |         4 | CI pipeline; every new check edits it — **mechanical** (rule 4)                                                                                                  |
| `src/i18n/en.ts`, `src/i18n/pl.ts`                                                                                            | localisation                   |      12 each |         4 | translation catalogs; `en` is typed `Record<MessageKey, string>` and `astro check` runs in CI, so drift fails the build — **mechanical** (rule 3)                |
| `scripts/smoke.mjs`                                                                                                           | platform                       |           12 |         4 | HTTP smoke test grown per feature — workflow lockstep (rule 3/4)                                                                                                 |
| `src/pages/dashboard.astro`                                                                                                   | recommendations                |           11 |         4 | the one authenticated page hosting recommendations + exam records — real business seam (`inference`)                                                             |
| `astro.config.mjs`                                                                                                            | platform                       |            8 |         4 | build config (theme/cssTarget, env) — rule 4                                                                                                                     |
| `src/layouts/Layout.astro`, `src/pages/dev/kitchen-sink.astro`, `src/components/ui/input.tsx`                                 | shared                         |    6 / 5 / 2 |         4 | layout, dev-only token showcase, primitive — UI-redesign spillover (rule 4)                                                                                      |
| `src/components/recommendations/{RecommendationItem,DoneItem,PlanItem,ScreeningActions}.astro`, `src/pages/api/screenings.ts` | recommendations / exam-records |          3–5 |         4 | dashboard row components and their form endpoint — same 4-commit cluster                                                                                         |
| `src/lib/database.types.ts`                                                                                                   | shared                         |            7 |         3 | generated by `npm run db:types` — regeneration lockstep (rule 7); **no CI step regenerates or diffs it** (`git grep db:types .github/workflows/ci.yml` = no hit) |
| `context/foundation/roadmap.md`, `README.md`, `CLAUDE.md`                                                                     | docs                           | 28 / 26 / 21 | 8 / 7 / 5 | prose hubs (rule 8) — discussion, not code                                                                                                                       |

Freshness (`git cat-file -e HEAD:<path>` on every file named in this document, `.work/history-freshness.txt`): gone at HEAD — `src/components/Topbar.astro`, `src/components/Welcome.astro`, `src/components/Banner.astro`, `src/components/ui/LibBadge.astro` (starter leftovers, deleted), `src/components/auth/FormField.tsx` (moved to `src/components/forms/FormField.tsx` in ba40c8f; counted under the new path). public-site's top 3 files are all deleted (rule 11). All other named files exist.

## Mechanical signals

- platform's 33 commits / 18.8 % of code changes: W39 deploy campaign (#1–#13) and per-feature edits of `ci.yml`, `smoke.mjs`, `package.json` (rules 4, 5). Not a risk ranking by itself.
- `src/i18n/{pl,en}.ts` hub: lockstep guarded by type check (rule 3).
- `src/lib/database.types.ts`: regeneration lockstep with migrations (rule 7); note that the guard is a manual step, not CI.
- Fix commits f65e73c (UI polish) and e7921c9 (CI retry) — rule 5. a5ad7d5's spillover onto accounts, public-site, localisation, shared, platform — rule 12.
- catalog-curation change volume (61 in 3 commits) = initial content batch, not churn; accounts volume = scaffold + redesign.
- public-site activity = deleted starter components (rule 11).
- docs = 45.6 % of changes, prose (rule 8); roadmap/README/CLAUDE.md hubs.
- Solo developer: no concentration statistics are reported (rule 6).

## Unknowns

- `unknown` Coupling of reminders with exam-records/recommendations (the cron reads screening plans and the catalog) — its feature commits (S-04, S-06) and F-07 exceed the > 6-capability cut, so co-change cannot show it. Same for onboarding-consent (both S-01 commits dropped).
- `unknown` Pairs that should change together but co-change cannot show: SQL schema (`supabase/migrations`) vs hand-written TS readers in `src/lib/{screenings,catalog,reminders}` beyond the generated `database.types.ts`; `src/lib/password.ts` vs `supabase/config.toml` vs the production dashboard password policy (CLAUDE.md says change all three; the dashboard is outside git); `catalog/entries` wording vs `src/lib/catalog/wording.ts` tests.
- `unknown` Whether `database.types.ts` is ever stale: no CI check (evidence above); verifying would require running `npm run db:types` against a local DB (not done, read-only).
- `unknown` Trend significance: 5 weeks, 3 active weeks, squash-merged PRs (one commit per change) — labels rest on 0–8 commits per cell.
- `unknown` Bug-labelled issues not referenced in subjects: only #68 was checked (`gh issue view 68`); a full bug-label sweep belongs to the discussion agent.

Commands run:

- `node .work/history-analyze.mjs capabilities.tsv` (parses `.work/git-log.txt`, applies `noise.txt`, `attribute.mjs`; writes `.work/history-{capabilities,per-commit,top-files,cochange,hubs}.tsv`)
- `git -c core.quotepath=off show --name-only <fix commits>` → `.work/history-fix-files.txt`; same for platform files in co-change commits
- `awk` over `git-log.txt` + `attribute.mjs` → `.work/history-cap-commit-path.tsv` (per-capability per-commit breakdown)
- `gh issue view 68 -R amakoz/dbam --json labels`
- `git grep` for CI guards in `.github/workflows/ci.yml` and the type annotation in `src/i18n/{en,pl}.ts`
- `git cat-file -e HEAD:<path>` for every named file → `.work/history-freshness.txt`; `git log --diff-filter=DR` for `FormField.tsx`
