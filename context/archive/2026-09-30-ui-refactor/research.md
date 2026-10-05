---
date: 2026-09-30T14:07:36+02:00
researcher: Claude (Opus 5.5) for Amadeusz Kozlowski
git_commit: 826f9c2d8d55d1bdfab5600864b3cee352f93108
branch: main
repository: amakoz/dbam (worktree 10xdevs-second)
topic: "ui-refactor: replace the starter-template look with a new, clean identity (global tokens + /dashboard)"
tags: [research, ui, design-tokens, shadcn, tailwind-v4, dashboard, typography, a11y]
status: complete
last_updated: 2026-09-30
last_updated_by: Claude (Opus 5.5)
---

# Research: ui-refactor (global tokens + /dashboard)

**Date**: 2026-09-30T14:07:36+02:00
**Researcher**: Claude (Opus 5.5) for Amadeusz Kozlowski
**Git Commit**: 826f9c2d8d55d1bdfab5600864b3cee352f93108
**Branch**: main
**Repository**: amakoz/dbam

## Research Question

"I would like to replace the template UI with a brand new idea. Something clean and good looking."

The scope was agreed with the user on 2026-09-30 and recorded in `change.md`:
- **Scope:** global tokens plus one view, `/dashboard`. Other pages get their own follow-up changes.
- **Visual direction:** research proposes 2–3 directions, and the user picks one in `/10x-plan`.
- **Method:** the repo's `/10x-ui` skill (`.claude/skills/10x-ui/SKILL.md`), which runs a two-way audit that produces charges, then a design-system contract, a 7-state matrix and a screenshot gate.

## Summary

- **The contract variant is "fresh starter with a dead token file".**
  - `src/styles/global.css:6-111` holds correct shadcn tokens: stock neutral values, all oklch, and `@theme inline` contains only `var()` references.
  - No view reads them. Outside `src/components/ui` the palette/literal scan finds **298** occurrences, and **0** token classes are used.
  - In the dashboard scope there are about 130 palette-class occurrences across 8 files and **0** token classes.
- **What the app looks like now is a hardcoded "cosmic" purple/blue glass theme**, not the tokens:
  - `bg-cosmic` is a hex gradient (`global.css:113-115`);
  - every page repeats the glass card `border-white/10 bg-white/10 backdrop-blur-xl` (for example `dashboard.astro:103`);
  - headings use a blue→purple gradient (`dashboard.astro:105`).
- **Dark mode is not wired:** nothing sets `.dark` and there is no `prefers-color-scheme` rule.
- **The only shadcn component in the repo is `Button`**, used once (`auth/SubmitButton.tsx:15`), and its `className` overrides `bg-primary` with `bg-purple-600` (`SubmitButton.tsx:18`).
- **By `/10x-ui` rules, phase 1 is not choosing a theme.** It is making the dashboard read tokens. New values are worth choosing only after that.
- **Three evidence-based directions are proposed** (§D; token blocks in `directions.md`):
  - **A** "Len i szałwia" (linen and sage): warm and natural.
  - **B** "Spokojny błękit" (calm civic blue): IKP-like but softer.
  - **C** "Poranek" (morning): navy with a sunny accent.

  All pass WCAG AA on their key pairs (computed), and all use a non-red tier-1 colour.
- **One important side effect:** every other page (auth, onboarding, profile, 500, landing) paints its own hardcoded cosmic look. A retheme of the tokens plus the dashboard therefore leaves them visually inconsistent until their own changes, unless the plan takes a cheap stopgap (open question 2).

## Charges

Following the `/10x-ui` method: 5 charges, each with file:line and the effect on the user. The plan must address each one or mark it deferred with a reason.

