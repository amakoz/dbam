# UI Refactor: Theme A and Dashboard Redesign Implementation Plan

## Overview

This plan replaces the starter template's hardcoded "cosmic" purple/blue glass look with theme A, "Len i szałwia" (linen and sage: warm, natural, calm), and fully redesigns `/dashboard`.

- The new tokens in `src/styles/global.css` become the single source of colour, type and radius. The palette follows the user's system light/dark setting.
- The dashboard stops being one big card. It gets an app header, separate section cards, and exam rows inside them.
- After a save, the confirmation appears at the exam the user just saved.
- Other pages keep their current look until their own follow-up changes (GitHub issues created with this plan).

The method is the repo's `/10x-ui` skill: charges, then a design-system contract, a 7-state matrix, a visual gate and a guard.

## Current State Analysis

Full evidence is in `context/changes/ui-refactor/research.md`.

- **Tokens:** `global.css:6-111` holds correct stock shadcn tokens (oklch), but the dashboard's 8 files use **0 token classes** and about 130 palette classes.
  - The look comes from `@utility bg-cosmic` (`global.css:113-115`), the glass card `bg-white/10 border-white/10 backdrop-blur-xl` (`dashboard.astro:103`) and a blue→purple gradient h1 (`dashboard.astro:105`).
  - Dark mode isn't wired: nothing sets `.dark`.
- **Page structure:** all of it sits inside one `max-w-2xl` card (`dashboard.astro:102-225`). A single h2 "Recommendations" wraps the flash message, error, disclaimer, plans, tiers, "may apply" and done (`:113-198`); profile and sign-out come after it (`:200-224`). There is no header, `<main>` or skip link (`Layout.astro:23-26`).
- **Components:** only shadcn `button.tsx` exists, and the dashboard hand-rolls 6 buttons, 5 cards, badges, alerts, form fields and two `<details>` styles.
  - Nothing has `focus-visible` or `disabled` styles.
  - Tiers differ by near-white heading colour only (`dashboard.astro:154`).
- **Save feedback:** after a save, `/api/screenings` redirects to `/dashboard?saved=<intent>#screening-<slug>` (`api/screenings.ts:47`). The `role="status"` message renders at the top while the browser scrolls to the (moved) item.
- **Other pages:** each paints its own `bg-cosmic` and `text-white`, so they are unaffected by `:root` token changes as long as the `bg-cosmic` utility stays.
- **Smoke contracts:** `scripts/smoke.mjs:151-298` asserts exact attribute sequences on dashboard items, and compares redirect locations by path plus a query **prefix** (`:314-317`). The sequences are:
  - `data-slug="…" data-tier="1"` and `data-slug="…" data-tier="1" data-last-done="2020-01"` (`RecommendationItem.astro:31-34`);
  - `data-slug="…" data-maybe` (`MaybeRecommendationItem.astro:21`);
  - `data-plan data-slug="…" data-appointment="…"` (`PlanItem.astro:34-37`);
  - `data-done data-slug="…"` (`DoneItem.astro:24-27`).

## Desired End State

- **Light and dark:** `/dashboard` renders on theme A. Colours, fonts and radius come only from tokens, and the palette follows the system light/dark setting.
- **Layout, top to bottom:**
  - app header;
  - page intro with a status line;
  - separate section cards: Your plans → tier 1 (visually strongest) → tier 2 → tier 3 → May apply → Done;
  - a compact profile card;
  - a footer disclaimer.
- **Exam rows:** each exam is a row in its section card, with its tier shown as a label plus an icon (not colour alone). Details and plan/done forms open in native `<details>`, with no JavaScript.
- **Save feedback:** after plan, unplan, done or undone, the saved exam's row shows the confirmation and a highlight, and the browser scrolls to it. If that exam isn't on the page, the confirmation shows at the top.
- **States:** a dev-only kitchen-sink page shows the row states in light and dark side by side.
- **Guard:** `npm run ui:check` fails on hardcoded colours or arbitrary values in the dashboard files, and `CLAUDE.md` tells the next agent where the tokens and components live.
- **Verify:** Progress checklist at the bottom, plus desktop and mobile screenshots in both schemes.

