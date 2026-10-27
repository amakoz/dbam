# Decisions: domain-distillation

## 2026-10-27 Skill choices delegated to the worker

- **Previous report:** none exists (`context/domain/` absent) — no archive step, `previous: none`. decided-by: worker
- **Code scope:** whole repository (single application); vendored shadcn primitives, generated types and dev tooling excluded (`context/domain/evidence/0-sources.md`). decided-by: worker
- **Report language:** English (language of the request); Polish domain terms kept as the sources spell them, paired with their English code names in the glossary — the roadmap risk for F-14 (`context/foundation/roadmap.md:151`). decided-by: worker
- **i18n files as code, not documents:** `src/i18n/pl.ts` / `en.ts` are the UI layer, so the code-language agent reads them and the docs agent does not; the synthesis pairs their Polish copy with code identifiers. Options: (a) code layer (b) reference document. Chose (a) — the skill's inventory puts "translation and copy files" in the UI layer and keeps the docs/code split independent. decided-by: worker
- **`catalog/entries/*.json` as persistence:** the files are the source of truth compiled into migrations (`catalog/README.md:3`), so they are code-side data; `catalog/README.md` is a reference document. decided-by: worker
- **`context/map/repo-map.md`:** given to the docs agent as a narrative _analysis_ for vocabulary and history only, never as evidence of a rule (the skill excludes earlier domain analyses as evidence; the orchestrator named it as input). decided-by: worker
- **Code-rules split:** not split — ~130 source files, far below the ~1,500 threshold. decided-by: worker
- **Owner-routed questions** go to the report's Questions section, not to the orchestrator (orchestrator instruction). decided-by: orchestrator
- **Roadmap status:** F-14 left untouched in `roadmap.md` (worker protocol; `/10x-archive` flips it). decided-by: orchestrator

## 2026-10-27 Synthesis choices

- **#1 moved up:** the "exam for a user" aggregate (declared, Core) ranks above the first-time-eligibility policy (ignored, Core). Reason: data blast radius — D-01, D-02, D-03 and backlog B-04 all hit the same implicit object — while #2 is blocked on an owner decision (Q-03). The skill allows a written move-up. decided-by: worker
- **Core = two subdomains:** screening recommendation and screening follow-through (incl. when to prompt); reminder dispatch mechanics are Supporting. Evidence: `prd.md:18,32,36`. decided-by: worker
- **Doc-vs-doc conflicts** (PRD v3 vs later change folders) go to _Stale documents_, not to the drift table, per the skill; no drift row has fix side _docs_. decided-by: worker
- **Glossary pairs** przesiew ↔ `screening_*` and termin ↔ `appointment_date` are inferred from i18n keys and copy (no document states them); recorded as an inference in the report's limitations. decided-by: worker
- **Owner-routed questions** Q-01..Q-10 recorded in the report, not sent to the orchestrator. decided-by: orchestrator

## 2026-10-27 Stages and acceptance

- Question: run plan / plan-review / impl-review for this change?
- Options: (a) full 10x chain (b) skip — `/10x-domain-distillation` is a one-shot analysis skill.
- Choice: (b). The orchestrator checked `context/domain/` against the F-14 outcome (ubiquitous language with PL+EN terms and code names, subdomains, invariants with enforcement status, drift, ranked fix list with done-when, glossary) and accepted it.
- decided-by: orchestrator