1. **Missing tokens: the dashboard's whole look bypasses the token source.**
   - **Evidence:** `bg-cosmic` hex gradient (`src/styles/global.css:113-115`) on the wrapper (`src/pages/dashboard.astro:102`); glass card `bg-white/10 border-white/10 text-white` (`dashboard.astro:103`); gradient h1 `from-blue-200 to-purple-200` (`dashboard.astro:105`); muted text as `text-blue-100/60…/80`, for example `dashboard.astro:108,130,146`, `RecommendationItem.astro`, `EntryDetails.astro`, `ScreeningActions.astro`.
   - **Scale:** 0 token classes in the view's 8 files. `body` gets `bg-background` (`global.css:122`), which `bg-cosmic` then paints over.
   - **User effect:** the brand cannot be changed in one place, and any shadcn component added later looks like a different app.
2. **Missing tokens: status and tier meanings have no tokens, and tiers differ by colour only.**
   - **Status colours:**
     - Success is green (`dashboard.astro:119`) or emerald (`dashboard.astro:188`, `RecommendationItem.astro:47`, `DoneItem.astro:28`).
     - "Warning" is amber (`RecommendationItem.astro:59`, `PlanItem.astro:47`).
     - The error box is hand-copied in red (`dashboard.astro:126`, `ScreeningActions.astro:36`, `DoneItem.astro:39`).
     - There is no `success`, `warning` or tier token, and `destructive` is unused.
   - **Tiers:** the tier-1 heading is `text-amber-100` and tiers 2/3 are `text-blue-100` (`dashboard.astro:154`). Both are near-white, and the items look identical across tiers.
   - **User effect:** "important – book now" barely stands out from "talk to your doctor", and nobody can check the contrast or meaning of the colours in one place.
3. **Missing shared component: Button.**
   - `src/components/ui/button.tsx` exists, but the dashboard hand-rolls 6 buttons in 3 sizes: `dashboard.astro:218-221`, `PlanItem.astro:73-76`, `DoneItem.astro:47-50`, `ScreeningActions.astro:30-31,69,107`, `LanguageSwitcher.astro:18-28`.
   - None has a `focus-visible:` or `disabled:` style. The base `outline-ring/50` (`global.css:119`) is a 50% grey on a dark background.
   - **User effect:** buttons with the same job look different, keyboard users get a barely visible focus ring, and a double submit is possible.
4. **Missing shared component: Card, Badge, Alert, form field, Collapsible.**
   - **Card:** 5 near-identical item cards nested inside the glass card (`RecommendationItem.astro:35`, `PlanItem.astro:38`, `DoneItem.astro:28`, `MaybeRecommendationItem.astro:21`, `ScreeningActions.astro:40`).
   - **Badge:** built from a local `const badge` (`RecommendationItem.astro:27`) and copied at `PlanItem.astro:45`.
   - **Form fields:** a local `const control` (`ScreeningActions.astro:28-29`) using `focus:` (not `focus-visible:`) and `ring-purple-400`.
   - **Collapsible:** two different `<details>` styles (`EntryDetails.astro:27-28`, `ScreeningActions.astro:40-41`).
   - **User effect:** each exam sits inside three layers of faint white-on-white boxes, so the eye has no clear focal point.
5. **Accidental architecture: the page is ordered by feature history, and feedback after an action lands off-screen.**
   - **Order:** the single h2 "Recommendations" wraps, in order: the flash message, the error, the disclaimer, "Your plans", the tiers, "may apply" and "Done" (`dashboard.astro:113-198`). The profile summary and sign-out come last (`:200-224`).
   - **Chrome:** there is no header, nav, `<main>` landmark or skip link (`src/layouts/Layout.astro:23-26`). The only exits are "Edit profile" and sign-out.
   - **Feedback after saving:** it redirects to `/dashboard?saved=<intent>#screening-<slug>` (`src/pages/api/screenings.ts:47`). The browser jumps to the item, which may have moved to another section, while the `role="status"` message renders at the top (`dashboard.astro:117-124`).
   - **User effect:** the first thing on screen is a long disclaimer rather than "what should I do next", and after saving, the user may never see the confirmation.