### Key Discoveries:

- **Clean token mapping:** `@theme inline` only contains `var()` references (`global.css:75-111`), so theme values can be replaced in `:root` without touching the mapping (research §A).
- **shadcn React components need no JavaScript:** Card, Badge, Alert, Button and Input render as static HTML from `.astro` without `client:*`. The page keeps plain POST forms and needs no island.
  - Radix-based Collapsible and Select need JS, so native `<details>`/`<select>` stay (the prior accessibility decision in `context/archive/2026-09-28-screening-recommendations/plan-brief.md:37`).
- **Fonts:** Astro's fonts API defaults to `subsets: ["latin"]` and weight 400. That subset lacks ą ć ę ł ń ś ź ż, so every entry needs `subsets: ["latin","latin-ext"]` and a weight range (research §D). CDN fonts are not allowed; self-host (`screening-catalog-research.md:138`).
- **Theme A values and contrast:** in `context/changes/ui-refactor/directions.md`. All key pairs pass AA in light and dark (computed).
- **Unchanged i18n keys to reuse:** `nav.dashboard` ("Panel"), `nav.signout`, `dashboard.profile.edit`, and the `dashboard.screenings.saved.*` / `dashboard.recommendations.*` keys.

## What We're NOT Doing

- **Restyling other pages:** landing, auth (sign-in, sign-up, confirm-email), 500/404, onboarding and profile. Each gets a follow-up issue. `@utility bg-cosmic` stays until the last of them lands.
- **Starter leftovers:** removing `Welcome.astro`, `Topbar.astro`, `Banner.astro`, `ui/LibBadge.astro`, `public/template.png`, and the `home.*` / README starter branding. That belongs to the landing follow-up.
- **A manual light/dark toggle:** the palette follows the system setting only (user decision).
- **JavaScript on the dashboard:** no React islands, fetch-based saving, or Radix Collapsible/Select. Post/Redirect/Get stays.
- **Behaviour changes:** no change to recommendation logic, tiers, data, the API contract, or `/api/screenings` behaviour beyond adding `&slug=` to the success redirect.
- **New test tooling:** no Playwright or screenshot runner. The visual gate is the kitchen-sink page plus manual screenshots.
- **Renaming tier semantics:** the three tier groups, their i18n headings and their `data-tier` values stay.

## Implementation Approach

This follows the `/10x-ui` router order: environment/library → token values → one view → states → guard.

- **Phase 1** sets up the contract: theme A tokens, fonts, shadcn components and layout basics. The unmigrated pages look unchanged after it, apart from the new body font.
- **Phases 2–3** rebuild the view on that contract: first the page shell and sections, then the exam rows and forms.
- **Phase 4** proves the states.
- **Phase 5** leaves the guard.

Every phase keeps the smoke contract green.

## Critical Implementation Details

- **One token block for both schemes.** Declare `color-scheme: light dark` on `:root`, and give each theme-A token its light and dark value through `light-dark(<light>, <dark>)`, using the values in `directions.md`.
  - Setting `color-scheme: dark` or `light` on any element then forces that subtree. The kitchen sink uses this to show both schemes side by side.
  - Native controls (date input, select) follow the scheme automatically, which replaces the `[color-scheme:dark]` hack in `ScreeningActions.astro:29`.
  - Point `@custom-variant dark` at `@media (prefers-color-scheme: dark)`, so the few `dark:` utilities (e.g. in `button.tsx`) agree with the tokens. Remove the unused `.dark` block.
  - `light-dark()` is Baseline 2024, which fits the PRD's "last two major versions".
- **Keep the smoke attribute order.** The smoke test does substring matching, so each list item must keep its attributes in exactly the current order and adjacency:
  - `id`, `data-slug`, `data-tier`, `data-last-done` on tier rows;
  - `data-plan data-slug data-appointment` on plan rows;
  - `data-done data-slug` on done rows;
  - `data-slug data-maybe` on may-apply rows.

  Add new attributes only after these.
