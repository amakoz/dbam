# Screening Catalog v1 Implementation Plan

## Overview

Build roadmap F-01: a curated screening catalog. It is a public, read-only Supabase table `screening_catalog`, filled from reviewed JSON entry files through a validated pipeline. An owner-run script drafts new entries with Claude Opus 5 and live web sources. They land as `draft` and reach users only after the owner sets them to `active`. This change also ships a first batch of real entries, so S-02 (#20) and S-05 (#23) have data to build on.

## Current State Analysis

- No catalog exists: there is no table, module or branch (`research.md` Summary). Issue #17 is open.
- The profile the rules evaluate is `public.profiles`:
  - `birth_year`, `sex` (`female|male`), `smoking_status` (`never|current|former`)
  - `packs_per_day`, `smoking_years`, `years_since_quitting`, generated `pack_years`

  (`supabase/migrations/20260927190303_onboarding_profile.sql:53-72`)

- Every existing table revokes `anon` entirely (`:44`, `:124`). This catalog is the first table that `anon` can read.
- Supabase default privileges leave TRUNCATE/TRIGGER/REFERENCES/MAINTAIN on new tables. S-01 had to revoke these (`20260928061623_harden_consent_withdrawal.sql:33-42`).
- No migration inserts data yet. Production only receives `supabase db push` without seed (`.github/workflows/ci.yml:73-76`), so catalog rows must be INSERTs in a migration.
- No jsonb columns and no enum types exist. Enumerations are `text … check (…)` (`:13`, `:56-57`).
- The app has one Supabase client, cookie-bound, built from the publishable key (`src/lib/supabase.ts:6-22`). There is no service-role key (`context/changes/deployment/deployment-plan.md:187-188`).
- There is no unit-test runner. `zod@4` is present only as a transitive dependency. CI runs Node 22 and has no test step (`ci.yml:11-23`).
- `tsconfig.json` includes `**/*` with `astro/tsconfigs/strict`, so any new `scripts/**/*.ts` is type-checked by `astro check`.
- The content source is `context/foundation/screening-catalog-research.md`. The owner treats its 14 rows as examples, not as the catalog's scope. Its JSONLogic example is invalid (`research.md` Summary 5).

## Desired End State

- **Table:** `public.screening_catalog` exists in production, with:
  - slug as the immutable primary key
  - `draft|active|retired` lifecycle
  - PL and EN display text
  - eligibility as typed branches over a closed factor vocabulary
  - an explicit interval kind, with optional conditional overrides
  - `evidence_level` and `burden_weight` for S-02's tier rule
  - at least one source per entry, and medical-review fields
- **Access:** `anon` and `authenticated` can SELECT `active` and `retired` rows and nothing else. Nobody but the table owner can write.
- **Content files:** `catalog/entries/<slug>.json` are the source of truth for content.
  - `npm run catalog:check` validates them and fails when they drift from the latest generated catalog migration.
  - `npm run catalog:migration` writes a deterministic upsert snapshot migration.
- **Drafting:** `npm run catalog:draft` calls Claude Opus 5 with web search/fetch and writes validated new entries as `draft` files.
- **First batch:** roughly 20–30 researched entries ship, and the owner-approved ones are `active`.

Verify with:

- `npm run catalog:check`, `npx supabase test db`, `npm run lint`, `npx astro check` and `npm run build`, all green locally and in CI.
- A local REST read with the publishable key, which returns the active and retired entries only.

### Key Discoveries:

- **pgTAP style to follow:** `set local role` + `request.jwt.claims`, `throws_ok … '42501'`, `ok(not has_table_privilege(…))` (`supabase/tests/database/onboarding_profile.test.sql:13-14`, `:108`, `:128-131`).
- **Table conventions to follow:** `comment on table`, `enable row level security`, named policies, `public.set_updated_at()` trigger reuse (`20260927190303_onboarding_profile.sql:19-20`, `:26-30`, `:77-90`).
- **Age convention:** age is `currentYear - birth_year` (`context/archive/2026-09-27-onboarding-profile/plan.md:239`). NFZ counts by birth year (`screening-catalog-research.md:28`, `:114`).
- **Null smoking values:** `pack_years` and `years_since_quitting` are null by constraint for some statuses (`20260927190303_onboarding_profile.sql:64-71`). A condition on a null value is false.
- **Structured output:** citations and `output_config.format` are mutually exclusive on the Claude API. So the drafter returns entries through a strict custom tool (`submit_entries`, `strict: true`), not JSON output mode.

## What We're NOT Doing

- **No eligibility evaluator.** `isEligible(entry, profile)` and the tier derivation belong to S-02. This plan only fixes their semantics (below) and the data they read.
- **No dashboard/UI changes, no exam records, no FK from records.** Those are S-02, S-03 and S-05.
- **No new profile questions.** Uncollected factors are stored in rules, but nothing collects them.
- **No scheduled or production AI job** (roadmap #28). The drafter runs only on the owner's machine. Its API key is never a Cloudflare or GitHub secret.
- **No medical sign-off.** `reviewed_by`, `last_reviewed` and `next_review_due` stay null until a POZ doctor reviews. That is a launch gate (#27), not a build gate.
- **No `pending_verification` status.** Unverified facts (e.g. LDCT before its regulation is checked) stay `draft`.
- **No deletes.** An entry is never removed from `catalog/entries/` or the table. It is set to `retired`.
- **No unit tests** (owner decision: added later). There is no `npm test` script or CI test step. The pure modules (`scripts/catalog/lib.ts`, `scripts/catalog/draft-core.ts`, `src/lib/catalog/schema.ts`) are still kept separate from the CLI entry points so tests can be added without refactoring. Database access and data are still covered by pgTAP.
- **No JSONLogic or other rule engine dependency.**
- **No admin UI.** Authoring is files + scripts + git.

## Implementation Approach

The data model lands first as a schema-only migration with its access rules proven in pgTAP.

The content pipeline comes next:

- **Zod schema:** one schema in `src/lib/catalog/` is the single source of truth. It yields the TS types, the published JSON Schema for LLM tooling, and the validator.
- **Generator:** turns every entry file into one deterministic `insert … on conflict (slug) do update` snapshot migration, so the DB mirrors the files exactly. Drafts are shipped too, and RLS hides them.
- **Drift check:** a fixed snapshot is also what `catalog:check` compares against.

The LLM drafter is a thin, owner-run layer on top. It can only produce files that pass the same validator.

Finally, the first real batch goes through the whole path: draft, owner review, `active`, generated migration, CI `migrate`.

**Semantics fixed by this plan (S-02 and S-05 implement them):**

- **Eligibility:** an entry is eligible when **any** branch matches.
- **Branch match:** a branch matches when all of these hold:
  - `sex` is absent or equal to the profile's sex
  - `age_min ≤ age ≤ age_max`, inclusive, with `age = currentYear − birth_year` and `age_max` absent meaning no upper bound
  - every `requires` condition holds
- **Conditions:** a condition on a factor with `collected: false` makes that branch _unknown_, never true. A condition whose profile value is null is false.
- **Interval:** `interval_months` applies when `interval_kind = 'fixed'`. The **first** override whose `when` matches replaces it. Other kinds have no computable next due date and must be shown as such.

## Critical Implementation Details

- **Grants:** revoke first, then grant. `revoke all on public.screening_catalog from anon, authenticated` must come before `grant select … to anon, authenticated`. Otherwise Supabase's defaults leave INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES in place. Reuse S-01's PG17-guarded `maintain` revoke for both roles.
- **Deterministic SQL:** the generator must be byte-deterministic. That means:
  - entries sorted by slug
  - object keys serialized in schema order
  - dollar-quoted or properly escaped literals (Polish text contains `'`)
  - no timestamps inside the body

  The migration **filename** carries the timestamp. The drift check compares bodies of the newest `*_screening_catalog_snapshot.sql` only.

- **Drafter loop:**
  - Server tool errors (web search/fetch) arrive as result blocks, not exceptions.
  - `pause_turn` must be continued by re-sending the assistant content.
  - Always check `stop_reason` (`refusal`, `max_tokens`) before reading the `submit_entries` input.
  - Validate that input with the Zod schema even though the tool is strict. The API strips numeric/string constraints from strict schemas.

## Phase 1: Catalog schema and access rules

### Overview

Create the empty `screening_catalog` table with its constraints, read-only public access that hides drafts, pgTAP coverage and regenerated types.

### Changes Required:

#### 1. Schema migration

**File**: `supabase/migrations/<timestamp>_screening_catalog.sql` (via `npx supabase migration new screening_catalog`)

**Intent**: Add the catalog table as reference data with no personal data, readable by anyone, writable only through migrations. Follow the S-01 header, section-banner, comment and RLS conventions. The change is additive only.

**Contract**: `public.screening_catalog` columns:

- `slug` text PK, check `^[a-z0-9]+(-[a-z0-9]+)*$`, length ≤ 64
- `status` text not null default `'draft'`, check in (`draft`, `active`, `retired`)
- display text, all not null: `name_pl`, `name_en`, `summary_pl`, `summary_en`, `how_to_access_pl`, `how_to_access_en`
- `eligibility` jsonb not null, check it is an array with ≥ 1 element
- `interval_kind` text not null, check in (`fixed`, `no_known_interval`, `shared_decision`, `per_program`)
- `interval_months` smallint null, check 1..240, plus check `(interval_kind = 'fixed') = (interval_months is not null)`
- `interval_overrides` jsonb not null default `'[]'`, check it is an array
- `evidence_level` smallint not null, check 1..3
- `evidence_source` text not null
- `burden_weight` smallint not null default 0, check 0..5
- `nfz_funded` boolean not null, `referral_required` boolean not null
- `sources` jsonb not null, check it is an array with ≥ 1 element
- `reviewed_by` text null, `last_reviewed` date null, `next_review_due` date null
- `created_at`, `updated_at` timestamptz default `now()`, plus a `screening_catalog_set_updated_at` trigger using `public.set_updated_at()`

Access:

- RLS enabled.
- Policy `screening_catalog_select_published` `for select to anon, authenticated using (status in ('active','retired'))`.
- `revoke all` from `anon, authenticated`, then `grant select` to both, plus the PG17-guarded `maintain` revoke.
- `comment on table` stating: public reference data, no personal data, rows are managed only by generated catalog migrations.

#### 2. pgTAP tests

**File**: `supabase/tests/database/screening_catalog.test.sql`

**Intent**: Prove the first anon-readable table is read-only and hides drafts, and that the check constraints reject malformed rows. This meets CLAUDE.md's "a case for every new policy or grant".

**Contract**:

- Own file, `begin … rollback`, `plan(N)`.
- Fixture rows are inserted as `postgres`: one each of `draft`, `active`, `retired`.
- Assertions:
  - `anon` and `authenticated` each see exactly the active and retired slugs.
  - INSERT, UPDATE and DELETE by `anon` and `authenticated` throw `42501`.
  - `ok(not has_table_privilege(...))` for INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER and REFERENCES, per role.
  - These throw `23514`: `fixed` without months, months with a non-fixed kind, a bad slug, an unknown status, empty `sources`, non-array `eligibility`, and `evidence_level` 4.
  - `updated_at` advances on update.

#### 3. Generated types

**File**: `src/lib/database.types.ts`

**Intent**: Regenerate so later phases and S-02 get the typed row.

**Contract**: `npm run db:types` output committed unchanged. The jsonb columns surface as `Json`.

### Success Criteria:

#### Automated Verification:

- Local database rebuilds from migrations: `npx supabase db reset`
- pgTAP suites pass, including the new file: `npx supabase test db`
- Generated types are current: `npm run db:types` leaves `git diff --exit-code src/lib/database.types.ts` clean
- Lint and type checks pass: `npm run lint` and `npx astro check`

#### Manual Verification:

- A REST read with the local publishable key (`curl "$API_URL/rest/v1/screening_catalog?select=slug" -H "apikey: $ANON_KEY"`) returns `[]` against the empty table, not a permission error

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Entry schema, validator and migration generator

### Overview

Define the entry format once and build the tooling around it:

- JSON entry files
- a published JSON Schema
- a validator with drift detection
- a deterministic snapshot migration generator
- the catalog check, wired into CI

### Changes Required:

#### 1. Dependencies and scripts

**File**: `package.json`

**Intent**: Add the pieces the pipeline needs, without putting script-only packages into the Worker bundle.

**Contract**:

- `zod@^4` becomes a direct `dependency`: S-02 will validate jsonb rows at runtime.
- `tsx` becomes a `devDependency`.
- New scripts: `catalog:check`, `catalog:migration`, `catalog:schema`, each running the matching `scripts/catalog/*.ts` via `tsx`

#### 2. Factor vocabulary

**File**: `src/lib/catalog/factors.ts`

**Intent**: The closed list of factors a rule may reference, and whether the profile collects each one today.

**Contract**: a const registry keyed by factor id. Each factor has a `kind` (`number` | `boolean` | `enum` with allowed values), `collected: boolean`, and, when collected, the `profiles` column it maps to.

- **Collected:** `smoking_status` (enum never/current/former), `pack_years`, `years_since_quitting`.
- **Not collected (initial set):**
  - `family_history_crc_first_degree`, `family_history_breast_ovarian`
  - `occupational_carcinogen_exposure`, `bmi`
  - `hypertension`, `dyslipidemia`, `diabetes`, `cardiovascular_disease`, `fatty_liver`
  - `hiv_or_immunosuppression`, `pregnancy`, `prior_cancer`, `hysterectomy`

Age and sex are branch fields, not factors. A module comment records the S-02 semantics from "Implementation Approach".

#### 3. Entry schema

**File**: `src/lib/catalog/schema.ts`

**Intent**: The single source of truth for a catalog entry. The validator, the TS types, the published JSON Schema and the drafter's tool schema all come from it.

**Contract**: exports `CatalogEntrySchema` (Zod) and `type CatalogEntry`. The shape mirrors the table columns, with these jsonb shapes:

- **`eligibility`:** `Branch[]` (≥ 1). `Branch = { sex?: 'female'|'male', age_min: int, age_max?: int, requires: Condition[] }`.
- **`Condition`:** `{ factor: FactorId, op: 'eq'|'in'|'gte'|'lte', value }`. Refinements:
  - `op` and `value` must match the factor's kind: number takes `gte`/`lte`/`eq`; boolean takes `eq`; enum takes `eq`/`in` with allowed values.
  - `age_min ≤ age_max`.
- **`interval_overrides`:** `{ when: { age_min?, age_max?, requires? }, months: int }[]`.
- **`sources`:** `{ url (https URI), title, publisher, quote (verbatim, non-empty), accessed (YYYY-MM-DD, not in the future) }[]` (≥ 1).
- **Interval refinement:** `interval_kind = 'fixed'` ⇔ `interval_months` present.

#### 4. Shared catalog library and CLIs

**Files**:

- `scripts/catalog/lib.ts`
- `scripts/catalog/check.ts`
- `scripts/catalog/migration.ts`
- `scripts/catalog/schema.ts`

**Intent**: Load and validate entry files, render the snapshot SQL, and detect drift. Every command fails loudly with per-file, per-path messages.

**Contract**:

- **`loadEntries()`:** reads `catalog/entries/*.json`. Requires filename = `<slug>.json` and unique slugs. Returns the entries sorted by slug.
- **`renderSnapshotSql(entries)`:** returns a deterministic migration body. It has a header comment ("generated by `npm run catalog:migration` — do not edit"). The body is a single `insert into public.screening_catalog (…) values … on conflict (slug) do update set …` covering every column except `slug` and `created_at`.
- **`catalog:migration`:** writes `supabase/migrations/<UTC yyyymmddhhmmss>_screening_catalog_snapshot.sql`. It refuses when the body equals the newest snapshot ("nothing to ship").
- **`catalog:check`:** exits non-zero on any of:
  - an invalid entry
  - `catalog/entry.schema.json` differing from `z.toJSONSchema(CatalogEntrySchema)`
  - the rendered body differing from the newest snapshot, with a hint to run `catalog:migration`
  - a slug present in any earlier snapshot missing from `catalog/entries/` (a deleted entry)

  With no snapshot yet and no entries, it passes.

- **`catalog:schema`:** rewrites `catalog/entry.schema.json`.

#### 5. Content folder

**Files**:

- `catalog/entry.schema.json` (generated)
- `catalog/entries/.gitkeep`
- `catalog/README.md`

**Intent**: A home for the content and a first version of the authoring guide. Phase 3 adds the drafting section.

**Contract**: `README.md` covers:

- the lifecycle `draft → active → retired`, and the never-delete rule
- the field meanings, the age/interval semantics, and the factor vocabulary
- the ship workflow: edit files → `catalog:check` → `catalog:migration` → commit → PR → CI `migrate`

#### 6. CI and repo docs

**Files**: `.github/workflows/ci.yml`, `README.md`, `CLAUDE.md`

**Intent**: Make the pipeline enforced, not optional, and record the new rule where agents read it.

**Contract**:

- **`ci.yml`:** the `ci` job runs `npm run catalog:check` after `npm ci`.
- **`README.md`:** a short "Screening catalog" section pointing to `catalog/README.md`.
- **`CLAUDE.md`:** one hard-rule line: catalog rows change only via `catalog/entries/*.json` + `npm run catalog:migration`; never hand-edit a `*_screening_catalog_snapshot.sql`; never delete an entry, retire it.

### Success Criteria:

#### Automated Verification:

- Catalog check passes on the empty catalog: `npm run catalog:check`
- Published JSON Schema is current: `npm run catalog:schema` leaves `git diff --exit-code catalog/entry.schema.json` clean
- Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- Worker bundle stays under the Free plan limit, with no Anthropic SDK or tsx in it: `npx wrangler deploy --dry-run` reports < 3 MiB

#### Manual Verification:

- A deliberately broken sample entry (e.g. age_min 80, age_max 50, and an unknown factor) placed in `catalog/entries/` makes `npm run catalog:check` print messages that point to the file and field, and the checks pass again once it is removed

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: LLM drafting script

### Overview

`npm run catalog:draft` drafts new entries with Claude Opus 5 and live web sources. It writes only schema-valid, previously unused slugs, and only as `draft`.

### Changes Required:

#### 1. Dependency and script

**File**: `package.json`

**Intent**: Add the Anthropic SDK for the owner-run script only.

**Contract**:

- `@anthropic-ai/sdk` is a `devDependency`.
- Script `catalog:draft` runs `scripts/catalog/draft.ts` via `tsx`.
- Nothing under `src/` may import it.

#### 2. Drafting script

**File**: `scripts/catalog/draft.ts`

**Intent**: Turn a topic, plus optionally the research report, into draft entries citing current Polish and international sources. Enforce the same schema and lifecycle rules as hand-written entries.

**Contract**:

- **CLI:** `npm run catalog:draft -- --topic "<text>" [--source <path>] [--max <n>] [--dry-run]`. `--source` defaults to none. For the first batch it is `context/foundation/screening-catalog-research.md`.
- **Credentials:** `new Anthropic()` resolves them from `ANTHROPIC_API_KEY` or an `ant auth login` profile. They are never read from `.env` or `.dev.vars`.
- **Request:**
  - `claude-opus-5`, `thinking: {type: "adaptive"}`, `output_config.effort: "high"`
  - streamed with `.finalMessage()`, `max_tokens` 64000
  - server-side refusal fallbacks enabled: `fallbacks: "default"` with beta `server-side-fallback-2026-07-01` on `client.beta.messages`
- **Tools:**
  - `web_search_20260209` with `max_uses` capped (default 20)
  - `web_fetch_20260209`
  - a custom `submit_entries` tool, `strict: true`, whose `input_schema` is `{ entries: CatalogEntry[] }` from the published JSON Schema
  - `tool_choice` auto, plus a prompt instruction to finish by calling `submit_entries`
- **Prompt content** (kept in `scripts/catalog/draft-prompt.md`):
  - the schema and field semantics, and the factor vocabulary with `collected` flags
  - the existing slugs and names, to avoid duplicates
  - instructions: prefer current (2025–2026) NFZ/MZ/Polish-society sources, cite each rule with a verbatim quote and URL, write PL and EN text, use informational wording only (no diagnosis, no risk scores, "consult your POZ doctor"), and use a non-fixed `interval_kind` when no interval is sourced
  - **no user or profile data, ever**
- **Handling:**
  - Continue on `pause_turn`.
  - On `refusal` or `max_tokens`, exit non-zero with the reason.
  - Parse the `submit_entries` input and validate each entry with `CatalogEntrySchema`.
  - Force `status: 'draft'` and null review fields.
  - Write valid entries whose slug is new to `catalog/entries/<slug>.json`. Report existing-slug skips and invalid entries with their errors.
- **Audit and cost:**
  - Always save the raw response to `catalog/.draft-runs/<timestamp>.json`, which is gitignored.
  - Print token usage and web search/fetch request counts.
- **Dry run:** `--dry-run` validates and reports without writing entry files.

#### 3. Pure response-handling core

**File**: `scripts/catalog/draft-core.ts`

**Intent**: Keep response handling free of I/O and API calls, so unit tests can be added later without refactoring.

**Contract**:

- `extractSubmittedEntries(message)` returns the entries or a typed failure: no tool call, refusal, max_tokens, or schema errors.
- `planWrites(entries, existingSlugs)` returns `{ write, skipExisting, invalid }` with status forced to `draft`.

#### 4. Authoring guide

**Files**: `catalog/README.md`, `.gitignore`

**Intent**: Document how the owner generates and reviews entries.

**Contract**:

- **`catalog/README.md` gains a "Drafting with Claude" section:**
  - credentials setup (`ant auth login` or an exported key; never a Cloudflare or GitHub secret)
  - example commands and a cost note (Opus 5 tokens plus per-search fees; start with `--max 5`)
  - a review checklist: open every source URL and confirm the quote; check ages, sex and interval against the quote; check PL/EN wording has no diagnostic claims; then set `status: "active"`
- **`.gitignore`** gains `catalog/.draft-runs/`.

### Success Criteria:

#### Automated Verification:

- Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- `@anthropic-ai/sdk` is not imported anywhere under `src/`: `grep -r "@anthropic-ai/sdk" src/` finds nothing

#### Manual Verification:

- With owner-approved spend, `npm run catalog:draft -- --topic "mammografia NFZ" --max 2 --dry-run` completes, prints usage, reports valid entries with https sources and verbatim quotes, and writes only the `.draft-runs` audit file

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: First real catalog batch

### Overview

Run the drafter over the research report's topics to produce roughly 20–30 entries. The owner reviews them and activates the approved ones. Then generate and verify the first snapshot migration.

### Changes Required:

#### 1. Draft entries

**File**: `catalog/entries/*.json`

**Intent**: Produce the first real content through the pipeline. At minimum cover:

- the NFZ/MZ programs: mammography, cervical HPV/cytology, colonoscopy, LDCT (kept `draft` until its Dz.U. 2026 poz. 976 details are confirmed), and Moje Zdrowie with its age-banded interval override
- the society checks: glucose/HbA1c, blood pressure, lipids
- the Moje Zdrowie extended items, PSA as `evidence_level` 1, and a vaccination review

Add further adult checks the drafter sources.

**Contract**: files are produced by `npm run catalog:draft` runs with `--source context/foundation/screening-catalog-research.md`. Manual edits during review must keep `npm run catalog:check` green.

#### 2. Owner activation

**File**: `catalog/entries/*.json`

**Intent**: Only owner-reviewed entries reach users.

**Contract**: the owner sets `status: "active"` on entries that pass the README review checklist. The rest stay `draft`. Review fields stay null (medical sign-off is the launch gate).

#### 3. Snapshot migration

**File**: `supabase/migrations/<timestamp>_screening_catalog_snapshot.sql`

**Intent**: Ship the batch through CI `migrate`.

**Contract**: generated by `npm run catalog:migration` and never hand-edited.

#### 4. Data sanity tests

**File**: `supabase/tests/database/screening_catalog.test.sql`

**Intent**: Catch shipping an empty or unpublished catalog, and prove drafts stay hidden with real data.

**Contract**:

- Bump `plan(N)`.
- As `anon`: at least 1 `active` row is visible, and 0 `draft` rows are visible.
- As `postgres`: every row has at least 1 source.

### Success Criteria:

#### Automated Verification:

- Catalog is valid and matches the newest snapshot: `npm run catalog:check`
- Local database applies the snapshot: `npx supabase db reset`
- pgTAP suites pass, including the data sanity checks: `npx supabase test db`
- Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`

#### Manual Verification:

- The owner has reviewed every `active` entry against its cited sources, per the `catalog/README.md` checklist
- A local REST read with the publishable key returns only active and retired entries, with PL and EN text and sources present
- After merge, CI `migrate` succeeds, and the production REST endpoint returns the active entries with the publishable key

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

Deferred by owner decision; not part of this change. These are candidates for when they are added:

- **Schema refinements:** every rejection rule has a failing case with a path-specific message.
- **Generator:** determinism across runs and input order, SQL escaping of `'` and `$$`, and drift detection (edited entry, deleted slug, stale JSON Schema).
- **Drafter core:** success, refusal, missing tool call, duplicate slug, invalid entry, and status forced to `draft`.

Until then, the generator and validator are exercised by `catalog:check` in CI and by the manual broken-entry check in Phase 2.

### Integration Tests:

- **pgTAP (access):** read-only access for `anon` and `authenticated`, drafts hidden, check constraints enforced, no dangerous privileges.
- **pgTAP (data):** the shipped snapshot has visible active rows and sources on every row.
- **CI:** `ci` runs `catalog:check`, and `smoke` runs pgTAP on a fresh `supabase start` that applies both migrations.

### Manual Testing Steps:

1. Read the empty table via local REST with the publishable key (Phase 1).
2. Break a sample entry and confirm `catalog:check` names the file and field (Phase 2).
3. Run a small `--dry-run` draft and inspect sources and quotes (Phase 3).
4. Review the batch, activate the approved entries, and read them back via REST locally and in production (Phase 4).

## Performance Considerations

The catalog is small (tens of rows), and no request path reads it in this change. The Worker bundle only gains `zod` once S-02 imports the schema. `@anthropic-ai/sdk` and `tsx` are dev-only, and Phase 2 checks the bundle size. Drafting cost scales with `--max` and web search uses, and the script prints both.

## Migration Notes

- Two migrations:
  - **Phase 1**, schema: additive, a new table.
  - **Phase 4**, generated data snapshot: an idempotent upsert.
- Later catalog changes are new snapshot migrations. Upserts never delete rows, and retired entries remain so future S-03/S-05 records keep resolving.
- A Worker rollback does not undo either migration (CLAUDE.md). Neither migration is needed by currently deployed code, so deploy order is safe.

## References

- Related research: `context/changes/screening-catalog-v1/research.md`
- S-02 consumer research: `context/changes/screening-recommendations/research.md`
- Content source: `context/foundation/screening-catalog-research.md`
- Table and RLS pattern: `supabase/migrations/20260927190303_onboarding_profile.sql:19-47`, `:77-129`
- Default-privilege revokes: `supabase/migrations/20260928061623_harden_consent_withdrawal.sql:33-42`
- pgTAP style: `supabase/tests/database/onboarding_profile.test.sql:13-14`, `:108`, `:128-131`
- Roadmap item: `context/foundation/roadmap.md` F-01 (issue #17)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Catalog schema and access rules

#### Automated

- [x] 1.1 Local database rebuilds from migrations: `npx supabase db reset` — d795b32
- [x] 1.2 pgTAP suites pass, including the new file: `npx supabase test db` — d795b32
- [x] 1.3 Generated types are current: `npm run db:types` leaves `git diff --exit-code src/lib/database.types.ts` clean — d795b32
- [x] 1.4 Lint and type checks pass: `npm run lint` and `npx astro check` — d795b32

#### Manual

- [x] 1.5 A REST read with the local publishable key returns `[]` against the empty table, not a permission error — d795b32

### Phase 2: Entry schema, validator and migration generator

#### Automated

- [x] 2.1 Catalog check passes on the empty catalog: `npm run catalog:check` — 09059ed
- [x] 2.2 Published JSON Schema is current: `npm run catalog:schema` leaves `git diff --exit-code catalog/entry.schema.json` clean — 09059ed
- [x] 2.3 Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build` — 09059ed
- [x] 2.4 Worker bundle stays under the Free plan limit, with no Anthropic SDK or tsx in it: `npx wrangler deploy --dry-run` reports < 3 MiB — 09059ed

#### Manual

- [x] 2.5 A deliberately broken sample entry makes `npm run catalog:check` print messages that point to the file and field, and the checks pass again once it is removed — 09059ed

### Phase 3: LLM drafting script

#### Automated

- [x] 3.1 Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`
- [x] 3.2 `@anthropic-ai/sdk` is not imported anywhere under `src/`: `grep -r "@anthropic-ai/sdk" src/` finds nothing

#### Manual

- [ ] 3.3 With owner-approved spend, a `--max 2 --dry-run` draft completes, prints usage, reports valid entries with https sources and verbatim quotes, and writes only the `.draft-runs` audit file

### Phase 4: First real catalog batch

#### Automated

- [ ] 4.1 Catalog is valid and matches the newest snapshot: `npm run catalog:check`
- [ ] 4.2 Local database applies the snapshot: `npx supabase db reset`
- [ ] 4.3 pgTAP suites pass, including the data sanity checks: `npx supabase test db`
- [ ] 4.4 Lint, type checks and build pass: `npm run lint`, `npx astro check` and `npm run build`

#### Manual

- [ ] 4.5 The owner has reviewed every `active` entry against its cited sources, per the `catalog/README.md` checklist
- [ ] 4.6 A local REST read with the publishable key returns only active and retired entries, with PL and EN text and sources present
- [ ] 4.7 After merge, CI `migrate` succeeds, and the production REST endpoint returns the active entries with the publishable key
