# Screening Catalog v1 — Plan Brief

> Full plan: `context/changes/screening-catalog-v1/plan.md`
> Research: `context/changes/screening-catalog-v1/research.md`

## What & Why

Roadmap F-01 (#17): a curated catalog of screenings, each with:

- eligibility rules
- an evidence level for importance
- a repeat interval or an explicit "no known interval" kind
- cited sources

It is public and free of personal data. S-02 (the recommendations list, the north star) and S-05 (recurrence) both read it, and nothing is recommendable until it exists. The owner wants a broad catalog, not the research's 14 example rows. So this change delivers a strict schema and a pipeline that can take many LLM-drafted, owner-reviewed entries.

## Starting Point

- There is no catalog: no table, module or branch.
- The profile already stores birth year, sex, smoking status, pack-years and years since quitting.
- The repo has never shipped data in a migration or granted `anon` any table access. Production only gets migrations, never `seed.sql`.
- There is no unit-test runner.

## Desired End State

`public.screening_catalog` is live and readable with the publishable key. Visitors see only `active` and `retired` rows.

Content lives in `catalog/entries/<slug>.json`:

- `npm run catalog:draft` drafts new entries with Claude Opus 5 and live web sources, as `draft`.
- The owner reviews them and flips them to `active`.
- `npm run catalog:migration` ships them as a deterministic upsert migration through CI `migrate`.

A first batch of about 20–30 researched entries is in production.

## Key Decisions Made

| Decision           | Choice                                                                                                    | Why (1 sentence)                                                                                        | Source          |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| Storage            | Supabase table `screening_catalog`, slug PK, rows only via generated migrations                           | Gives S-03 a foreign-key target, a future cron a read path, and room for drafts                         | Plan            |
| Read access        | SELECT for `anon` + `authenticated`; RLS shows only `active`/`retired`                                    | "Publicly readable" per roadmap; drafts never leave the DB; the sessionless cron can read it later      | Plan            |
| Scope of content   | Broad catalog, the research rows are examples; first batch ~20–30 entries in this change                  | Users should get many ways to look after their health; S-02 needs real data                             | Plan (owner)    |
| Authoring          | JSON files + Zod schema + validator + snapshot generator + LLM drafting script                            | LLM output can only reach production after passing the same validator and owner review                  | Plan            |
| LLM                | Claude Opus 5 with server-side web search/fetch; strict `submit_entries` tool; owner-run only             | Sources must be current (2025–2026 program changes); the key never becomes a deploy secret              | Plan            |
| Go-live            | `draft → active` by the owner; `retired` instead of delete; medical sign-off tracked, not gating          | Honours "AI entries go live after review" without blocking the build on a doctor                        | Plan            |
| Eligibility format | Typed OR-branches (sex, age range, AND-conditions) over a closed factor vocabulary with `collected` flags | Validatable, LLM-friendly, stores rules the profile can't evaluate yet; research JSONLogic was invalid  | Research + Plan |
| Importance         | Store `evidence_level` (1–3) + `burden_weight`; S-02 derives the tier                                     | Keeps the research's explainable tier rule; the tier can change once due status exists                  | Plan            |
| Interval           | `interval_kind` + nullable `interval_months` + conditional overrides                                      | One entry covers age bands (Moje Zdrowie) and risk intervals; explicit "no known interval" for S-05     | Plan            |
| Age boundaries     | Inclusive, age = current year − birth year                                                                | Matches NFZ birth-year counting and S-01's arithmetic                                                   | Research + Plan |
| Display text       | PL/EN columns on the table, not i18n keys                                                                 | Hundreds of generated strings; `t()` can't typecheck DB-sourced slugs                                   | Research + Plan |
| Testing            | pgTAP for grants, draft hiding, constraints and data; unit tests deferred (owner adds later)              | Keeps CLAUDE.md's pgTAP rule for the first anon grant while shipping faster; pure modules stay testable | Plan (owner)    |

## Scope

**In scope:**

- the catalog table, RLS, grants and pgTAP tests
- the Zod schema and factor vocabulary, and the published JSON Schema
- `catalog:check` / `catalog:migration` / `catalog:schema` / `catalog:draft`
- the `catalog:check` CI step, and authoring docs
- the first reviewed batch and its snapshot migration

**Out of scope:**

- the eligibility evaluator and tier logic (S-02), and any dashboard UI
- exam records and the foreign key to the catalog (S-03/S-05)
- collecting new profile factors
- a production or scheduled AI job (#28), an admin UI, JSONLogic, and medical sign-off (launch gate #27)
- unit tests (deferred; the owner adds them later)

## Architecture / Approach

`src/lib/catalog/schema.ts` (Zod) is the single definition. From it come:

- the TS types
- `catalog/entry.schema.json`, used by the LLM tool and by authors
- the validator

The flow is:

1. Entry files are checked by `catalog:check` (validity, schema freshness, drift against the newest snapshot, no deleted slugs).
2. `catalog:migration` renders one sorted, escaped `insert … on conflict (slug) do update` snapshot migration.
3. CI `migrate` applies it to production.

The drafter (`scripts/catalog/draft.ts`) sends Claude Opus 5 the schema, the factor vocabulary, the existing slugs and optionally the research report. It uses web search and fetch, and receives entries through a strict tool. Valid new slugs are written as `draft`, and every raw response is saved locally for audit.

## Phases at a Glance

| Phase                                    | What it delivers                                                     | Key risk                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1. Catalog schema and access rules       | Empty table, anon/auth read-only with drafts hidden, pgTAP, types    | Supabase default privileges leaking write access to the first public table |
| 2. Entry schema, validator and generator | Zod schema, factor vocabulary, check/migration CLIs, CI check step   | Non-deterministic SQL causing false drift, or escaping bugs in Polish text |
| 3. LLM drafting script                   | `catalog:draft` with Opus 5 + web search, strict tool, audit log     | Hallucinated or stale sources; API cost; tool-loop edge cases              |
| 4. First real catalog batch              | ~20–30 reviewed entries, first snapshot migration, data sanity tests | Owner review effort; medical accuracy before sign-off                      |

**Prerequisites:** local Supabase running; an Anthropic credential (`ant auth login` or `ANTHROPIC_API_KEY`) for phases 3–4; owner time to review the batch.
**Estimated effort:** ~3–4 sessions across 4 phases, plus owner review time in phase 4.

## Open Risks & Assumptions

- **Content accuracy:** LLM-drafted content can misstate eligibility. Mitigated by verbatim quotes with URLs, owner review before `active`, and medical sign-off before public launch (#27).
- **Unverified facts:** LDCT stays `draft` until its regulation details are confirmed. The PSA age range and the blood-pressure interval remain for review.
- **Cost:** drafting has a real API cost (Opus 5 tokens plus per-search fees). Start with small `--max` runs.
- **Semantics:** the eligibility and interval semantics fixed here bind S-02 and S-05. Changing them later means migrating content.
- **Public read:** the catalog becomes readable over the REST API, which is acceptable because it holds no personal data.
- **No unit tests yet:** a bug in the validator or SQL generator (e.g. escaping of Polish text) is caught only by `catalog:check`, pgTAP, a failing `supabase db reset`, or manual review until the owner adds tests.

## Success Criteria (Summary)

- Anyone with the publishable key can read the active screening catalog in production, and drafts never appear.
- The owner can go from "research a topic" to "entry live in production" with three commands and a review, and malformed or unreviewed content can't get through.
- S-02 can start building the recommendations list against real, sourced entries.