- **Save-feedback slug.** Success redirects become `/dashboard?saved=<intent>&slug=<slug>#screening-<slug>`. That still starts with the smoke-expected `/dashboard?saved=<intent>`.
  - The dashboard compares the `slug` param to the rendered slugs. The raw param is only compared, never rendered, as the error path does today.
  - Only a matching row shows the saved message. Otherwise it falls back to the top.

## Phase 1: Theme and component foundation

### Overview

Put theme A into the token source, self-host its fonts, add the shadcn components the dashboard needs, and fix layout basics. There is no visible change to unmigrated pages, apart from the body font.

### Changes Required:

#### 1. Theme A tokens

**File**: `src/styles/global.css`

**Intent**: Make theme A the single source of colour and radius, following the system scheme. Add tier and success tokens so status meanings stop being palette classes.

**Contract**:
- `:root` gets `color-scheme: light dark`, and every theme-A variable uses `light-dark(<light>, <dark>)` with the `directions.md` §A values.
- `--radius` is 0.875rem.
- New variables `--tier-{1,2,3}`, `--tier-{1,2,3}-foreground`, `--tier-{1,2,3}-solid` and `--success`, each published in `@theme inline` as `--color-*`. This is the snippet in `directions.md`, "Registering the new tokens".
- `--font-sans` and `--font-heading` are published from the font variables (item 2).
- `@custom-variant dark` targets `@media (prefers-color-scheme: dark)`, and the old `.dark` block is removed.
- `--chart-*` and `--sidebar-*` are remapped to theme-A hues or removed if unused.
- `@utility bg-cosmic` stays, with a comment noting it serves unmigrated pages until their follow-ups.
- Add a comment above the block naming the value source (`context/changes/ui-refactor/directions.md` §A).

#### 2. Fonts

**File**: `astro.config.mjs`, `src/layouts/Layout.astro`

**Intent**: Self-host Fraunces (headings) and Figtree (body/UI) with full Polish glyphs.

**Contract**:
- Astro `fonts` config has two entries (Fraunces, Figtree), each with `subsets: ["latin","latin-ext"]`, a variable weight range and `styles: ["normal"]`, exposed as CSS variables.
- Layout renders `<Font cssVariable=… preload />` for both.
- **Fallback, if the Astro fonts API fails on the Cloudflare adapter build:** use `@fontsource-variable/fraunces` and `@fontsource-variable/figtree` imported in `global.css`, and note the switch in this plan.
- Dates use `tabular-nums`, because Fraunces has no tabular digits, so headings only.

#### 3. shadcn components

**File**: `src/components/ui/{card,badge,alert,input,label}.tsx` (new, via CLI)

**Intent**: Give the view real shared primitives instead of hand-rolled copies.

**Contract**:
- Run `npx shadcn@latest add card badge alert input label`.
- Do not re-run `init`, and do not change the tokens that shadcn writes. Revert any CLI edit to `global.css` that conflicts with item 1.
- Badge gets tier variants (`tier1`, `tier2`, `tier3`, `success`) built on the new tokens.
- Components are used from `.astro` without `client:*`.

#### 4. Layout basics and shared chrome