**Additional findings (candidates to fold into phases or record as deferred; status after implementation, 2026-10-05):**
- h3 and h4 are almost the same size (`dashboard.astro:135,152,175,188` vs `*Item.astro` h4). **Resolved** in Phases 2–3: h1, then h2 per section, then h3 per row.
- The viewport meta lacks `initial-scale=1` (`Layout.astro:19`). **Resolved** in Phase 1.
- The fixed bottom-right `LanguageSwitcher` (`LanguageSwitcher.astro:14`, `z-50`) can cover the last item or the sign-out button on phones. **Resolved** in Phase 2: the dashboard renders the switcher inline in `AppHeader`. Other pages keep the pill until #61–#63.
- The greeting shows the raw email (`dashboard.astro:109`). **Resolved** in Phase 2: the greeting was removed.
- Tier rows "still not clean enough" (owner, Phase 3 manual check 3.10). **Deferred** to #67.
- The starter branding is still there: `meta.title` / `home.title` = "10x Astro Starter" (`src/i18n/pl.ts:4,16`, `en.ts:6,18`). The landing page is out of scope; the page title is shared. **Partly resolved:** `meta.title` became "Dbam" in Phase 1. `home.*` is **deferred** to #61.
- Unused leftovers: `Banner.astro` and `ui/LibBadge.astro` are imported nowhere, and `public/template.png` is referenced only in the README. **Deferred** to #61.

## Detailed Findings

### A. Token source and component layer

- **`global.css`:**
  - **Imports:** `tailwindcss` and `tw-animate-css` (`:1-2`). The dark variant is `@custom-variant dark (&:is(.dark *))` (`:4`).
  - **`:root`** (`:6-39`) and **`.dark`** (`:41-73`) hold the stock neutral values, all oklch. `--radius: 0.625rem` (`:7`). `chart-*` and `sidebar-*` are present; there are no `success`, `warning` or `info` tokens.
  - **`@theme inline`** (`:75-111`) contains only `var()` references, so the "raw colour in `@theme inline`" dark-mode break is not present.
  - **Literal:** `@utility bg-cosmic` (`:113-115`).
  - **Base layer** (`:117-124`): `* { border-border outline-ring/50 }` and `body { bg-background text-foreground }`.
- **Fonts:** no custom font (no `@fontsource`, font link or `font-family`), so the Tailwind system sans applies.
- **Dark mode:** not wired. The only `dark:` classes are in `button.tsx`. `[color-scheme:dark]` is hardcoded at `ScreeningActions.astro:29`.
- **`components.json`:** new-york, `baseColor: neutral`, `cssVariables: true`, `iconLibrary: lucide`.
- **`src/components/ui/`:** only `button.tsx` (stock) and `LibBadge.astro` (starter leftover, unused).
- **lucide-react** is used in the React islands (auth forms, `ProfileForm`). Astro components inline SVGs by hand (`Welcome.astro:48-103`).
- **Previous slices** hand-rolled their inputs, radio group, alerts, checkboxes and badges. The S-03 plan explicitly ruled out new shadcn components and islands for that slice (`context/archive/2026-09-30-record-appointment-date/plan.md:82`).

### B. Dashboard composition and states

- **Rendered tree:** `dashboard.astro` → `Layout.astro` (+ `LanguageSwitcher.astro`) → `recommendations/{PlanItem, RecommendationItem, MaybeRecommendationItem, DoneItem, EntryDetails, ScreeningActions}.astro`.
  - `Topbar.astro` is rendered only by `Welcome.astro`.
  - `WithdrawConsentForm.astro` appears only on profile and onboarding.
- **Entry points:**
  - **Logged out:** the middleware sends the user to `/auth/signin` (`src/middleware.ts:5,24-25`), with no return-to parameter.
  - **No consent or no profile:** `/onboarding` (`dashboard.astro:27-30`).
  - **Zero tier matches:** a muted empty box (`:145-148`); the other sections are hidden when empty.
  - **`?error=`:** shown in-item when the exam is on the page (its panel opens via `open={Boolean(error)}`), otherwise at the top (`:125`).
  - **Catalog read failure:** throws, then the 500 page (`src/lib/catalog/read.ts:34`, `src/pages/500.astro`).
