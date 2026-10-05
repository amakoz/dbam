# Landing page on the design system, plus starter cleanup — Plan Brief

> Full plan: `context/changes/continue-ui-redesign/plan.md`
> Research: `context/changes/continue-ui-redesign/research.md`

## What & Why

The public landing page `/` still shows the starter template: a dark purple "cosmic" look that theme A explicitly rejects, hand-built buttons and cards with no focus rings, and copy that sells "10x Astro Starter" to developers instead of telling a 30+ adult what Dbam does. A signed-in visitor gets the same page with "Sign in" buttons. This change moves `/` onto theme A and the shared components, gives it Dbam copy, and removes every remaining starter trace from the repo (#61).

## Starting Point

`/dashboard` is already on theme A (tokens in `src/styles/global.css`, components in `src/components/ui`, guarded by `npm run ui:check`). The landing (`index.astro` → `Welcome.astro` → `Topbar.astro`) uses none of it: 53 hardcoded-value hits, 0 token classes. Starter names remain in the README, `CLAUDE.md`, `package.json`, `supabase/config.toml`, the favicon and two unused components.

## Desired End State

A signed-out visitor sees a calm linen-and-sage page in their system scheme: Dbam wordmark, a hero saying which screenings Dbam shows and why, sign-up/sign-in buttons, three "how it works" cards and a no-diagnosis/privacy note, all keyboard-visible. A signed-in visitor is sent to `/dashboard`. The repo carries Dbam's name, README and favicon, and the landing is on the `ui:check` list.

## Key Decisions Made

| Decision                    | Choice                                                                     | Why (1 sentence)                                                       | Source      |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| Signed-in visitor at `/`    | Redirect to `/dashboard`; delete `Topbar`                                  | One page state, no second signed-in header; sign-out → `/` still works | Plan (user) |
| Landing copy                | Agent drafts PL/EN from the PRD, owner reviews                             | Unblocks the plan; every claim traces to a built slice (S-01–S-03)     | Plan (user) |
| Reminder emails on the page | Not yet                                                                    | S-04 is still in progress; no public promise before it closes          | Plan (user) |
| Cleanup depth               | Full: leftovers, favicon, README rewrite, package and local Supabase names | Remove every starter trace; owner gets a list of their steps           | Plan (user) |
| New tokens                  | None                                                                       | Every value needed already exists in `global.css`                      | Research    |
| Button-styled links         | `buttonVariants()` on `<a>`                                                | `Button asChild` cannot wrap `.astro` children                         | Plan        |
| Page markup                 | In `index.astro`; `Welcome.astro` deleted                                  | Matches `dashboard.astro`, which holds its own markup                  | Plan        |
| Visual gate                 | Screenshots of `/` itself, no kitchen-sink section                         | Static page: only default is shown, other states are N/A               | Plan        |
| `bg-cosmic`                 | Stays                                                                      | Auth, 500, onboarding and profile still use it (#63 removes it)        | Research    |

## Scope

**In scope:**

- Signed-in redirect at `/`; new landing markup and copy in both locales
- Delete `Welcome`, `Topbar`, `Banner`, `ui/LibBadge`, `template.png`, `nav.notSignedIn`, the starter `home.*` keys
- New favicon (SVG + PNG fallbacks), README rewrite, `CLAUDE.md:3`, package name, Supabase `project_id`
- `index.astro` added to `ui:check` and lint-staged

**Out of scope:**

- Auth, 500, onboarding, profile restyles (#62, #63), tier rows (#67), removing `bg-cosmic`
- Reminder emails on the landing, a signed-in landing variant, Fraunces preload
- Worker rename and any production setting (GitHub, Supabase dashboard, Cloudflare)

## Architecture / Approach

Static Astro page, no island: React `ui/card` rendered server-side, `buttonVariants()` for link styling, `lucide-react` icons, token classes only. The redirect is a single check on `Astro.locals.user` in `index.astro`; middleware stays unchanged. Order follows `/10x-ui`: entry point → view → states → guard, with the local Supabase rename last so earlier phases verify on the current stack.

## Phases at a Glance

| Phase                        | What it delivers                                          | Key risk                                                      |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------- |
| 1. Entry point and leftovers | Signed-in redirect; unused starter files gone             | Missing a reference to a deleted file (grep + build catch it) |
| 2. Landing view on theme A   | New page from tokens and `ui/`, PL/EN Dbam copy           | Copy tone — owner reviews in check 2.9                        |
| 3. States and visual gate    | 7-state verdicts, screenshots light/dark × desktop/mobile | Contrast of muted text on linen in dark mode                  |
| 4. Identity, guard and docs  | Favicon, names, README, `ui:check` entry                  | `project_id` rename starts a new empty local Supabase stack   |

**Prerequisites:** local Supabase running (for smoke in Phase 1); `rsvg-convert` (installed) for the favicon PNGs.
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- The drafted copy is an assumption until the owner edits it; the PRD's positioning question (`prd.md:167`) stays open.
- Renaming `project_id` orphans the old local stack; the owner stops it when no other worktree session uses it.
- Safari 17.5 lacks SVG favicon support, so the PNG fallback must stay.

## On the Owner's Side

1. Review/edit the Polish and English copy (check 2.9).
2. After Phase 4: `npx supabase stop --project-id 10x-astro-starter`, then `npx supabase start` (when the shared stack is free).
3. Set the GitHub repo description and homepage if wanted (both empty today).
4. Merge the PR (deploys to production) and close #61.

## Success Criteria (Summary)

- A signed-out visitor understands what Dbam does and can sign up, on a page that looks like the dashboard's product, in both schemes and on mobile.
- A signed-in visitor never sees the landing.
- No starter name, file or icon remains, and `ui:check` fails on any literal added to the landing.
