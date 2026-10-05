# UI Refactor: Theme A and Dashboard Redesign — Plan Brief

> Full plan: `context/changes/ui-refactor/plan.md`
> Research: `context/changes/ui-refactor/research.md`
> Token values: `context/changes/ui-refactor/directions.md` §A

## What & Why

- **What:** Dbam still wears the starter template's hardcoded "cosmic" purple/blue glass look, and the dashboard puts everything into one big card. This change gives the app its own calm identity, theme A "Len i szałwia" (linen and sage), and fully redesigns `/dashboard` on it.
- **The main pain (user):** everything is in one card.
- **Method:** the repo's `/10x-ui` workflow (charges → contract → states → gate → guard), so the new look lives in tokens and components, not in literals.

## Starting Point

- **Tokens:** `global.css` has correct stock shadcn tokens, but the dashboard's 8 files use none (0 token classes, about 130 palette classes). Dark mode isn't wired.
- **Components:** only `Button` exists as a shadcn component, and the dashboard hand-rolls buttons, cards, badges, alerts and fields.
- **Save feedback:** after saving, the page scrolls to the moved exam while the confirmation sits at the top.

## Desired End State

- **Look:** theme A in light and dark, following the system setting.
- **Layout:**
  - an app header (Dbam, Panel/Profil, language, sign out);
  - a short intro with a status line;
  - separate section cards: Your plans → tier 1 (most prominent) → tier 2 → tier 3 → May apply → Done;
  - a profile card;
  - a quiet footer disclaimer.
- **Exam rows:** each exam is a row with a tier label and an icon.
- **Save feedback:** the confirmation appears on the saved exam's row.
- **States:** a dev-only kitchen sink shows every state in both schemes.
- **Guard:** `npm run ui:check` keeps the dashboard free of hardcoded colours.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Global tokens + `/dashboard` only | `/10x-ui` one-view rule; other pages inherit the tokens later | Research (user) |
| Visual direction | A "Len i szałwia": sage primary, linen background, Fraunces + Figtree, 0.875rem radius | Warm, least clinical, clearly not a government site; AA contrast computed | Plan (user) |
| Other pages | Keep the cosmic look; follow-up issues (landing, auth + 500/404, onboarding + profile) | Keeps this change to one view; `bg-cosmic` is removed with the last follow-up | Plan (user) |
| Layout | App header + stacked section cards, tier 1 first | Fixes "everything in one card"; one task per section; works on mobile | Plan (user) |
| Exam items | Divided rows inside one card per section | Removes the box-in-box look; scans fast; keeps no-JS forms | Plan (user) |
| Colour scheme | Follow the system (`prefers-color-scheme`) via `light-dark()` tokens | Respects preference with no script; one token block; kitchen sink can force either scheme | Plan (user) |
| Save feedback | Confirmation and highlight at the saved row (redirect adds `&slug=`), with a top fallback | The browser already scrolls there; Post/Redirect/Get stays; smoke unchanged | Plan (user) |
| Guard | `CLAUDE.md` UI rule + `npm run ui:check` in lint-staged and CI, scoped to migrated files | A failing check beats a forgotten rule; unmigrated pages don't fail | Plan (user) |
| Components | shadcn Card, Badge, Alert, Input, Label rendered statically from `.astro`; native `<details>`/`<select>` | Real shared primitives with no JavaScript; keeps the accessibility decisions | Plan |
| Fonts | Astro fonts API, `latin` + `latin-ext`, self-hosted (`@fontsource` fallback) | Default `latin` lacks ą ć ę ł ń ś ź ż; no CDN fonts | Research |

## Scope

**In scope:**
- Theme A tokens, tier and success tokens, and the scheme wiring in `global.css`
- Fonts and five shadcn components
- Layout fixes (viewport, title "Dbam", token-based language switcher)
- New `AppHeader`, a restructured `dashboard.astro` and six rebuilt row/form components
- The `&slug=` success redirect and save feedback at the item
- Kitchen-sink page, `ui:check` script and CI step, `CLAUDE.md` rule, README

**Out of scope:**
- Restyling landing, auth, 500/404, onboarding and profile (follow-up issues)
- Removing starter leftovers
- A manual dark-mode toggle
- Any JavaScript or islands
- Logic, API or data changes
- Playwright or screenshot tooling

## Architecture / Approach

- **Tokens:** `global.css` holds theme A once, using `light-dark()` per variable, and `@theme inline` publishes it (existing `var()` mapping, plus tier and success).
- **Components:** the dashboard renders shadcn React components server-side without hydration, so plain POST forms keep working.
- **Order:** the phases follow `/10x-ui` (contract → view → states → guard). Every phase keeps the smoke contract green: the exact `data-*` attribute order and location prefixes are preserved.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Theme and component foundation | Theme A tokens (light and dark by system), fonts, shadcn components, layout fixes | Astro fonts API on the Cloudflare adapter (`@fontsource` fallback); a shadcn CLI touching `global.css` |
| 2. Dashboard shell and IA | App header, intro, separate section cards, profile card, footer | Mobile header layout |
| 3. Exam rows, forms, save feedback | Token-based rows with Badge/Button/Input/Alert; confirmation at the saved row | Breaking the smoke attribute order |
| 4. States and visual gate | Kitchen sink with the 7-state matrix in both schemes; screenshots | Dark-scheme contrast of tinted states |
| 5. Guard and docs | `CLAUDE.md` UI rule, `ui:check` in lint-staged and CI, README | The check list must grow with each follow-up |

**Prerequisites:**
- A branch `feat/ui-refactor`.
- Local Supabase for the full smoke. It is shared with the other worktree, so don't stop it while it's in use there.

**Estimated effort:** about 3–4 sessions across 5 phases, in one PR.

## Open Risks & Assumptions

- **Fonts on Cloudflare:** the Astro fonts API is unverified on the Cloudflare adapter, with `@fontsource-variable` as the fallback. Diacritic rendering is to be checked visually.
- **`light-dark()` support:** it assumes Baseline 2024 browsers, which fits the PRD's "last two major versions".
- **Transition period:** until the follow-ups land, the dashboard (theme A) and the other pages (cosmic) look different. The user accepted this.
- **Save feedback fallback:** a remove/undo for an exam that's no longer shown falls back to the top message.

## Success Criteria (Summary)

- The dashboard no longer feels like one card. It's a calm, sectioned page in theme A that follows the system light/dark setting, with tier 1 clearly first and legible without colour.
- After saving, the user sees the confirmation right where the page scrolls.
- Smoke, lint, `astro check` and `ui:check` pass, and screenshots in both schemes at desktop and mobile width are in the PR.
