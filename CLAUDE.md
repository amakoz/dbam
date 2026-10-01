# Repository Guidelines

10x Astro Starter: an Astro 7 SSR app with React 19 islands, Tailwind 4, Supabase auth (`@supabase/ssr`), and shadcn/ui, deployed to Cloudflare Workers.

## Hard rules

- `SUPABASE_URL`/`SUPABASE_KEY` are server-only secrets declared via `astro:env/server` (`astro.config.mjs`) — never read them on the client or pass them through props.
- `SUPABASE_SECRET_KEY` is a server-only secret read only by `src/lib/reminders/admin-client.ts` (the cron job's client; lint forbids importing `@/lib/reminders/*` from pages, components, layouts and middleware) — never feed it to the SSR client. Every new `public` table must revoke all `service_role` privileges in its migration (a pgTAP guard in `supabase/tests/database/appointment_reminders.test.sql` fails otherwise).
- Auth API routes (`src/pages/api/auth/*.ts`) respond by redirecting with `?error=<code>`, not JSON — the code is translatable (`errors.auth.<code>` in `src/i18n`, mapped by `@src/lib/auth-errors.ts`), never raw error text. Match this shape for new auth endpoints (`@src/pages/api/auth/signin.ts`). Non-auth endpoints use the same shape with `errors.<code>` keys, translated by `errorMessageKey()` (`@src/lib/errors.ts`), and read forms with `readForm()` (`@src/lib/forms.ts`).
- New protected pages: add the path prefix to `PROTECTED_ROUTES` in `src/middleware.ts` instead of hand-rolling an auth check in the page.
- Merging PRs to `main` is human-only: never run `gh pr merge`. Open the PR, report check status, and stop. A merge to `main` deploys to production automatically once `ci` + `smoke` pass on `main` (GitHub Actions `migrate` then `deploy` jobs, no approval step); Cloudflare Workers Builds is disconnected, so never reconnect it.
- Against production, run `npm run smoke` only with `SMOKE_READONLY=1`: the full run signs up real `smoke-*@example.com` users in Supabase and sends confirmation emails that bounce. `scripts/smoke.mjs` refuses a non-local `BASE_URL` without it — never work around that guard.
- Never run `supabase config push` against the production project: local `supabase/config.toml` has `enable_confirmations = false` and `site_url = "http://127.0.0.1:3000"`. Change production auth settings in the Supabase dashboard only.
- Migrations reach production only through the CI `migrate` job (`supabase db push`, runs before `deploy`) — never run `supabase db push` against production by hand. Keep migrations additive-first: a Worker rollback never undoes a schema change. After a schema change run `npm run db:types` and commit `src/lib/database.types.ts`.
- Screening catalog rows change only through `catalog/entries/<slug>.json` + `npm run catalog:migration` (checked by `npm run catalog:check` in CI, see `@catalog/README.md`) — never hand-edit a `*_screening_catalog_snapshot.sql`, and never delete an entry: set `"status": "retired"`.

## Project Structure & Module Organization

`src/pages/` (routes, `api/` for endpoints), `src/components/` (`ui/` = shadcn primitives, `auth/` = feature forms), `src/layouts/`, `src/lib/` (Supabase client + `cn()` helper), `src/middleware.ts`. See `@README.md` for the full tree.

## Build, Test, and Development Commands

- `npm run dev` / `build` / `preview` — Cloudflare workerd runtime.
- `npm run lint` / `lint:fix` — ESLint with type-checked rules.
- `npm run format` — Prettier.
- `npm run smoke` — smoke test of auth, onboarding, profile edit and withdrawal against a running server (`BASE_URL` env), see `@scripts/smoke.mjs`.
- `npx supabase test db` — pgTAP tests for database access rules (`supabase/tests/`).
- `npm run ui:check` — hardcoded-value check over the views migrated to the design system, see `@scripts/ui-check.mjs`.

Pre-commit: husky + lint-staged run `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}` and `ui:check` when a migrated view is staged.

## Coding Style & Naming Conventions

- `@/*` path alias resolves to `./src/*`.
- Astro components for static layout; React components only where interactivity is needed.
- Merge conditional Tailwind classes with `cn()` (`@src/lib/utils.ts`) in React/TS, and with Astro's `class:list` in `.astro` files (lint rule `astro/prefer-class-list-directive`). Do not concatenate class strings manually.
- User-facing strings go through `src/i18n` (Polish default, `lang` cookie): add the key to `pl.ts` and `en.ts`, then use `createT(Astro.locals.locale)` in Astro or pass `locale` to islands. Plurals use `_one`/`_few`/`_many`/`_other` keys with `t.plural()`.
- shadcn/ui components live in `src/components/ui/` ("new-york" style, see `@components.json`); add new ones with `npx shadcn@latest add <name>`.

## UI

- Tokens live in `src/styles/global.css` (theme A "Len i szałwia": `light-dark()` values, tier-1..3 and success tokens published via `@theme inline`). Reference them by role (`bg-primary`, `text-muted-foreground`, `bg-tier-1`); add a missing value there, not in the view.
- Components live in `src/components/ui` — check there before creating one; add missing ones with `npx shadcn@latest add <name>`.
- No Tailwind palette classes (`bg-purple-600`, `text-white`), hex/rgb/oklch literals or arbitrary values (`p-[13px]`) in migrated views. The migrated files are listed in `@scripts/ui-check.mjs`; `npm run ui:check` fails on any hit (CI `ci` job and pre-commit). A view migrated by a follow-up change appends its files to that list and to the matching lint-staged glob in `package.json`.
- The kitchen sink at `/dev/kitchen-sink` (dev only, 404 in production) renders the tokens and components.

## Testing Guidelines

No unit suite is configured yet. Database access rules (RLS, grants, the withdraw function) are covered by pgTAP tests in `supabase/tests/` (`npx supabase test db`, run in CI's `smoke` job); add a case there for every new policy or grant. `npm run smoke` (`@scripts/smoke.mjs`) is an HTTP-level check of the auth and onboarding flows, not a substitute for unit tests — see `@README.md`.

## Commit & Pull Request Guidelines

No commit-message convention is established yet (single scaffold commit). PRs to `main` must pass `.github/workflows/ci.yml`: `ci` (lint, `ui:check`, `astro check`, build) and `smoke`.

## Security & Configuration Tips

Copy `@.env.example` to `.env` (Node/Supabase CLI) and `.dev.vars` (Cloudflare local dev, gitignored). In production, set `SUPABASE_URL`/`SUPABASE_KEY` as Cloudflare secrets, not plaintext vars.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill                                                            | Use it when                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Internal research (lesson focus)**                             |                                                                                                                                                                                                                                                |
| `/10x-research <change-id>`                                      | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`.                                 |
| **External research (lesson focus)**                             |                                                                                                                                                                                                                                                |
| exa.ai                                                           | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer.                                                                                                                   |
| Context7 (`resolve-library-id` → `get-library-docs`)             | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages.                                                                                                        |
| **Framing spare wheel**                                          |                                                                                                                                                                                                                                                |
| `/10x-frame <change-id>`                                         | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution**                                       |                                                                                                                                                                                                                                                |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan.                                                                                                                                 |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:

1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
