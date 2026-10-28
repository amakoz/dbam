# Decisions — pure-module-tests

## 2026-10-28 Catalog scope

- **Question:** Which `scripts/catalog` functions get tests? (research.md, Open Questions 1)
- **Options:** (a) pure functions only: the uncovered pure exports of `lib.ts` plus all of `draft-core.ts`; (b) (a) plus `loadEntries`/`listSnapshots`/`newestMigrationVersion` in a temp dir; (c) (b) plus the Prettier-backed `renderJsonSchema`/`renderEntryFile`.
- **Choice:** (a).
- **Evidence:** F-19 outcome names "pure modules" (`context/foundation/roadmap.md:117`); `catalog:check` runs the disk readers and renderers on every `ci` run (`context/archive/2026-10-05-unit-test-suite/plan.md`, "What We're NOT Doing").
- **Decided by:** orchestrator

## 2026-10-28 Password policy parity

- **Question:** Should `password.test.ts` read `supabase/config.toml`? (research.md, Open Questions 2)
- **Options:** (a) yes: assert `minimum_password_length` equals `PASSWORD_MIN_LENGTH` and `password_requirements` is `"letters_digits"`; (b) pin `12` only.
- **Choice:** (a), checking both values.
- **Evidence:** CLAUDE.md hard rule (policy must match `supabase/config.toml` and the dashboard); precedent for reading repo files in a test: `src/lib/catalog/rule-entry.test.ts:1,15`. Both keys occur once, under `[auth]` (`supabase/config.toml:175,178`).
- **Decided by:** orchestrator

## 2026-10-28 Complexity and question budget

- **Question:** How complex is the plan and how many planning questions remain?
- **Choice:** LOW; 0 further questions. Research settled the contracts, the clock question (no source change) and the exclusions; the orchestrator answered the two open scope questions.
- **Decided by:** worker (delegated by orchestrator)

## 2026-10-28 Phase split

- **Question:** How to split the work into phases?
- **Options:** (a) one phase; (b) two phases (`src/lib`, `scripts/catalog`); (c) three phases (form and error modules, screening date/format helpers, catalog scripts).
- **Choice:** (c). Each phase touches at most 4 test files, so it stays under the worker protocol's 5-file threshold for in-context implementation, and each has its own green gate and commit. All three go into one PR.
- **Decided by:** worker (delegated by orchestrator)

## 2026-10-28 Incidental behaviour

- **Question:** Which incidental behaviours found in research do the tests pin?
- **Choice:** Pin `errorMessageKey("__proto__")`/`("constructor")` → `errors.unknown` (the privacy guarantee "raw query text is never rendered", `src/lib/errors.ts:3-4`). Do not pin `isIsoDate("0000-01-01")` → true, `forbiddenSourceReason("a/../../x")` → null (its only caller normalises the path, `scripts/catalog/draft.ts:150-151`), or the cross-namespace `errorMessageKey("auth.<code>")` lookup: none is a decided contract, and pinning them would freeze accidents.
- **Decided by:** worker

## 2026-10-28 Excluded `draft.ts` helpers

- **Question:** Test the unexported helpers in `scripts/catalog/draft.ts`?
- **Choice:** No. The module runs top-level CLI code (`draft.ts:397`), so testing them means moving them to `draft-core.ts`, which is a source change outside "tests only".
- **Decided by:** worker

## 2026-10-28 Roadmap status

- **Choice:** `roadmap.md` stays untouched during plan and implement (worker protocol, orchestrator instruction); `/10x-archive` sets `done`. The skill's `planning` flip is skipped.
- **Decided by:** orchestrator

## 2026-10-28 Plan review triage

- **Question:** How to handle the plan-review findings (`plan-review.md`, verdict REVISE, minor)?
- **Choice:** Fix all five in the plan before implementing:
  - F1: `{{toString}}` is left as is (the placeholder pattern is upper case only, `scripts/catalog/draft-core.ts:134`); add a throws case with a `{ toString: "y" }` value.
  - F2: the manifest-injection case asserts `toEqual` on the full sorted slug list.
  - F3: `continuationContent` covers a `server_tool_use` with and without an answering block, plus `redacted_thinking`.
  - F4: the `__proto__`/`constructor` cases are described as free-text fallbacks; the inherited-property rationale is dropped from the plan and corrected in research.md.
  - F5: the Phase 2 deliberate break deletes the `timeZone` option in `formatDay` and must go red under `TZ=America/New_York`.
- **Evidence:** `plan-review.md` F1–F5.
- **Decided by:** orchestrator

## 2026-10-28 Impl review triage

- **Question:** How to handle impl-review F1 (the "no shift" date cases guard only in a west-of-UTC process; `impl-review.md`, verdict APPROVED)?
- **Options:** (a) pin a west-of-UTC `TZ` for the unit run in this change; (b) defer to a follow-up.
- **Choice:** (b). It would change the Vitest config, which the plan excludes ("What We're NOT Doing"). Recorded in `follow-ups/pin-test-tz.md` and listed in the PR body's follow-ups.
- **Evidence:** `impl-review.md` F1; the Progress 2.4 break showed red under `TZ=America/New_York` and green in the Warsaw host zone.
- **Decided by:** orchestrator
