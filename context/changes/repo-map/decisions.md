# Decisions — repo-map

## 2026-10-27 History window

- Question: which history window to scan (skill default `12 months ago`).
- Options: (a) default 12 months; (b) a shorter `--since`.
- Choice: (a). History starts 2026-09-24 (cdeff9a), so the whole history (~5 weeks, 61 commits) is the window; trend buckets are ISO weeks per the scan contract.
- Evidence: `git log --reverse` first commit date; `references/scan-contract.md` bucket rule.
- Decided-by: worker (delegated by orchestrator).

## 2026-10-27 Report language

- Question: report language (`--lang` not given).
- Options: (a) English; (b) Polish.
- Choice: (a) English — the request and all `context/` artifacts are in English; section headings stay the English fixed names that F-12 will look up.
- Evidence: request text; `references/report.md` heading rule.
- Decided-by: worker.

## 2026-10-27 Replace existing map

- Question: replace an existing `context/map/repo-map.md`?
- Choice: not applicable — no map existed, so nothing was moved to `context/archive/` (which workers must not write to anyway).
- Decided-by: worker.

## 2026-10-27 Capability cut

- Question: how to cut the inventory beyond the five capabilities named in the roadmap item (onboarding and consent, recommendations, exam records, reminders and nudges, catalog curation).
- Options: (a) only those five plus the three catch-all buckets; (b) add accounts, ops alerting, localisation and public site as separate capabilities.
- Choice: (b). Sign-in and route gating are an identity capability with their own routes; `/api/health`, heartbeat and failure alerts are operator-facing; i18n is a repo-wide string hub. Folding them into catch-alls would push catch-alls past the skill's 40 % limit and hide the auth surface.
- Evidence: `context/map/.work/scan-contract.md` coverage (unmapped 0 %, platform + shared 28.9 % of code changes).
- Decided-by: worker.

## 2026-10-27 Identities and agent co-authors

- Question: how to count one human with two git identities and the AI `Co-authored-by` trailers.
- Choice: one human (`humans_in_window: 1`). AI co-authored commits are human commits; agents are never people. Every concentration figure is the single-owner baseline and is reported as an unknown, not as ownership.
- Evidence: author/trailer counts in `.work/git-log.txt`; `references/false-signals.md` rules 6–7.
- Decided-by: worker.

## 2026-10-27 Generated files in the noise filter

- Question: whether to count the generated catalog snapshot migrations, `worker-configuration.d.ts` and `src/lib/database.types.ts`.
- Choice: exclude the snapshot migrations and `worker-configuration.d.ts` (each says it is generated in its first lines); keep `database.types.ts` (no marker) but mark it as mechanical regeneration lockstep.
- Evidence: line 1 of `supabase/migrations/*_screening_catalog_snapshot.sql`, line 2 of `worker-configuration.d.ts`.
- Decided-by: worker.

## 2026-10-27 Roadmap status

- Choice: `roadmap.md` is left unchanged, as the orchestrator instructed. `/10x-archive` flips F-11 later.
- Decided-by: orchestrator.
