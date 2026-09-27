# Repository Guidelines

10x Astro Starter: an Astro 7 SSR app with React 19 islands, Tailwind 4, Supabase auth (`@supabase/ssr`), and shadcn/ui, deployed to Cloudflare Workers.

## Hard rules

- `SUPABASE_URL`/`SUPABASE_KEY` are server-only secrets declared via `astro:env/server` (`astro.config.mjs`) — never read them on the client or pass them through props.
- Auth API routes (`src/pages/api/auth/*.ts`) respond by redirecting with `?error=<code>`, not JSON — the code is translatable (`errors.auth.<code>` in `src/i18n`, mapped by `@src/lib/auth-errors.ts`), never raw error text. Match this shape for new auth endpoints (`@src/pages/api/auth/signin.ts`).
- New protected pages: add the path prefix to `PROTECTED_ROUTES` in `src/middleware.ts` instead of hand-rolling an auth check in the page.
- Merging PRs to `main` is human-only: never run `gh pr merge`. Open the PR, report check status, and stop. A merge to `main` deploys to production automatically once `ci` + `smoke` pass on `main` (GitHub Actions `deploy` job, no approval step); Cloudflare Workers Builds is disconnected, so never reconnect it.
- Against production, run `npm run smoke` only with `SMOKE_READONLY=1`: the full run signs up real `smoke-*@example.com` users in Supabase and sends confirmation emails that bounce. `scripts/smoke.mjs` refuses a non-local `BASE_URL` without it — never work around that guard.
- Never run `supabase config push` against the production project: local `supabase/config.toml` has `enable_confirmations = false` and `site_url = "http://127.0.0.1:3000"`. Change production auth settings in the Supabase dashboard only.

## Project Structure & Module Organization

`src/pages/` (routes, `api/` for endpoints), `src/components/` (`ui/` = shadcn primitives, `auth/` = feature forms), `src/layouts/`, `src/lib/` (Supabase client + `cn()` helper), `src/middleware.ts`. See `@README.md` for the full tree.

## Build, Test, and Development Commands

- `npm run dev` / `build` / `preview` — Cloudflare workerd runtime.
- `npm run lint` / `lint:fix` — ESLint with type-checked rules.
- `npm run format` — Prettier.
- `npm run smoke` — auth-flow smoke test against a running server (`BASE_URL` env), see `@scripts/smoke.mjs`.

Pre-commit: husky + lint-staged run `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Coding Style & Naming Conventions

- `@/*` path alias resolves to `./src/*`.
- Astro components for static layout; React components only where interactivity is needed.
- Merge conditional Tailwind classes with `cn()` (`@src/lib/utils.ts`) — do not concatenate class strings manually.
- User-facing strings go through `src/i18n` (Polish default, `lang` cookie): add the key to `pl.ts` and `en.ts`, then use `createT(Astro.locals.locale)` in Astro or pass `locale` to islands. Plurals use `_one`/`_few`/`_many`/`_other` keys with `t.plural()`.
- shadcn/ui components live in `src/components/ui/` ("new-york" style, see `@components.json`); add new ones with `npx shadcn@latest add <name>`.

## Testing Guidelines

No unit/integration suite is configured yet. `npm run smoke` (`@scripts/smoke.mjs`) is a build-sanity check for the auth flow, not a substitute for real tests — see `@README.md`.

## Commit & Pull Request Guidelines

No commit-message convention is established yet (single scaffold commit). PRs to `main` must pass `.github/workflows/ci.yml`: `ci` (lint, `astro check`, build) and `smoke`.

## Security & Configuration Tips

Copy `@.env.example` to `.env` (Node/Supabase CLI) and `.dev.vars` (Cloudflare local dev, gitignored). In production, set `SUPABASE_URL`/`SUPABASE_KEY` as Cloudflare secrets, not plaintext vars.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