**File**: `src/layouts/Layout.astro`, `src/components/LanguageSwitcher.astro`, `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: Fix the shared layout defects found in research, without changing how unmigrated pages look.

**Contract**:
- Viewport is `width=device-width, initial-scale=1`.
- `meta.title` becomes "Dbam" in both locales.
- A new optional `hideLanguageSwitcher` prop, used by the dashboard in Phase 2.
- `LanguageSwitcher` reads tokens (`bg-card`, `border-border`, `text-foreground`, `ring`), not palette classes. It stays a fixed pill on other pages.
- No `<main>` in Layout: pages own their landmark, and the dashboard adds it in Phase 2.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build succeeds, including the fonts on the Cloudflare adapter: `npm run build`
- Smoke passes against the local preview: `npm run smoke`

#### Manual Verification:

- Unmigrated pages (landing, sign-in, onboarding, profile) look the same apart from the body font
- "Zażółć gęślą jaźń" renders in Fraunces and Figtree at 16px and 32px, with no fallback glyphs
- With the system in dark mode, `bg-background` resolves to theme A's dark value (checked in DevTools)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard shell and information architecture

### Overview

Replace the single card with a page structure: an app header, an intro, separate section cards in task order, a profile card and a footer disclaimer.

### Changes Required:

#### 1. App header

**File**: `src/components/AppHeader.astro` (new)

**Intent**: Give signed-in pages a real top bar, so exits and the language aren't buried at the bottom of the page or floating over it.

**Contract**:
- A `<header>` holding the "Dbam" wordmark (links to `/dashboard`), a `<nav>` with Panel (`/dashboard`, `aria-current` when active) and Profil (`/profile`), the language switcher inline, and the sign-out form (POST `/api/auth/signout`, `Button` variant `ghost`/`outline`).
- New i18n keys are needed only for missing labels (e.g. `nav.profile`, `nav.skipToContent`), in `pl.ts` and `en.ts`.
- Responsive at mobile width: no overlap, and the nav may wrap.

#### 2. Page structure

**File**: `src/pages/dashboard.astro`

**Intent**: One task per section, most important first. No card-in-card.

**Contract**:
- `Layout hideLanguageSwitcher`, then a skip link, then `AppHeader`, then `<main id="main">` in a centred `max-w-3xl` column on `bg-background`.
- **Intro:** h1 `dashboard.title`, plus a status line with plural counts of plans and due exams (new `_one/_few/_many/_other` keys via `t.plural()`).
- **Section cards** (shadcn `Card`), in order: Your plans, tier 1, tier 2, tier 3, May apply, Done.
  - Each is a `<section aria-labelledby>` with an h2.
  - Tier 1 is visually strongest (a `tier-1` accent border or header band, and its label plus icon). The tier 3 note stays under its heading.
  - A section is omitted when empty.
- **Empty state:** when no tier has items, one Card with `dashboard.recommendations.empty`.
- **Profile card:** a compact summary (`dl`) plus the `dashboard.profile.edit` link.
- **Footer:** the disclaimer as a muted `<footer>` note.
- The raw email greeting is removed.
- The top alerts (`pageError`, and the fallback saved message) use `Alert`, placed under the intro.
- The heading scale is clearly separated: h1 > h2 (section) > row title.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`
- Smoke passes, with dashboard attribute and location assertions unchanged: `npm run smoke`
- Hardcoded-value scan on `src/pages/dashboard.astro` and `src/components/AppHeader.astro` returns 0 hits

#### Manual Verification:

- Dashboard at desktop width shows the header, intro, separate section cards in the agreed order, the profile card and the footer disclaimer, with no outer card around everything
- At about 375px mobile width, nothing overlaps (header, nav and sections), and the floating language pill is absent on the dashboard
- Keyboard: the skip link appears on first Tab and jumps to `<main>`; the header links and sign-out are reachable in order

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Exam rows, forms and save feedback

### Overview

Rebuild the six recommendation components as token-based rows with real components, and put the save confirmation on the saved exam's row.

### Changes Required:

#### 1. Row components

**File**: `src/components/recommendations/{RecommendationItem,PlanItem,DoneItem,MaybeRecommendationItem,EntryDetails}.astro`

**Intent**: Each exam is a divided row inside its section card: name, meaning (interval, appointment date, next due or last done), tier label plus icon, and the primary action. There are no nested boxes.

**Contract**:
- Rows are `<li>`s in a `divide-y divide-border` list.
- Tier and status use `Badge` variants with a lucide icon and a text label (never colour alone).
- Dates are `tabular-nums`.
- `EntryDetails` is a single native `<details>` styled with tokens, with `focus-visible:ring`.
- Every existing `id`, `data-*` attribute and screen-reader-only text keeps its order and content (see Critical Implementation Details).
- Remove/Undo use `Button` (`variant="outline"`, size `sm`). The local `badge`/`control` class constants are gone.

#### 2. Plan/done forms

**File**: `src/components/recommendations/ScreeningActions.astro`

**Intent**: Replace the hand-rolled purple controls with the shared components.