- **Forms:** plain POST with no JavaScript, `private, no-store`.
- **7-state matrix today** (controls in the view):

  | State | Today |
  | --- | --- |
  | default | present, but built from literals, not tokens |
  | hover | present on buttons and links |
  | focus-visible | **missing** everywhere. Browser default plus a 50% grey outline; the inputs use `focus:` with `ring-purple-400` |
  | disabled / pending | **missing** for every control |
  | error | present: page or in-item alert. No `aria-invalid` or field-level `aria-describedby` to the error |
  | empty | present for tiers (`:146`); other sections are simply hidden |
  | loading | N/A for SSR plain forms. No pending state on submit |

- **Accessibility already in place:**
  - `<html lang>` is set (`Layout.astro:16`), and sections have `aria-labelledby`.
  - Screen-reader-only exam-name suffixes on toggles and buttons, and hints linked with `aria-describedby` (`ScreeningActions.astro:63,78`).
  - `aria-pressed` on the language buttons.
  - Every string goes through `t()`.

### C. App-wide spread (context for follow-up changes)

- **Literal counts by file:**

  | File | Occurrences |
  | --- | --- |
  | `Welcome.astro` (landing) | 40 |
  | `dashboard.astro` | 32 |
  | `onboarding.astro` | 24 |
  | `ScreeningActions.astro` | 22 |
  | `ProfileForm.tsx` | 19 |
  | `RecommendationItem.astro` | 18 |
  | `Topbar.astro`, `WithdrawConsentForm.astro`, `PlanItem.astro` | 13 each |
  | `DoneItem.astro`, `profile.astro` | 11 each |
  | `500.astro`, `signin.astro` | 10 each |
  | `FormField.tsx`, `Banner.astro` | 9 each |

- **Occurrences by hue:** white 111, blue 62, purple 52, red 28, green 12, amber 7, emerald 6.
- **Repeated clusters with no shared component:**
  - glass card shell on 7 pages;
  - gradient h1 in 7 files;
  - error alert in 6 files;
  - success alert in 4 files;
  - `bg-purple-600` primary button in 5 files;
  - `text-purple-300` links in 11 files.
- **Card widths differ per page:** `max-w-sm` (auth, 500), `max-w-lg` (onboarding, profile), `max-w-2xl` (dashboard), `max-w-4xl` (landing).
- **Other literals the regex misses:**
  - `accent-purple-500` (`onboarding.astro:75`, `ProfileForm.tsx:81`) and `accent-red-500` (`WithdrawConsentForm.astro:26`);
  - `placeholder-white/40` (`FormField.tsx:6`);
  - inline `rgba()` (`Welcome.astro:17`);
  - arbitrary `blur-[…]` and `h/w-[…px]` (`Welcome.astro:10-12`).
- **Shared chrome:** the only thing every page shares is `Layout.astro` + `LanguageSwitcher`. There is no meta description, `theme-color` or OG tags (`Layout.astro:17-22`).

### D. Visual directions (external research, 2026-09-30)

Sources are at the end of this section. Token blocks and contrast figures are in `directions.md`.

- **Reference patterns:**
  - **Polish public health:**
    - IKP (pacjent.gov.pl) uses a saturated blue `#0061a3` with navy and red, set in Fira Sans or Open Sans.
    - The gov.pl template uses blue `#0052a5` and red `#d5233f`, set in Open Sans.
    - **Implication:** a desaturated blue borrows trust. Copying the government look (eagle, red-white, gov.pl blue) would read as impersonation for a non-government, informational app.
  - **NHS:** reserves red for urgent care, and says meaning must never rely on colour alone (WCAG 2.2 AA).
  - **Consumer health products:**
    - Oura's 2025 redesign reveals detail step by step and aims for warmth.
    - Headspace moved away from the "dreary sea of blues and greys" to a warm off-white with one accent.
    - One Medical uses deep green, warm accents and a serif.
    - Zocdoc "bucks healthcare blues" with navy and yellow.
    - Several of these token values come from third-party extractions and are **unverified**.
  - **Older adults (NN/g 2019):** avoid small or light text; use bigger targets, less clutter and body text of at least 16px.
