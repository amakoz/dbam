---
date: 2026-10-05T11:47:30Z
researcher: Claude (Opus 5.5) for Amadeusz Kozlowski
git_commit: af314e8aa8c8aa2fd43aa039c88ce18c6f4a03d8
branch: feat/ui-refactor
repository: amakoz/dbam
topic: "/10x-ui audit of the landing page `/` (#61): charges against theme A, plus the starter leftovers"
tags: [research, ui, landing, design-system, welcome, topbar, i18n, starter-cleanup]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
---

# Research: landing page `/` against the design system (#61)

**Date**: 2026-10-05T11:47:30Z
**Researcher**: Claude (Opus 5.5) for Amadeusz Kozlowski
**Git Commit**: af314e8aa8c8aa2fd43aa039c88ce18c6f4a03d8
**Branch**: feat/ui-refactor
**Repository**: amakoz/dbam

## Research Question

This is the `/10x-ui` two-way audit of one view, `/`. The page is `src/pages/index.astro`, which renders `src/components/Welcome.astro`, which renders `src/components/Topbar.astro`. The audit asks:

- Which literals should come from theme A tokens or from `src/components/ui`?
- What does a visitor see at this entry point, signed out or signed in?
- Which starter leftovers listed in #61 can go?

The output is 3–5 charges for `/10x-plan`.

## Summary

- **The landing page has not moved onto theme A at all.** Across the view's three files there are 0 token classes and 0 imports from `src/components/ui`.
- **The hardcoded-value scan has 53 hits.** `Welcome.astro` has 40 on 20 lines and `Topbar.astro` has 13 on 7 lines. `index.astro` has 0.
- **The page still looks like the starter.** It uses the "cosmic" design that theme A's own avoid-list rules out: purple/indigo orbs, a star field, a gradient h1 and white-on-dark glass cards.
- **The page still describes the starter.** The h1 is "10x Astro Starter", and the three feature cards talk about authentication, the tech stack and developer experience. None of it says what Dbam does for a 30+ adult.
- **Signed-in visitors see the same page.** `/` is public and has no signed-in branch other than the `Topbar` strip. A signed-in visitor sees their email next to "Sign in" / "Sign up" buttons.
- **The cleanup list is safe.**
  - `Banner.astro` and `ui/LibBadge.astro` have no importers.
  - `template.png` is referenced only by `README.md:3`.
  - No smoke or CI check asserts on landing content.
  - The only smoke check that involves `/` is the sign-out redirect target (`scripts/smoke.mjs:332`).

## Charges

Each charge gives a file:line and the effect on the user. The plan must address each one or mark it **deferred** with a reason.

### C1. Missing tokens: the landing still paints the cosmic theme (category: missing tokens)

- **Evidence:**
  - The wrapper is `bg-cosmic` (`src/components/Welcome.astro:8`, the `@utility` at `src/styles/global.css:84-86` with hex stops).
  - Three blurred purple/blue/indigo orbs use arbitrary sizes and blurs (`Welcome.astro:10-12`).
  - The star field is an inline `style` with `rgba(255,255,255,…)` (`:17`).
  - The h1 is a `from-blue-200 via-purple-200 to-pink-200` gradient with `text-transparent` (`:25`).
  - Body text is `text-blue-100/70` and `/60` (`:28,64,85,105`).
  - The CTAs use `bg-purple-600` with `text-white` (`:32`) and `border-white/20` (`:38`).
  - The cards use `border-white/10 bg-white/5` (`:47,67,88`).
  - Icons are `text-purple-300` (`:58,78,99`) and card titles `text-white` (`:63,84,104`).
  - `Topbar.astro` repeats the same pattern: `border-white/10 bg-white/5 … text-white/80` (`:8`), `text-blue-100/70` (`:11,25`) and `text-purple-300 hover:text-purple-100` links (`:13,17,27,30`).
