# Sources: code

- repo_root: /Users/amadeuszkozlowski/.herdr/worktrees/10xdevs/feat-domain-distillation
- code_scope: . (single application)
- head: 74c2d16 (dirty: context/changes/domain-distillation/ untracked — this run's own folder; code clean)
- path_alias: none

## Stack

- TypeScript; Astro 7 SSR (server-rendered pages + API routes) with React 19 islands; Tailwind 4, shadcn/ui.
- Supabase (Postgres + Auth via `@supabase/ssr`); SQL migrations with row-level security policies, grants and plpgsql functions.
- Runtime: Cloudflare Workers; a scheduled (cron) handler in `src/worker.ts`, schedule in `wrangler.jsonc`.
- Zod schemas for a JSON-file data set compiled into SQL migrations (`scripts/catalog/`).
- Tests: Vitest (unit, colocated), pgTAP (database), Playwright (browser).

## Layers

| layer             | path patterns                                                                                                                                                                                                                                                                                                   | notes                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| entry points      | `src/pages/**/*.astro`, `src/pages/api/**/*.ts`, `src/middleware.ts`, `src/worker.ts` (scheduled handler), `wrangler.jsonc` (cron triggers)                                                                                                                                                                     | API routes answer with redirects + `?error=<code>`; middleware holds the protected-route list       |
| application logic | `src/lib/**/*.ts` (non-test), notably `src/lib/reminders/`, `src/lib/screenings/`, `src/lib/catalog/`, top-level `src/lib/*.ts`                                                                                                                                                                                 | no separate service layer; logic sits in `src/lib` modules called from pages, routes and the worker |
| domain types      | no dedicated domain layer — types live in `src/lib/**` modules, Zod schemas in `src/lib/catalog/schema.ts`, and generated DB row types in `src/lib/database.types.ts` (generated, read for names only)                                                                                                          | absence of a domain layer is itself a finding                                                       |
| persistence       | `supabase/migrations/*.sql` (tables, enums, check constraints, RLS policies, grants, functions, triggers), `supabase/config.toml`, `catalog/entries/*.json` + `catalog/entry.schema.json` (data set compiled into migrations), `scripts/catalog/*.ts` (build-time validator and migration generator, run in CI) | `*_snapshot.sql` migrations are generated from `catalog/entries/`                                   |
| UI                | `src/pages/*.astro`, `src/components/**` (except `ui/`), `src/layouts/`, `src/i18n/pl.ts`, `src/i18n/en.ts`, `src/i18n/index.ts`                                                                                                                                                                                | i18n files hold user-facing copy in Polish (default) and English under shared keys                  |
| tests             | `src/**/*.test.ts` (Vitest), `supabase/tests/database/*.test.sql` (pgTAP), `tests/e2e/**` (Playwright)                                                                                                                                                                                                          |                                                                                                     |

## Excluded

| path                                                                                                                               | reason                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `context/domain/`                                                                                                                  | this run's own output                                                                    |
| `context/` (all other)                                                                                                             | documents, not code — handled by the documents inventory                                 |
| `src/components/ui/`                                                                                                               | vendored shadcn primitives                                                               |
| `src/lib/database.types.ts`                                                                                                        | generated from the schema (read only to confirm names; the migrations are authoritative) |
| `worker-configuration.d.ts`, `package-lock.json`                                                                                   | generated                                                                                |
| `scripts/smoke.mjs`, `scripts/ui-check.mjs`, `scripts/ui-shots.mjs`, `scripts/stop-lint.mjs`                                       | developer tooling, not the product                                                       |
| `.claude/`, `.husky/`, `.github/`, `.mcp.json`, `eslint.config.js`, `astro.config.mjs`, `playwright.config.ts`, `vitest.config.ts` | agent, CI and build configuration                                                        |
| `CLAUDE.md`, `AGENTS.md`, `README.md`, `catalog/README.md`                                                                         | documents — listed as reference documents for the docs agent                             |
| `public/`, `src/styles/`                                                                                                           | static assets and design tokens                                                          |