- **The three directions:**

  | | A "Len i szałwia" | B "Spokojny błękit" | C "Poranek" |
  | --- | --- | --- | --- |
  | Mood | warm, natural, editorial (Oura/Headspace family) | calm, official-feeling, softer than IKP | optimistic; navy with a sunny accent (Zocdoc-like) |
  | Primary | deep sage `oklch(0.47 0.07 165)` | muted blue `oklch(0.47 0.09 235)` | navy `oklch(0.33 0.06 262)` |
  | Fonts | Fraunces (headings) + Figtree | Atkinson Hyperlegible Next | Manrope (headings) + Inter |
  | Radius / density | 0.875rem, spacious cards | 0.5rem, list rows | 1rem, pill buttons |
  | Pros | most distinctive, least clinical, clearly not a government site | highest instant trust for ages 50–70, best low-vision legibility | friendly, strongest primary contrast (11.9:1), dark mode with character |
  | Cons | the serif can feel lifestyle-brand; sage can look muddy on poor screens | risks looking like an IKP copy or generic starter blue | navy + yellow can feel fintech; the warm accents need care |

- **Tiers (all directions):**
  - tier 1 is amber or ochre, never red and never `--destructive`;
  - tier 2 is the primary hue;
  - tier 3 is a neutral slate or sand;
  - each tier also carries a text label, a position and an icon, not colour alone.
- **Contrast** (computed from oklch to WCAG 2.x, see `directions.md`):
  - every direction passes AA on text/background, primary-foreground/primary, muted-foreground/muted and tier foreground/background, in light and dark;
  - `--input` is darkened to reach at least 3:1 (WCAG 1.4.11);
  - **unverified:** pairs that use opacity.
- **Fonts:**
  - **Coverage:** all the candidates are OFL-licensed and contain every Polish glyph, checked in the font files.
  - **x-height:** Inter 0.546 (highest), Atkinson 0.496, Source Sans 3 0.478 (lowest of the sans fonts).
  - **Digits for dates:** Lexend, DM Sans and Fraunces have no tabular digits, so Fraunces is for headings only. Use `tabular-nums` for dates.
  - **Not yet checked:** that the diacritics actually look right. Render "Zażółć gęślą jaźń" at 16px and 32px.
- **Font delivery:**
  - **Astro fonts API:** stable top-level `fonts` config since Astro 6, with `<Font cssVariable preload />` from `astro:assets`.
    - Its defaults are `subsets: ["latin"]` and `weights: [400]`. **Plain `latin` lacks ą ć ę ł ń ś ź ż**, so each entry needs `subsets: ["latin","latin-ext"]` and `weights: ["300 900"]`.
    - It self-hosts the fonts and generates fallback metrics.
    - **Unverified** on the Cloudflare adapter; check on the first build.
  - **Alternative:** `@fontsource-variable/*`; version 5.3.0 is confirmed for figtree, fraunces, atkinson-hyperlegible-next, inter, manrope, source-serif-4 and geist.
  - **Constraint:** `context/foundation/screening-catalog-research.md:138` notes that CDN fonts break local-only status, so self-hosting is required.
- **Applying a theme:**
  - The simplest route: replace the `:root` and `.dark` values in `global.css`, keep `@theme inline`, and add the tier and success tokens. There is no need to re-run `shadcn init`.
  - `npx shadcn apply --preset <id>` overwrites components unless it is given `--only theme`.
  - tweakcn installs bring font, radius and letter-spacing extras, so copy only the colours.
- **Anti-patterns to avoid:**
  - purple or indigo gradients (the current `bg-cosmic` and gradient h1);
  - alarm red for "important" or "overdue";
  - pure white with saturated clinical blue;
  - stock photos of doctors;
  - dense dashboard grids;
  - small grey text;
  - anything like a gauge or risk meter (the no-diagnosis guardrail, `prd.md:40`).