- **Should be:** `bg-background`, `text-foreground` / `text-muted-foreground`, `font-heading` for headings, `bg-card` / `border-border` via `ui/card`, and `bg-primary` via `ui/button`. All of these are already defined in `src/styles/global.css:12-81`, so the change needs no new token for the core.
  - The orbs and the star field have no theme A equivalent. Theme A is "warm, natural, editorial" (`context/archive/2026-09-30-ui-refactor/directions.md:18-21`).
  - Its avoid-list names "purple or indigo gradients (the current `bg-cosmic` and gradient h1)" (`context/archive/2026-09-30-ui-refactor/research.md:226-227`).
- **Effect on the user:** the only public page looks like a different product from the linen-and-sage dashboard the visitor lands on after signing in.
  - #61's 2026-10-05 comment adds one more effect. Under a light system scheme, the floating language pill (`bg-card`, already on theme A) shows as a light pill on the dark cosmic background.
  - Under a dark scheme, native controls render dark on the hex gradient.

### C2. Missing shared component: hand-built buttons, cards and icons (category: missing shared component)

- **Evidence:**
  - The two CTAs are `<a>` tags with hand-written button classes (`Welcome.astro:30-41`). They don't use `buttonVariants` from `src/components/ui/button.tsx:7-37`, whether through `<Button asChild>` or the class helper.
  - The three feature cards are hand-built `div`s (`Welcome.astro:47-106`) instead of `Card` / `CardHeader` / `CardContent` (`src/components/ui/card.tsx`).
  - The icons are three inline 24×24 SVGs (`Welcome.astro:48-62,68-83,89-103`). The app's other views take icons from `lucide-react`, for example `AppHeader.astro:1` and `dashboard.astro:2-11`.
  - `Topbar.astro:13-30` hand-builds four nav links and a sign-out `<button>`, where `AppHeader.astro` uses `Button variant="ghost"` and a shared `focusRing` string (`AppHeader.astro:18,47`).
- **Effect on the user:** keyboard users get no themed focus ring on any landing control. `Welcome.astro` and `Topbar.astro` contain 0 `focus-visible` classes.
  - The only focus styling is the base `outline-ring/50` (`global.css:90`) plus the browser default, drawn on the dark gradient.
  - The CTAs also don't share the hover, disabled or size behaviour of the dashboard's buttons, so the two pages drift further apart with every change to `ui/button`.

### C3. Accidental architecture: the page sells the starter, not Dbam (category: accidental architecture)

- **Evidence:**
  - `home.title` is "10x Astro Starter" in both locales (`src/i18n/pl.ts:18`, `src/i18n/en.ts:20`).
  - `home.subtitle` and `home.features.{auth,stack,dx}.*` describe the starter's auth, stack and DX (`pl.ts:19-28`, `en.ts:21-28`).
  - The browser tab already says "Dbam" (`meta.title`, used by `src/layouts/Layout.astro:15`), so the h1 and the `<title>` disagree.
  - The 8 `home.*` keys are used only by `Welcome.astro` (`:26,28,63-64,84-85,104-105`).
  - `nav.notSignedIn` is used only by `Topbar.astro:25`.
- **What the page could say instead.** This is sourced from the PRD and roadmap, and only covers what is built:
  - **Problem:** adults 30+ in Poland forget or postpone age-appropriate screenings, and nothing prompts them when they become eligible (`context/foundation/prd.md:18`).
  - **Who it's for:** busy adults 30+ with no health-tracking habit (`prd.md:24`).
  - **Built (S-01):** consent and a minimal profile.
  - **Built (S-02):** due screenings grouped into three tiers, "important — schedule now", "worth planning" and "talk to your doctor" (`prd.md:101-103`, `roadmap.md:48`).
  - **Built (S-03):** plan an exam with an optional appointment date, or mark it done (`roadmap.md:49`).
