<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Unit tests for the remaining pure modules (F-19)

- **Plan**: context/changes/pure-module-tests/plan.md
- **Mode**: Quick
- **Date**: 2026-10-28
- **Verdict**: REVISE (minor: two low-impact warnings, both one-line plan edits)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

Grounding: 8/8 paths ✓ (`src/lib/{password,profile,errors,auth-errors}.ts`, `src/lib/screenings/{rules,format}.test.ts`, `scripts/catalog/{lib,draft-core}.ts`), 14/14 symbols ✓ (`PASSWORD_MIN_LENGTH`, `MIN_AGE`, `isMessageKey`/`Object.hasOwn`, `MAX_APPOINTMENT_YEARS_AHEAD = 2`, `addYears`, `quote` at `lib.ts:152`, `SNAPSHOT_HEADER`, `DRAFT_FIELDS`, `config.toml:175,178`, …), brief↔plan ✓, Progress↔Phase ✓ (3 phases, 5/5/6 rows match the criteria), no `contract-surfaces.md` (skipped).

Spot-checked expected values against source: password boundaries and code-point counts, profile birth-year/age/packs/years boundaries, `packYears` rounding, Warsaw new-year and leap-day form bounds, `snapshotFileName`, `forbiddenSourceReason` cases, `extractSubmittedEntries` schema-error prefix. All agree with the code, except F1.

## Findings

### F1 — `renderTemplate("{{toString}}")` does not throw

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Drafter core, `renderTemplate` contract
- **Detail**: The plan (and research.md:210) says `{{toString}}` throws because of `Object.hasOwn` (`draft-core.ts:140`). But `PLACEHOLDER` is `/\{\{([A-Z0-9_]+)\}\}/g` (`draft-core.ts:134`), so a lowercase name never matches and is left as is, exactly like `{{lower}}`. Probed: `renderTemplate("{{toString}}", {})` returns `"{{toString}}"`. No `Object.prototype` property name fits `[A-Z0-9_]+`, so the `hasOwn` guard cannot be reached through a placeholder at all. As written, the test goes red on its first run. Under the plan's own rule ("if a test exposes a bug … stop for a decision"), that red test would cause a pointless stop.
- **Fix**: Replace the case with what the code does: `{{toString}}` is left as is (same row as `{{lower}}`). If the inherited-name guard should still be covered, use `renderTemplate("x", { toString: "y" })` → throws `no placeholder for toString`.
- **Decision**: FIX — `{{toString}}` pinned as left as is; a `{ toString: "y" }` value throws `no placeholder for toString` (orchestrator, 2026-10-28)

### F2 — Manifest-injection case can pass vacuously

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Generator and checker helpers, `parseSnapshotSlugs`
- **Detail**: The plan says that "a text value containing `\n-- catalog-slug: injected` is not read as a slug". `quote` keeps newlines, and row values are joined with `",\n"` (`lib.ts:184-186`), so the injected line renders as `-- catalog-slug: injected',`. Even if the header-only split (`lib.ts:218`) were removed, `MANIFEST_LINE` would capture `injected',`, not `injected`. An assertion like `not.toContain("injected")` therefore passes with or without the guard, and the plan has no deliberate break for this guard.
- **Fix**: Pin the case with `expect(parseSnapshotSlugs(sql)).toEqual([<the real slugs, sorted>])`, which fails on any extra slug, whatever its spelling.
- **Decision**: FIX — `toEqual` on the full sorted slug list (orchestrator, 2026-10-28)

### F3 — `continuationContent` skips its `server_tool_use` pairing branch

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Drafter core, `continuationContent`
- **Detail**: The contract covers dropping `thinking`/`tool_use` before the boundary. It does not cover the subtlest rule in the function: before the boundary, a `server_tool_use` stays only when some block's `tool_use_id` answers it (`draft-core.ts:349-357`). `redacted_thinking` is not covered either. These are the cases most likely to regress.
- **Fix**: Add two blocks before the boundary: one `server_tool_use` with a matching `web_search_tool_result` (kept) and one without (dropped). Optionally add a `redacted_thinking` block (dropped).
- **Decision**: FIX — both `server_tool_use` cases plus `redacted_thinking` (orchestrator, 2026-10-28)

### F4 — `"__proto__"`/`"constructor"` cases don't test what the plan says

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Key Discoveries (`isMessageKey` bullet); Phase 1 — Error-code mapping
- **Detail**: Key Discoveries justifies these cases with "inherited property names fall back to `errors.unknown`". But `errorMessageKey` looks up `` `errors.${code}` `` (`errors.ts:8`), and `authErrorCode` looks up `` `errors.auth.${code}` ``. Neither `"errors.__proto__"` nor `"errors.constructor"` is an inherited name, so the cases would still pass if `isMessageKey` used `key in pl`. The cases are harmless and cheap to keep, but they don't guard `Object.hasOwn`, and a reader could think they do.
- **Fix**: Keep the cases, but describe them as "free-text fallbacks". Drop the inherited-property rationale from Key Discoveries, or point it at a direct `isMessageKey("toString")` case if that guard matters (`src/i18n` is outside F-19's list).
- **Decision**: FIX — described as free-text fallbacks; inherited-property rationale dropped (orchestrator, 2026-10-28)

### F5 — The "no shift" `formatDay` case is blind in a UTC or Warsaw process

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Form bounds and date wording, `formatDay`
- **Detail**: The plan says "`2026-01-01` stays on 1 January (UTC formatting, no shift)". Nothing sets `TZ` (`vitest.config.ts`, `package.json` and `ci.yml` have none), so the case runs in the host time zone. UTC midnight shifts to the previous day only in zones west of UTC. In CI (UTC) and locally (Warsaw), dropping `timeZone: "UTC"` still prints 1 January, so the case cannot catch that regression. The Honolulu deliberate break proves the tests react to an explicit wrong zone, not to a missing one.
- **Fix**: Mark this case as documentation, not as a guard. Or make it real: add a deliberate break that deletes the `timeZone` option, run under `TZ=America/New_York npx vitest run src/lib/screenings/format.test.ts`, and expect red.
- **Decision**: FIX — deliberate break deletes the `timeZone` option and must go red under `TZ=America/New_York` (orchestrator, 2026-10-28)