Sources:
- **Polish public health:** https://pacjent.gov.pl/ (theme CSS at `/themes/custom/pacjent/css/base/variables.css`), https://www.gov.pl/css/govpl_template.css, https://aplikacje.gov.pl/app/govpl-front-styleguide/
- **NHS:** https://service-manual.nhs.uk/design-system/styles/colour
- **Consumer health products:** https://www.instrument.com/work/oura-app, https://www.itsnicethat.com/articles/italic-studio-headspace-graphic-design-project-250424, https://www.underconsideration.com/brandnew/archives/new_logo_and_identity_for_one_medical_by_moniker_and_in_house.php, https://www.underconsideration.com/brandnew/archives/new_logo_and_identity_for_zocdoc_by_wolff_olins.php
- **Older adults:** https://www.nngroup.com/articles/usability-for-senior-citizens/
- **Astro fonts:** https://docs.astro.build/en/guides/fonts/
- **shadcn:** https://ui.shadcn.com/docs/theming, https://ui.shadcn.com/docs/changelog/2026-04-partial-preset-apply
- **tweakcn:** https://tweakcn.com/
- **Fonts:** https://github.com/google/fonts

### E. Rules, tooling and the visual gate

- **Agent rules:** `AGENTS.md` is a symlink to `CLAUDE.md`.
  - **UI rules** (`CLAUDE.md:34-36`): use `cn()` or `class:list`, route every string through i18n, and add shadcn components with `npx shadcn@latest add`.
  - **No rule invites one-off values**, and none names the token source or forbids literal colours in views. That rule is still to be written.
  - The rule must go **outside** the `<!-- BEGIN @przeprogramowani/10x-cli -->` block (`CLAUDE.md:50-101`).
  - `CLAUDE.md:3` still says "10x Astro Starter".
  - `CLAUDE.md.scaffold` is stale starter guidance: a hooks path that conflicts with `components.json`, and CI on "master".
- **Visual gate:** there is no Playwright, Puppeteer, Storybook or kitchen-sink page. `/10x-ui` says not to install a screenshot tool just for the gate, so the cheap form is a **kitchen-sink page** that renders the dashboard's states side by side, screenshotted at desktop and one mobile width.
- **A guard check for literals:**
  - ESLint uses typescript-eslint strict plus astro `flat/recommended` and `flat/jsx-a11y-recommended`, and it has no rule against colour literals.
  - lint-staged runs `eslint --fix` and `prettier`, and CI runs lint, `astro check` and build.
  - A hardcoded-value check would be a new grep script wired into lint-staged or CI, scoped to the cleaned view. Adding it is a user decision.

## Code References

- `src/styles/global.css:6-39` — `:root` tokens (stock neutral, oklch).
- `src/styles/global.css:41-73` — `.dark` tokens (never activated).
- `src/styles/global.css:75-111` — `@theme inline` mapping (clean).
- `src/styles/global.css:113-115` — `bg-cosmic` hex gradient (literal).
- `src/styles/global.css:117-124` — base layer (`outline-ring/50`, body background).
- `src/pages/dashboard.astro:102-105` — cosmic wrapper, glass card, gradient h1.
- `src/pages/dashboard.astro:113-198` — the recommendations section.
- `src/pages/dashboard.astro:200-224` — profile summary and sign-out.
- `src/pages/dashboard.astro:154` — tier headings differ only by colour.
- `src/components/recommendations/ScreeningActions.astro:28-41,56-107` — local `control` style, `focus:` ring, purple buttons, details panel.
- `src/components/recommendations/RecommendationItem.astro:27,35,47,59` — local badge, card, emerald/amber pills.
- `src/components/ui/button.tsx` — the only shadcn primitive.
- `src/components/auth/SubmitButton.tsx:15-18` — `Button` whose `className` overrides `bg-primary`.
- `src/layouts/Layout.astro:16-26` — the shared chrome (`lang`, viewport, favicon, title, `LanguageSwitcher`).
- `src/pages/api/screenings.ts:47` — the success redirect with a hash anchor.
- `src/middleware.ts:5,24-25` — protected-route redirect.
- `CLAUDE.md:34-36,50-101` — UI rules, and the CLI-managed block.