- **Reminder emails (S-04): don't claim them yet.** The roadmap marks S-04 `in-progress` (`roadmap.md:50`), even though the S-04 PR #66 is in the git log (`d85fe14`).
  - Emails are sent from a verified Resend domain, and the site stays on `workers.dev` (`roadmap.md:105`).
  - S-05 to S-07 are only proposed (`roadmap.md:51-53`).
- **Guardrails for the copy:**
  - The copy must never state or imply a diagnosis (`prd.md:40`).
  - The avoid-list excludes alarm red, stock photos of doctors and anything like a risk meter (`archive/2026-09-30-ui-refactor/research.md:225-232`).
  - No source requires explicit "not medical advice" text. A short "no diagnosis, your data stays private" line is inferred from `prd.md:40-41` and the privacy NFR, not required.
- **Effect on the user:** a 30+ visitor can't tell what the product does or why to sign up. The page talks to developers.

### C4. Accidental architecture: a signed-in visitor gets the signed-out landing (category: accidental architecture)

- **Evidence:**
  - `/` is not in `PROTECTED_ROUTES` (`src/middleware.ts:5-13`), so the request passes straight through (`:29-31`).
  - `index.astro:6-8` has no user branch.
  - `Topbar.astro:9-22` is the only signed-in difference. It shows the user's email (`:11`), a `/dashboard` link and a sign-out form.
  - `Welcome.astro:30-41` shows "Sign in" / "Sign up" CTAs to everyone.
- **How a signed-in user reaches `/`:**
  - typing the root URL or using a bookmark;
  - the locale endpoint's fallback (`src/pages/api/locale.ts:18`, plus `safeNext` at `:27`);
  - `500.astro:28-29` ("Home").
- **Sign-out lands on `/`.** `src/pages/api/auth/signout.ts:9` redirects there, and smoke asserts this 302 target (`scripts/smoke.mjs:332`).
- **After authentication, users land elsewhere:**
  - sign-in goes to `/dashboard` (`signin.ts:24`);
  - sign-up goes to `/auth/confirm-email` (`signup.ts:28`);
  - the email callback goes to `/dashboard` (`callback.ts:30`).
- **Effect on the user:** an already signed-in user is invited to sign in again. Their email is shown at the top of a marketing page instead of the app header they know from `/dashboard` (`AppHeader.astro`).
  - Two shapes would fix it:
    - (a) `index.astro` redirects a signed-in user to `/dashboard`;
    - (b) the page swaps its CTAs for "Go to dashboard" and drops `Topbar`.
  - Choosing between them is a product decision for the plan. Either way, smoke's sign-out expectation (302 → `/`) is unaffected, because that request is signed out once it completes.

### C5. Missing shared component: starter leftovers, including a second, hex-coloured alert (category: missing shared component / dead code)

- **Evidence:**
  - `src/components/Banner.astro` has 0 importers in `src/`. It is a second alert primitive with hex colours in a scoped `<style>` (`Banner.astro:27-41`, 9 scan hits) that shadows `src/components/ui/alert.tsx`.
  - `src/components/ui/LibBadge.astro` has 0 importers.
  - `public/template.png` is referenced only by `README.md:3`.
  - "10x Astro Starter" still names the project in `README.md:1` and `CLAUDE.md:3`, and in `context/foundation/tech-stack.md:26` (historical: the starter it was built from, so it may stay).
  - `Topbar.astro` is imported only by `Welcome.astro:2,21`.
- **Effect on the user:** visitors are not affected directly. The next agent is: it finds a ready-made `Banner` with hex colours and an unused `LibBadge` in `ui/`, and either may get reused instead of `ui/alert` / `ui/badge`. The README screenshot shows the starter, not Dbam.

## Detailed Findings

### Source → views (token and component use)