**Contract**:
- A native `<details>` panel with `Label` + `Input type="date"`, and a styled native `<select>` for month and year.
- Classes come from tokens (`border-input`, `bg-background`, `focus-visible:ring-ring`); no `[color-scheme:dark]`.
- Submit uses `Button` (primary). Errors use `Alert variant="destructive"` next to the form.
- The field gets `aria-invalid` and `aria-describedby` pointing to the error when this form's error is shown.
- Hints are linked as today.

#### 3. Save feedback at the item

**File**: `src/pages/api/screenings.ts`, `src/pages/dashboard.astro`, row components

**Intent**: Show the confirmation where the browser scrolls, which is the saved exam's new row.

**Contract**:
- `succeed(slug)` redirects to `/dashboard?saved=<intent>&slug=<slug>#screening-<slug>`.
- The dashboard derives `savedSlug`, but only when `saved` is a known intent and `slug` matches a rendered row.
- That row gets a `saved` prop: an inline `role="status"` text from `dashboard.screenings.saved.<intent>`, plus a highlight (`bg-tier-2`/`success` tint and `ring`).
- Otherwise the saved message renders as a top `Alert`.
- The `scroll-margin-top` of the rows clears the header.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build succeeds: `npm run build`
- Smoke passes, including plan, done, undo, due-again and undated-plan flows: `npm run smoke`
- Hardcoded-value scan on `src/pages/dashboard.astro`, `src/components/AppHeader.astro` and `src/components/recommendations/*.astro` returns 0 hits
- No `bg-cosmic`, `bg-white/`, `text-white` or `backdrop-blur` in dashboard-scope files (grep)

#### Manual Verification:

- Planning an exam scrolls to it under "Your plans", with the confirmation and highlight on that row; the same for done, undo and remove
- Removing a plan for an exam that is no longer recommended shows the confirmation at the top
- An invalid date shows the error next to the form, the panel opens, and a screen reader announces the field as invalid
- Tier 1 rows are recognisable without colour (label plus icon) and visually strongest

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: States and visual gate

### Overview

Prove the 7-state matrix on one page in both schemes, and capture the screenshot gate.

### Changes Required:

#### 1. Kitchen-sink page

**File**: `src/pages/dev/kitchen-sink.astro` (new)

**Intent**: One page showing the dashboard's building blocks in every state, light and dark side by side. It is the gate and the review evidence.

**Contract**:
- Returns 404 when `import.meta.env.PROD`. It is not linked anywhere and uses no user data.
- It renders fixture rows through the real components:
  - a tier 1/2/3 row;
  - a plan row with and without a date;
  - a done row;
  - a may-apply row;
  - a row with an open form and an error;
  - a saved row;
  - the empty-state card;
  - the top alerts;
  - buttons in default and disabled states.
- Each row renders twice, in wrappers forced to `color-scheme: light` and `color-scheme: dark`.
- A short legend lists the 7 states and marks loading as N/A with its reason (SSR plain forms; there is no async data after render).

#### 2. Focus and disabled states

**File**: row components, `ScreeningActions.astro`, `AppHeader.astro`

**Intent**: Close the states that drift first.

**Contract**:
- Every interactive element has a visible `focus-visible` ring from `--ring`.
- `Button` disabled styles come from shadcn.
- Submit buttons get a no-JS pending guard only if trivial. Otherwise pending/loading is recorded as N/A (full page POST).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check`
- Build succeeds, and `/dev/kitchen-sink` returns 404 in the production preview: `npm run build && npm run preview` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321/dev/kitchen-sink` prints `404`
- Hardcoded-value scan on `src/pages/dev/kitchen-sink.astro` returns 0 hits

#### Manual Verification:

- Kitchen sink under `npm run dev` shows every cell of the 7-state matrix (or N/A with a reason) in both light and dark
- Screenshots of `/dashboard` and the kitchen sink at desktop and about 375px, in light and dark, attached to the PR
- Contrast spot-check in both schemes: body text, muted text, primary button, tier badges and the focus ring are all legible (DevTools contrast picker)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Guard and docs

### Overview

Leave a rule and a failing check, so the next agent keeps the dashboard on the contract and follow-ups extend it.

### Changes Required:

#### 1. UI rule

**File**: `CLAUDE.md`

**Intent**: Tell every agent where the design system lives and forbid literals in migrated views.

**Contract**: A short "UI" section **outside** the `<!-- BEGIN @przeprogramowani/10x-cli -->` block. It states:
- tokens live in `src/styles/global.css` (theme A, `light-dark()`, tier and success tokens);
- components live in `src/components/ui` (add via `npx shadcn@latest add`, check there before creating one);
- no palette classes, hex/rgb/oklch literals or arbitrary values in migrated views;
- the kitchen sink is at `/dev/kitchen-sink` (dev only);
- `npm run ui:check` lists the migrated files.

#### 2. Hardcoded-value check

**File**: `scripts/ui-check.mjs` (new), `package.json`, `.github/workflows/ci.yml`

**Intent**: A failing check instead of a forgotten rule, scoped to migrated files so unmigrated pages don't fail.

**Contract**:
- A dependency-free Node script that runs the `/10x-ui` hardcoded-value regex over an explicit list of migrated files: `src/pages/dashboard.astro`, `src/components/AppHeader.astro`, `src/components/recommendations/*.astro`, `src/components/LanguageSwitcher.astro`, `src/pages/dev/kitchen-sink.astro`.
- It prints file:line hits and exits 1 on any hit.
- Wiring: `npm run ui:check` in `package.json`; a lint-staged entry for those paths; a step in the CI `ci` job.
- Follow-up changes append their files to the list.

#### 3. Docs

**File**: `README.md`

**Intent**: Document the design system and the check.

**Contract**:
- A short "Design system" note: theme A, the token source, components, the kitchen sink, `ui:check`.
- `ui:check` added to Available Scripts.

### Success Criteria:

#### Automated Verification:

- UI check passes on the migrated files: `npm run ui:check`
- UI check fails on a deliberately added `bg-purple-600` in `src/pages/dashboard.astro` (break-check, then revert)
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- The `CLAUDE.md` UI section is outside the 10x-cli block and names the token source, components directory, kitchen sink and check
- The PR shows the `ui:check` step green in CI

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None (no unit runner yet; F-03 adds Vitest). This change touches presentation only. The one logic addition, `savedSlug` derivation, is exercised by smoke.

### Integration Tests:

- `npm run smoke` (full, local) after every phase. It pins the dashboard attribute contract and redirect locations for plan, done, undo, due-again, undated plan and withdrawal.
- `npm run ui:check` (Phase 5 onward) on the migrated files.

### Manual Testing Steps:

1. Onboard a test profile (56 F, former smoker) and open `/dashboard` in light, then dark system scheme.
2. Plan mammography with a date: the page scrolls to "Your plans" with the confirmation on the row.
3. Mark it done, undo, set a done month years back: it returns to tier 1 with "last done".
4. Submit an invalid date: the inline error, the open panel, and focus/describedby work.
5. Keyboard-only pass: skip link, header, each row's details and forms; the focus ring is visible everywhere.
6. 375px width in both schemes: no overlap or horizontal scroll.
7. `/dev/kitchen-sink` in dev: all states in both schemes; the production preview returns 404.

## Performance Considerations

- Two self-hosted variable fonts with preload and generated fallbacks. Keep `subsets` to `latin` plus `latin-ext` and one style.
- There is no client JavaScript added, and no data-path change.

## Migration Notes

- Unmigrated pages keep `bg-cosmic` and their literal classes. They switch to tokens in the follow-up issues:
  - landing page and branding;
  - auth pages and 500/404;
  - onboarding and profile.

  The last one also removes `@utility bg-cosmic` and the unused starter components. Each follow-up adds its files to `scripts/ui-check.mjs`.
- To roll back, revert the change's commits. No data or API contract changes, apart from the additive `&slug=` on success redirects.

## References