## Architecture Insights

- **The design system is half there.** The values and their publishing are correct; only the consumers are missing. So:
  - phase 1 moves the dashboard onto the existing token names;
  - a later phase swaps in the chosen direction's values in one place.

  Doing it in the reverse order would re-couple new values to literals.
- **Reuse, don't rebuild.** `/10x-ui` rules out a second `shadcn init` or palette. Missing primitives (Card, Badge, Alert, Input, Label, Select, and possibly Collapsible) come from `npx shadcn@latest add`.
  - Some shadcn components are React (`.tsx`), but the dashboard is Astro with plain POST forms and no islands. Where a primitive is purely presentational (Card, Badge, Alert), an Astro wrapper that reuses `cva` variants (like `buttonVariants`) keeps the no-JS behaviour. This is a planning choice.
- **Tiers need semantic tokens** (`tier-1/2/3`, `success`) plus a non-colour cue (a label or icon), to satisfy the NHS rule and the no-alarm guardrail.
- **Light and dark mode:** the tokens already carry a `.dark` set. The current app looks dark by accident, so choosing light, dark or system is a real product decision, not a technical one.

## Historical Context (from prior changes)

- `context/archive/2026-09-28-screening-recommendations/plan.md:61` — "The existing glass style for inner panels is `rounded-lg border border-white/10 bg-white/5`." That was a decision to reuse the cosmic style. This change supersedes it by user decision (2026-09-30).
- `context/archive/2026-09-28-screening-recommendations/plan-brief.md:37` — native `<details>` was chosen for accessibility. That still holds; keep the no-JS behaviour.
- `context/archive/2026-09-30-record-appointment-date/plan.md:82` — no React island and no new shadcn components in S-03. That was scoped to that slice and doesn't bind this change.
- `context/archive/2026-09-27-onboarding-profile/plan.md:325` — mobile width plus keyboard-only was a requirement then, and it still applies (`prd.md:140-141`).
- `context/foundation/prd.md:18,24,40,138-141`:
  - audience 30+ in Poland;
  - no-diagnosis guardrail;
  - browser-only;
  - mobile-usable;
  - keyboard and screen-reader operable.

## Related Research

- `context/foundation/screening-catalog-research.md:138` — CDN fonts break local-only status; self-host fonts.
- `.claude/skills/10x-ui/SKILL.md` and `references/ui-quality-checklist.md` — the method this research follows.

## Open Questions

For the user, to settle in `/10x-plan`:
1. **Visual direction:** A, B or C (`directions.md`), or a blend, for example A's palette with B's font.
2. **Other pages during the transition.** They keep the hardcoded cosmic look until their own changes. Options:
   - (a) accept the inconsistency for now;
   - (b) a cheap stopgap in this change: point the shared `bg-cosmic`, the glass shell and the gradient h1 at tokens, without restyling those pages;
   - (c) schedule follow-up changes right away.
3. **Colour scheme:** light only, `prefers-color-scheme`, or a manual toggle. Tokens exist for both; the app is dark today only by accident.
4. **Font delivery:** the Astro `fonts` API (with `latin-ext`), or `@fontsource-variable/*`.
5. **Guard:** only a `CLAUDE.md` UI rule, or also a hardcoded-value grep check in lint-staged or CI, scoped to the dashboard files.
6. **Dashboard layout changes within this change:** reordering sections (status first, disclaimer lower), a header or nav, and moving the success message next to the item. These are charge 5 versus "restyle only".

For implementation to verify:
7. Astro fonts on the Cloudflare adapter build, and how the diacritics render.
8. Contrast of pairs with opacity (`ring/50`), in the browser.
9. How the kitchen-sink page is reached: dev-only, or behind auth. It needs no real user data.