- **Token source:** theme A lives in `src/styles/global.css:12-42`. These are `light-dark()` values in `:root` that follow the system scheme, published at `:45-81` via `@theme inline` with `--font-sans` (Figtree) and `--font-heading` (Fraunces).
- **`bg-cosmic` must stay for now.** The legacy `@utility bg-cosmic` (`:83-86`) is still used by `signin.astro:15`, `signup.astro:14`, `confirm-email.astro:24`, `500.astro:12`, `onboarding.astro:41` and `profile.astro:50`. Its removal belongs to #63 (`archive/2026-09-30-ui-refactor/plan.md:59,458`).
- **`src/components/ui`** contains `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx` and `LibBadge.astro`.
- **The landing reads none of this.** It has 0 token classes and 0 `ui/` imports across `index.astro`, `Welcome.astro` and `Topbar.astro`. By contrast, `dashboard.astro` and `AppHeader.astro` import `ui/button`, `ui/card`, `ui/alert` and `lucide-react`.
- **`Layout.astro` needs no change.**
  - It already gives `body` `bg-background text-foreground` (`global.css:92-94`); `Welcome.astro:8` paints over it with `bg-cosmic`.
  - It renders the floating `LanguageSwitcher` unless `hideLanguageSwitcher` is set (`Layout.astro:31`), and that component is already migrated (`scripts/ui-check.mjs:17`).
  - It preloads only Figtree. Fraunces (`font-heading`) loads on demand (`Layout.astro:24-26`), so a Fraunces hero h1 costs a non-preloaded font request on the landing.

### View → source (structure and accessibility)

- **Landmarks:** the page has no `<main>` landmark and no skip link. `index.astro` → `Welcome.astro:8` is a bare `div`, whereas the dashboard has both (`dashboard.astro:147-155`).
- **Heading levels:** the feature cards use `h3` directly under the `h1` (`Welcome.astro:63,84,104`), with no `h2`, so the outline skips a level.
- **Icons:** the decorative SVGs carry no `aria-hidden` (`Welcome.astro:48,68,89`).

### 7-state matrix: what applies to this view

These are the inputs the plan needs for its states phase. The verdicts are this audit's own reading.

