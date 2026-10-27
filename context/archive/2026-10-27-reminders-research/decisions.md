# Decisions — reminders-research

## 2026-10-27 Is the reminder pipeline the right feature for F-12?

- **Question:** the roadmap F-12 unknown "Is the reminder pipeline the right feature? … if the map ranks another capability hotter, switch to it before research starts."
- **Options:** (a) keep the reminder pipeline; (b) switch to exam records.
- **Choice:** (a) keep the reminder pipeline.
- **Evidence:** `context/map/repo-map.md` ranks the reminder pipeline as risk zone #1 ("### 1. Reminder pipeline (reminders)") and exam records as #2.
- **Decided by:** orchestrator

## 2026-10-27 Sub-agent budget and split

- **Question:** how to split the investigation within the worker protocol's limit of 2 sub-agents.
- **Options:** (a) one TS-side trace + one SQL-side/history trace, with the AST and catalog queries run in the main context; (b) one agent per job.
- **Choice:** (a). The per-job split would make every agent read the same shared modules (`chain.ts`, `email.ts`, the claim RPCs); the TS/SQL split matches the seam the map calls invisible.
- **Evidence:** worker protocol ("dispatch at most 2"); `context/map/repo-map.md` Real couplings ("invisible to imports and lint").
- **Decided by:** orchestrator (max 2), worker (split)

## 2026-10-27 Where the AST queries live and how SQL claims are checked

- **Question:** the AST tooling and the format of the evidence.
- **Options:** (a) TypeScript compiler API from `node_modules/typescript` (6.0.3); (b) `npx --yes @ast-grep/cli`.
- **Choice:** (a). The checker answers type questions (contextual types of the job-name literals, `Database` RPC keys and return types) that a pattern matcher can't. No dependency added. The script is kept in `queries/ast-queries.mjs.txt` (the `.txt` suffix keeps it out of `eslint .` and `astro check`, since `context/` is not lint-ignored) with its raw output in `queries/ast-output.txt`. SQL claims were checked read-only (`begin transaction read only` … `rollback`) against local Supabase on 127.0.0.1:54322 under the shared DB lock: `queries/catalog-queries.sql` and `queries/catalog-output.txt`.
- **Evidence:** `eslint.config.js` lints `**/*.{js,jsx,ts,tsx}` (+ ESLint's default `.mjs`), `tsconfig.json` includes `**/*`.
- **Decided by:** worker

## 2026-10-27 Roadmap status

- **Question:** flip F-12 to in-progress?
- **Choice:** no. The worker protocol forbids roadmap status changes during research; `/10x-archive` sets `done`.
- **Decided by:** orchestrator

## 2026-10-27 Skip plan, plan-review and impl-review

- **Question:** does F-12 go through `/10x-plan`, `/10x-plan-review` and `/10x-impl-review`?
- **Options:** (a) run the full chain; (b) archive after research.
- **Choice:** (b). F-12 is research-only. The orchestrator checked `research.md` against the F-12 outcome (end-to-end trace, coverage gaps, blast radius, 17 AST/SQL-verified debt claims) and accepted it.
- **Decided by:** orchestrator

## 2026-10-27 SD-3 product question does not block

- **Question:** should a retired catalog entry stop appointment reminders (SD-3)?
- **Choice:** goes to the owner via the PR and feeds F-13; it does not block this change.
- **Decided by:** orchestrator