- Research: `context/changes/ui-refactor/research.md` (charges C1–C5, §A–E)
- Token values and contrast: `context/changes/ui-refactor/directions.md` §A
- Method: `.claude/skills/10x-ui/SKILL.md`, `.claude/skills/10x-ui/references/ui-quality-checklist.md`
- Smoke contract: `scripts/smoke.mjs:151-298,314-317`
- Current view: `src/pages/dashboard.astro`, `src/components/recommendations/*.astro`, `src/pages/api/screenings.ts:40-47`
- Prior decisions: `context/archive/2026-09-28-screening-recommendations/plan-brief.md:37` (native `<details>`), `context/archive/2026-09-30-record-appointment-date/plan.md:82` (no islands in S-03)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Theme and component foundation

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — e0296b1
- [x] 1.2 Type checking passes: `npx astro check` — e0296b1
- [x] 1.3 Build succeeds, including the fonts on the Cloudflare adapter: `npm run build` — e0296b1
- [x] 1.4 Smoke passes against the local preview: `npm run smoke` — e0296b1

#### Manual

- [x] 1.5 Unmigrated pages look the same apart from the body font — e0296b1
- [x] 1.6 Polish diacritics render in Fraunces and Figtree at 16px and 32px — e0296b1
- [x] 1.7 Dark system scheme resolves theme A's dark background — e0296b1

### Phase 2: Dashboard shell and information architecture

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — 2575d49
- [x] 2.2 Type checking passes: `npx astro check` — 2575d49
- [x] 2.3 Build succeeds: `npm run build` — 2575d49
- [x] 2.4 Smoke passes, with dashboard assertions unchanged: `npm run smoke` — 2575d49
- [x] 2.5 Hardcoded-value scan on dashboard.astro and AppHeader.astro returns 0 hits — 2575d49

#### Manual

- [x] 2.6 Desktop shows header, intro, separate section cards, profile card and footer, with no outer card — 2575d49
- [x] 2.7 About 375px width has no overlap, and there is no floating language pill on the dashboard — 2575d49
- [x] 2.8 Skip link and header are keyboard-reachable in order — 2575d49

### Phase 3: Exam rows, forms and save feedback

#### Automated

- [x] 3.1 Linting passes: `npm run lint` — 16721e8
- [x] 3.2 Type checking passes: `npx astro check` — 16721e8
- [x] 3.3 Build succeeds: `npm run build` — 16721e8
- [x] 3.4 Smoke passes, including plan, done, undo, due-again and undated flows: `npm run smoke` — 16721e8
- [x] 3.5 Hardcoded-value scan on dashboard-scope files returns 0 hits — 16721e8
- [x] 3.6 No bg-cosmic, bg-white/, text-white or backdrop-blur in dashboard-scope files — 16721e8

#### Manual

- [x] 3.7 Saved exam's row shows the confirmation and highlight after plan, done, undo and remove — 16721e8
- [x] 3.8 Removing a plan for a no-longer-recommended exam shows the confirmation at the top — 16721e8
- [x] 3.9 Invalid date shows an inline error, the panel opens, and the field is announced as invalid — 16721e8
- [x] 3.10 Tier 1 is recognisable without colour and visually strongest — 16721e8

### Phase 4: States and visual gate

#### Automated

- [x] 4.1 Linting passes: `npm run lint`
- [x] 4.2 Type checking passes: `npx astro check`
- [x] 4.3 Build succeeds, and /dev/kitchen-sink returns 404 in the production preview
- [x] 4.4 Hardcoded-value scan on kitchen-sink.astro returns 0 hits

#### Manual

- [x] 4.5 Kitchen sink shows every 7-state cell (or N/A) in light and dark
- [x] 4.6 Screenshots at desktop and 375px in both schemes attached to the PR
- [x] 4.7 Contrast spot-check passes in both schemes

### Phase 5: Guard and docs

#### Automated

- [ ] 5.1 UI check passes on the migrated files: `npm run ui:check`
- [ ] 5.2 UI check fails on a deliberate bg-purple-600 in dashboard.astro (break-check)
- [ ] 5.3 Linting passes: `npm run lint`
- [ ] 5.4 Build succeeds: `npm run build`

#### Manual

- [ ] 5.5 CLAUDE.md UI section is outside the 10x-cli block and names the tokens, components, kitchen sink and check
- [ ] 5.6 ui:check step is green in CI on the PR