- **default, hover, focus-visible:** apply to the CTAs and the header links. Focus-visible is currently missing, see C2.
- **disabled:** probably N/A. The page has only links, plus the sign-out button if C4 keeps a signed-in header.
- **error:** N/A on `/` itself. Errors are handled by `500.astro` (#62) and the auth pages.
- **empty:** N/A. The page is static and takes no data. The C4 signed-in variant is the closest thing to a second state.
- **loading:** N/A. The page is server-rendered with no async data, the same verdict as the dashboard's kitchen sink (`kitchen-sink.astro:204-209`).

Visual gate: the existing kitchen sink renders dashboard blocks only (`kitchen-sink.astro:20-22`). For a page with no data states, the gate can be screenshots of `/` itself in light and dark, at desktop and one mobile width, with both C4 variants if they differ.

### Guard wiring (Make it stick)

- **`ui:check` file list:** the list to append to is `MIGRATED` in `scripts/ui-check.mjs:12-19`. A listed file that doesn't exist fails the check (`:25-28`), so deleted files must not be listed.
- **lint-staged:** the matching lint-staged glob is `package.json:76`, `"{src/pages/dashboard.astro,…,src/components/recommendations/*.{astro,ts}}"`.
- **Agent rule:** `CLAUDE.md`'s UI section already holds the rule. It needs no new text, only the list growing.

## Code References

- `src/pages/index.astro:1-8`: the landing route, which renders `Welcome` in `Layout`
- `src/components/Welcome.astro:8-108`: the cosmic wrapper, orbs, star field, hero, CTAs and feature cards
- `src/components/Topbar.astro:8-35`: the starter's top strip with signed-in and signed-out branches
- `src/components/Banner.astro:11-41`: an unused alert with hex colours
- `src/components/ui/button.tsx:7-37`: `buttonVariants`, the source for the CTA classes
- `src/components/ui/card.tsx`: `Card` and its subparts
- `src/components/AppHeader.astro:18-53`: the signed-in header, with `focusRing` and a ghost sign-out button
- `src/styles/global.css:12-95`: theme A tokens, `@theme inline`, the legacy `bg-cosmic` and base styles
- `src/layouts/Layout.astro:15-31`: the default title, fonts and floating language switcher
- `src/middleware.ts:5-13,29-31`: `PROTECTED_ROUTES`, which does not include `/`
- `src/pages/api/auth/signout.ts:9`: redirects to `/`
- `src/i18n/pl.ts:14,18-28`, `src/i18n/en.ts:16,20-28`: `nav.notSignedIn` and the `home.*` starter copy
- `scripts/ui-check.mjs:12-19`, `package.json:76`: the guard lists to extend
- `scripts/smoke.mjs:332`: the sign-out → `/` assertion. No smoke check requests `/` itself.

## Architecture Insights

- **Static pages put token classes straight in the markup.** `dashboard.astro` and `AppHeader.astro` render React `ui/*` components from `.astro` without hydration, and use `class:list` with token classes. The landing can follow the same pattern without adding an island.
- **The two headers have different jobs.** `AppHeader` is the signed-in header and links `/dashboard` and `/profile`. `Topbar` exists only for the landing. After C4, the landing needs either no header (redirect variant) or a small public header (wordmark plus sign-in). It should not keep a second signed-in header.
- **Theme follows the system.** It is `prefers-color-scheme` only, with no toggle (`global.css:4-5`), so the landing gets light and dark from the tokens for free once the literals are gone.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-ui-refactor/change.md:14,18` set the scope rule: one view per change, with the follow-ups #61 (landing + starter branding), #62 (auth + 500/404) and #63 (onboarding + profile, which retires `bg-cosmic`).
- `context/archive/2026-09-30-ui-refactor/plan.md:59-60` assigns the removal of `Welcome`, `Topbar`, `Banner`, `ui/LibBadge`, `template.png` and the `home.*` / README branding to the landing follow-up. This is consistent with C3 and C5. The plan for #61 decides whether `Welcome` and `Topbar` are deleted or rewritten.
- `context/archive/2026-09-30-ui-refactor/research.md:90-91` deferred `home.*` and the unused leftovers to #61. Its claim that `meta.title` became "Dbam" still holds (`Layout.astro:15`). The historical counts (Welcome 40, Topbar 13, Banner 9) match today's scan.
- `context/archive/2026-09-30-ui-refactor/directions.md:18-21` describes theme A: Fraunces 500–600 headings, Figtree body, generous cards, "one idea per card".
- GitHub #61 comment (2026-10-05): theme A already shifts the landing a little (radius, `color-scheme`, the language pill), so the "before" screenshots should account for that.

## Related Research

- `context/archive/2026-09-30-ui-refactor/research.md`: the dashboard audit and the theme A decision
- `context/archive/2026-09-30-ui-refactor/directions.md`: the theme directions and the values behind `global.css`

## Open Questions

1. **C4 shape (product decision):** should a signed-in visitor at `/` be redirected to `/dashboard`, or see the landing with a "Go to dashboard" CTA? This decides whether the page needs a public header at all.
2. **Landing copy:** who writes the Polish and English hero, subtitle and feature text, and how many features? Candidates come from S-01 to S-03 (C3). The positioning is still an open question in the PRD (`prd.md:167`).
3. **Reminder emails on the landing:** may the landing mention them? S-04 is `in-progress` in `roadmap.md:50`, even though PR #66 is merged in the git log. Check the actual production state before claiming it.
4. **`public/favicon.png`:** it was not checked whether this is the starter's icon. If it is, it's a candidate for the C5 cleanup or a deferral.
5. **`CLAUDE.md:3` and `README.md:1` wording:** the project-description fix is in #61's scope (C5). `context/foundation/tech-stack.md:26` records the starter historically and may stay.
