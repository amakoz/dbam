# Repository Guidelines

10x Astro Starter: an Astro 7 SSR app with React 19 islands, Tailwind 4, Supabase auth (`@supabase/ssr`), and shadcn/ui, deployed to Cloudflare Workers.

## Hard rules

- `SUPABASE_URL`/`SUPABASE_KEY` are server-only secrets declared via `astro:env/server` (`astro.config.mjs`) — never read them on the client or pass them through props.
- Auth API routes (`src/pages/api/auth/*.ts`) respond by redirecting with `?error=<code>`, not JSON — the code is translatable (`errors.auth.<code>` in `src/i18n`, mapped by `@src/lib/auth-errors.ts`), never raw error text. Match this shape for new auth endpoints (`@src/pages/api/auth/signin.ts`). Non-auth endpoints use the same shape with `errors.<code>` keys, translated by `errorMessageKey()` (`@src/lib/errors.ts`), and read forms with `readForm()` (`@src/lib/forms.ts`).
- New protected pages: add the path prefix to `PROTECTED_ROUTES` in `src/middleware.ts` instead of hand-rolling an auth check in the page.
- Merging PRs to `main` is human-only: never run `gh pr merge`. Open the PR, report check status, and stop. A merge to `main` deploys to production automatically once `ci` + `smoke` pass on `main` (GitHub Actions `migrate` then `deploy` jobs, no approval step); Cloudflare Workers Builds is disconnected, so never reconnect it.
- Against production, run `npm run smoke` only with `SMOKE_READONLY=1`: the full run signs up real `smoke-*@example.com` users in Supabase and sends confirmation emails that bounce. `scripts/smoke.mjs` refuses a non-local `BASE_URL` without it — never work around that guard.
- Never run `supabase config push` against the production project: local `supabase/config.toml` has `enable_confirmations = false` and `site_url = "http://127.0.0.1:3000"`. Change production auth settings in the Supabase dashboard only.
- Migrations reach production only through the CI `migrate` job (`supabase db push`, runs before `deploy`) — never run `supabase db push` against production by hand. Keep migrations additive-first: a Worker rollback never undoes a schema change. After a schema change run `npm run db:types` and commit `src/lib/database.types.ts`.

## Project Structure & Module Organization

`src/pages/` (routes, `api/` for endpoints), `src/components/` (`ui/` = shadcn primitives, `auth/` = feature forms), `src/layouts/`, `src/lib/` (Supabase client + `cn()` helper), `src/middleware.ts`. See `@README.md` for the full tree.

## Build, Test, and Development Commands

- `npm run dev` / `build` / `preview` — Cloudflare workerd runtime.
- `npm run lint` / `lint:fix` — ESLint with type-checked rules.
- `npm run format` — Prettier.
- `npm run smoke` — smoke test of auth, onboarding, profile edit and withdrawal against a running server (`BASE_URL` env), see `@scripts/smoke.mjs`.
- `npx supabase test db` — pgTAP tests for database access rules (`supabase/tests/`).

Pre-commit: husky + lint-staged run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Coding Style & Naming Conventions

- `@/*` path alias resolves to `./src/*`.
- Astro components for static layout; React components only where interactivity is needed.
- Merge conditional Tailwind classes with `cn()` (`@src/lib/utils.ts`) in React/TS, and with Astro's `class:list` in `.astro` files (lint rule `astro/prefer-class-list-directive`). Do not concatenate class strings manually.
- User-facing strings go through `src/i18n` (Polish default, `lang` cookie): add the key to `pl.ts` and `en.ts`, then use `createT(Astro.locals.locale)` in Astro or pass `locale` to islands. Plurals use `_one`/`_few`/`_many`/`_other` keys with `t.plural()`.
- shadcn/ui components live in `src/components/ui/` ("new-york" style, see `@components.json`); add new ones with `npx shadcn@latest add <name>`.

## Testing Guidelines

No unit suite is configured yet. Database access rules (RLS, grants, the withdraw function) are covered by pgTAP tests in `supabase/tests/` (`npx supabase test db`, run in CI's `smoke` job); add a case there for every new policy or grant. `npm run smoke` (`@scripts/smoke.mjs`) is an HTTP-level check of the auth and onboarding flows, not a substitute for unit tests — see `@README.md`.

## Commit & Pull Request Guidelines

No commit-message convention is established yet (single scaffold commit). PRs to `main` must pass `.github/workflows/ci.yml`: `ci` (lint, `astro check`, build) and `smoke`.

## Security & Configuration Tips

Copy `@.env.example` to `.env` (Node/Supabase CLI) and `.dev.vars` (Cloudflare local dev, gitignored). In production, set `SUPABASE_URL`/`SUPABASE_KEY` as Cloudflare secrets, not plaintext vars.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
