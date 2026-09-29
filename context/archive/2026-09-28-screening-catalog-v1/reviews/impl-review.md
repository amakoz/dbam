<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Screening Catalog v1

- **Plan**: context/changes/screening-catalog-v1/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

Reviewed code: squash merge `33f1914` (PR #44). The `main` pipeline passed all of `ci`, `smoke`, `migrate` and `deploy`.

Pending Progress rows:

- **3.3**, the live drafter dry run, is pending by owner decision (no API credits; see change.md Notes).
- **4.7** was reported done by the owner on 2026-09-28: the production migration succeeded and the rows are present. It is not yet ticked in Progress, because only `/10x-implement` writes Progress.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated criteria re-run on 2026-09-28, all passing:

- `catalog:check`: 20 entries, matching the snapshot
- `supabase db reset`
- `supabase test db`: 54/54
- `db:types`: current
- `catalog:schema`: current
- lint and `astro check`: 0 errors
- build
- bundle: 2117 KiB
- no `@anthropic-ai/sdk` import under `src/`

## Findings

### F1 — service_role keeps full write access to the catalog

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260928153742_screening_catalog.sql:69-72
- **Detail**: The migration revokes only from `anon` and `authenticated`. `service_role` keeps INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES and MAINTAIN (relacl `service_role=arwdDxtm/postgres`). That contradicts the migration header ("writable only through generated catalog migrations") and the plan's end state ("Nobody but the table owner can write"). A hotfix made in Studio or with the service key would be silently overwritten by the next snapshot, which re-upserts every row. The app has no service-role key, so exploitability is low. pgTAP does not assert anything about `service_role`.
- **Fix A ⭐ Recommended**: Add an additive migration that revokes all write privileges from `service_role`, keeping SELECT, plus the PG17 `maintain` revoke. Add pgTAP `has_table_privilege('service_role', …)` cases.
  - Strength: Makes the documented invariant real, and tests it the same way as the other roles.
  - Tradeoff: One more migration. Any future admin tooling must go through snapshots.
  - Confidence: HIGH — same revoke pattern as `20260928061623_harden_consent_withdrawal.sql`.
  - Blind spot: Not verified whether Supabase internals (e.g. Studio table editor) expect service_role writes. Only human tooling would be affected.
- **Fix B**: Document service_role as an accepted exception, in the migration comment and CLAUDE.md.
  - Strength: No schema change.
  - Tradeoff: The invariant stays unenforced, and a manual edit still gets overwritten silently.
  - Confidence: MED — relies on discipline.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — migration 20260928195335_harden_screening_catalog_service_role.sql + 3 pgTAP assertions (service_role writes, service_role read, MAINTAIN for all client roles); break-check confirmed

### F2 — Questionnaire-gated checks show as due for every adult in their age range

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: catalog/entries/cognitive-screening-60-plus.json:10, catalog/entries/hepatitis-c-antibody-test.json:10, catalog/entries/fecal-occult-blood-test.json
- **Detail**: These entries have unconditional eligibility, e.g. `[{"age_min":60,"requires":[]}]` and `[{"age_min":20,"requires":[]}]`. But in Moje Zdrowie these checks are ordered only when the questionnaire or IPZ indicates risk, as each entry's summary says. Under the plan's semantics S-02 will list a dementia screen as due for everyone aged 60+ and HCV testing for everyone aged 20+. That overstates eligibility. For the cognitive screen it edges toward implying a condition, which the PRD guardrail forbids (prd.md:37).
- **Fix A ⭐ Recommended**: Add an uncollected boolean factor `questionnaire_flags_risk` to `src/lib/catalog/factors.ts`, require it in these three entries, and generate a new snapshot. The branches then evaluate as _unknown_ ("ask your POZ doctor") instead of eligible.
  - Strength: Uses the "uncollected factor → unknown" semantics the plan already defines. The entries stay active and honest.
  - Tradeoff: Touches the factor vocabulary and the JSON Schema. A new snapshot migration ships through CI.
  - Confidence: HIGH — the mechanism already exists and `catalog:check` guards it.
  - Blind spot: How S-02 renders "unknown" is not designed yet.
- **Fix B**: Set the three entries back to `draft` and generate a new snapshot until S-02 decides how gated entries render.
  - Strength: Smallest change, and nothing misleading can render.
  - Tradeoff: Hides three genuine program items, and the gating question reappears later.
  - Confidence: HIGH — a status flip plus a snapshot.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — uncollected factor questionnaire_flags_risk added; cognitive-screening-60-plus, hepatitis-c-antibody-test, fecal-occult-blood-test require it; schema + snapshot 20260929062557 regenerated

### F3 — Medical sign-off gate is not enforced; unreviewed guidance is live

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: catalog/entries/\* (19 `active`, all `reviewed_by = null`); plan.md "What We're NOT Doing" (launch gate #27)
- **Detail**: The plan makes POZ-doctor sign-off a launch gate. It exists only in prose. Unreviewed, LLM-drafted guidance is now in production and readable by `anon` over PostgREST. No UI consumes it yet. Content points to raise at medical review:
  - `moje-zdrowie-health-check` has `evidence_level` 3, while the rubric calls a "Moje Zdrowie item" 2.
  - PSA is 50+ with no cap, while USPSTF gives 55–69.
  - "Powyżej X roku życia" is read as X+.
  - The colonoscopy 120-month interval is inferred from an exclusion.
  - LDCT's 50–54 branches encode only one of the regulation's risk factors. It is draft anyway.
- **Fix A ⭐ Recommended**: Make the gate a hard requirement of S-02: recommendations render only entries with `reviewed_by is not null` until launch, or behind a clearly labelled pre-launch mode. Record it in the S-02 plan and in context/foundation/roadmap.md #27.
  - Strength: The gate sits where users would see content, with no catalog churn.
  - Tradeoff: S-02 shows nothing (or pre-launch content only) until a doctor reviews, which slows the north star demo.
  - Confidence: MED — depends on S-02 planning honouring it.
  - Blind spot: Anyone reading the REST API directly still sees unreviewed rows, which is acceptable because there is no personal data and no UI.
- **Fix B**: Add `catalog:check --launch`, which fails on any `active` entry with `reviewed_by` null, and run it in CI once launch is declared.
  - Strength: A mechanical, repo-level guard.
  - Tradeoff: It only helps once someone turns it on. It doesn't affect S-02 rendering before launch.
  - Confidence: MED.
  - Blind spot: No launch flag or date exists yet.
- **Decision**: FIXED (Fix A) — gate recorded as an S-02 requirement in context/changes/screening-recommendations/change.md and roadmap #27; comments posted on #20 and #27

### F4 — Unplanned `eager_input_streaming` on the strict `submit_entries` tool

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: scripts/catalog/draft.ts:206-208
- **Detail**: The plan specifies a strict tool. `eager_input_streaming: true` was added from the implementation brief, not the plan. With eager streaming, the API no longer validates or coerces the tool input, so the strict-schema guarantee the plan relies on is lost. Zod still validates each entry, but a truncated or malformed wrapper fails the whole run. This has not been exercised live (3.3 is pending).
- **Fix**: Remove `eager_input_streaming` from the `submit_entries` tool so strict validation applies. The script already streams only to avoid timeouts and reads `finalMessage()`.
- **Decision**: FIXED — eager_input_streaming removed from submit_entries (scripts/catalog/draft.ts); strict validation applies

### F5 — Generator edge cases: control characters and manifest parsing

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/catalog/schema.ts:19, scripts/catalog/lib.ts:27, 150-158, 204-207
- **Detail**: Two edge cases were verified in rollback transactions:
  - **NUL:** a NUL character inside jsonb text passes validation, but Postgres rejects the migration ("\u0000 cannot be converted to text"). CI would catch it.
  - **Manifest parsing:** the slug manifest regex runs over the whole file. A summary containing `\n-- catalog-slug: ghost` becomes a phantom manifest slug. Once shipped, that snapshot would permanently require `ghost.json`.
- **Fix**: Reject NUL and C0 control characters (except `\n` and `\t`) in the `Text` schema, and parse the manifest only from the header, before `insert into`.
- **Decision**: FIXED — Text rejects C0 control characters/DEL except tab and newline (src/lib/catalog/schema.ts); manifest parsed from the header only (scripts/catalog/lib.ts); probed: NUL/ESC rejected, ghost manifest line ignored

### F6 — Drafter cost caps are loose

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/catalog/draft.ts:199-200, 258
- **Detail**: `web_fetch` has no `max_uses` and no `max_content_tokens`, and Dziennik Ustaw PDFs are large. The `web_search` `max_uses` likely applies per request, so up to 5 `pause_turn` continuations could allow up to 6× `--max-searches`. That last point has not been confirmed against the API docs.
- **Fix**: Set `max_uses` and `max_content_tokens` on `web_fetch`, and reduce the search cap on each continuation by `usage.server_tool_use.web_search_requests` already spent.
- **Decision**: FIXED — web_fetch capped (max_uses = --max-searches, max_content_tokens 50000); run() carries the search/fetch budget across pause_turn continuations and stops when it is used up; help + README updated. Not exercised live (3.3 pending)

### F7 — `--source` can send local secrets to the API; raw web text reaches the terminal

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/catalog/draft.ts:136-141, 185-188, 262, 321
- **Detail**: `--source` accepts any readable file. `--source .env` or `.dev.vars` would send `SUPABASE_KEY` to Anthropic and write it into `catalog/.draft-runs/`. Separately, model text and quotes derived from fetched pages are printed raw, so terminal escape sequences from web content could be echoed.
- **Fix**: Refuse `.env*`, `.dev.vars` and paths outside the repo for `--source`, and strip C0/C1 control characters when printing.
- **Decision**: FIXED — forbiddenSourceReason() refuses .env*/.dev.vars and paths outside the repo; terminalSafe() strips C0 (except tab/newline), DEL and C1 from all drafter output (writeOut/writeErr); probed without an API call

### F8 — Every snapshot bumps `updated_at` on every row

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/catalog/lib.ts:184, 187
- **Detail**: The upsert writes `updated_at = now()` for every row, and the trigger fires on any update. So `updated_at` no longer means "content changed". Any future "guidance changed" logic (S-05 or review tooling) would see every row change on every snapshot.
- **Fix**: Add a `where (…columns…) is distinct from (excluded.…)` clause to `on conflict … do update`.
- **Decision**: FIXED — upsert guarded with where (content columns) is distinct from (excluded.…); unapplied snapshot 20260929062557 regenerated as 20260929083238; re-applying it updated 0 rows

### F9 — Concurrent catalog PRs can leave main red

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: catalog/README.md (ship workflow)
- **Detail**: Two PRs that each generate a snapshot can't silently regress data. `migrate` needs `ci`'s `catalog:check`, and `db push` refuses out-of-order files. But the second merge turns main red and blocks deploy until an unapplied snapshot is removed by hand.
- **Fix**: Add a recovery note to catalog/README.md (rebase, delete your unapplied snapshot, re-run `catalog:migration`), and prefer "require branches up to date" on main.
- **Decision**: FIXED — catalog/README.md 'When two catalog PRs overlap': rebase, delete only never-shipped snapshots, regenerate; recommends requiring up-to-date branches on main

### F10 — Policy naming style; no MAINTAIN assertion

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260928153742_screening_catalog.sql:65, supabase/tests/database/screening_catalog.test.sql
- **Detail**: The policy `screening_catalog_select_published` follows the plan's name, but it breaks the S-01 style of quoted sentence names ("Users read their own profile"). pgTAP also doesn't assert the PG17 MAINTAIN revoke, which the hardening migration treats as load-bearing.
- **Fix**: Leave the name (renaming a policy only for style isn't worth a migration). Add a PG17-guarded `has_table_privilege(…, 'MAINTAIN')` assertion when F1's migration is written.
- **Decision**: FIXED — MAINTAIN assertion added with F1; policy name kept (style-only rename not worth a migration)
