# Landing page on the design system, plus starter cleanup — Implementation Plan

## Overview

Move the public landing page `/` onto theme A "Len i szałwia" and the shared components in `src/components/ui`, replace the starter's developer copy with Dbam copy, and send signed-in visitors straight to `/dashboard`. In the same change, remove every remaining starter trace from the repo (leftover components, screenshot, favicon, README, package and local Supabase names) and extend the `ui:check` guard to the new page. Tracks GitHub #61.

## Current State Analysis

From `context/changes/continue-ui-redesign/research.md` (charges C1–C5):

- `/` is `src/pages/index.astro` → `src/components/Welcome.astro` → `src/components/Topbar.astro`. The three files contain 0 token classes and 0 `ui/` imports; the hardcoded-value scan finds 53 hits (Welcome 40, Topbar 13).
- The page paints the legacy cosmic look: `bg-cosmic`, purple/indigo orbs, an `rgba()` star field, a gradient h1, white-on-dark glass cards (`Welcome.astro:8-105`, `Topbar.astro:8-30`) — the look theme A's avoid-list names (`context/archive/2026-09-30-ui-refactor/research.md:226-227`).
- CTAs, cards and icons are hand-built (`Welcome.astro:30-106`); no control on the page has a `focus-visible` class.
- The copy is the starter's: `home.title` is "10x Astro Starter" and the features describe auth, stack and DX (`src/i18n/pl.ts:18-28`, `src/i18n/en.ts:20-28`).
- `/` is public (`src/middleware.ts:5-13`) with no signed-in branch other than `Topbar`'s email strip; signed-in visitors are offered "Sign in" / "Sign up".
- Leftovers: `Banner.astro` and `ui/LibBadge.astro` have no importers; `public/template.png` is used only by `README.md:3`; `public/favicon.png` comes from the starter's initial commit (`cdeff9a`); "10x Astro Starter" / `10x-astro-starter` remains in `README.md:1,5,26-27,287`, `CLAUDE.md:3`, `package.json:2` and `supabase/config.toml:5`.

## Desired End State

- A signed-out visitor at `/` sees a calm theme A page in their system scheme: a header with the Dbam wordmark and a sign-in link, a hero that says what Dbam does, sign-up and sign-in CTAs, three "how it works" cards, and a short no-diagnosis/privacy note — all from tokens and `src/components/ui`, with visible focus rings and correct landmarks.
- A signed-in visitor requesting `/` gets a redirect to `/dashboard` (which forwards to `/onboarding` if they have not finished it).
- `rg -i '10x[- ]astro|astro[- ]starter'` outside `context/` and `node_modules` returns nothing; the favicon is Dbam's own; the README describes Dbam.
- `src/pages/index.astro` is on the `ui:check` list and in the lint-staged glob; the scan on it returns 0 hits.

### Key Discoveries:

- Every value the page needs already exists as a token (`src/styles/global.css:12-81`) — no token phase is needed.
- `Button asChild` (Radix `Slot`) cannot wrap children passed from an `.astro` file, and no view uses it today; style `<a>` links with `buttonVariants()` from `src/components/ui/button.tsx:7-37` instead.
- `en` is typed `Record<MessageKey, string>` against the Polish keys (`src/i18n/en.ts:5`, `src/i18n/index.ts:9`): adding or removing a `home.*` key must happen in both files in the same edit, and `astro check` catches a miss.
- Sign-out redirects to `/` (`src/pages/api/auth/signout.ts:9`) and smoke asserts that 302 target (`scripts/smoke.mjs:332`); after sign-out the visitor is signed out, so the redirect at `/` does not loop.
- `dashboard.astro:40-45` already forwards a user without a finished onboarding to `/onboarding`, so redirecting `/` → `/dashboard` covers every signed-in state.
- The skip link and `<main id="main">` pattern to copy is `src/pages/dashboard.astro:147-155`.
- `rsvg-convert` is available locally (`/opt/homebrew/bin/rsvg-convert`) to rasterize the favicon once; the PNGs are committed, no dependency is added.

## What We're NOT Doing

- Removing `@utility bg-cosmic` — auth, 500, onboarding and profile still use it; #63 removes it (only its comment changes here).
- Restyling auth, 500, onboarding or profile (#62, #63) or the tier rows (#67).
- Mentioning reminder emails on the landing — S-04 is still `in-progress` in `context/foundation/roadmap.md:50,173`; add a line when it closes.
- A logged-in variant of the landing page, or a public header with a signed-in branch.
- Adding a kitchen-sink section for the landing: the page has no data states (see Phase 3).
- Preloading Fraunces for the hero heading (`Layout.astro:24-26` keeps it on demand).
- Renaming the Cloudflare Worker (`wrangler.jsonc` `name: "dbam"` stays, per `context/foundation/lessons.md`).
- Changing production settings: GitHub repo metadata, Supabase dashboard, Cloudflare — those are listed for the owner under Migration Notes.

## Implementation Approach

Follow the `/10x-ui` order: fix the entry point first so the page has one state, then rebuild the view from tokens and repo components with the new copy, then prove the states and capture the screenshot gate, and finally leave the guard and remove the remaining starter identity. The local Supabase `project_id` rename is last, so phases 1–3 verify against the current local stack.

## Critical Implementation Details

- **Supabase `project_id` rename:** `supabase/config.toml` `project_id` names the local Docker containers and volumes. Changing it makes the next `npx supabase start` create a new, empty local stack (migrations and seed re-apply; local test users are gone), and the old stack keeps running under the old name until stopped. The two worktrees share one local stack (`10xdevs` and `10xdevs-second`), so stopping the old stack is an owner step (Migration Notes). CI's `smoke` job starts a fresh stack and does not depend on the name.

## Phase 1: Entry point and leftovers

### Overview

Give `/` a single state (signed out) and delete the starter files nothing needs.

### Changes Required:

#### 1. Signed-in redirect

**File**: `src/pages/index.astro`

**Intent**: A signed-in visitor has no business on the marketing page; send them into the app (charge C4).

**Contract**: When `Astro.locals.user` is set, return `Astro.redirect("/dashboard")` before rendering. `PROTECTED_ROUTES` in `src/middleware.ts` is unchanged (`/` stays public).

#### 2. Remove the starter top strip

**File**: `src/components/Topbar.astro` (delete), `src/components/Welcome.astro`

**Intent**: The strip existed only to show signed-in state on the landing, which no longer happens.

**Contract**: Delete `Topbar.astro`; remove its import and usage from `Welcome.astro` (Welcome itself is replaced in Phase 2). Remove the now-unused `nav.notSignedIn` key from `src/i18n/pl.ts` and `src/i18n/en.ts`. Keep `nav.signin` / `nav.signup` (Phase 2 uses them).

#### 3. Delete unused starter leftovers

**File**: `src/components/Banner.astro`, `src/components/ui/LibBadge.astro`, `public/template.png` (delete), `README.md`

**Intent**: Remove the second, hex-coloured alert and the unused badge so the next agent reaches for `ui/alert` / `ui/badge`, and drop the starter screenshot (charge C5).

**Contract**: The three files are deleted; the `![](./public/template.png)` line at `README.md:3` is removed (the rest of the README is rewritten in Phase 4).

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type and template check passes: `npx astro check`
- Build succeeds: `npm run build`
- No references remain: `rg -n 'Topbar|Banner|LibBadge|template\.png|nav\.notSignedIn' src README.md scripts` returns nothing
- Smoke passes against the local dev server: `npm run smoke` (sign-out still 302 → `/`)

#### Manual Verification:

- Signed out, `/` renders the landing (still the old look) with HTTP 200
- Signed in, `/` redirects to `/dashboard`; a signed-in user who has not finished onboarding ends on `/onboarding`
- Signing out from the dashboard lands on the landing page

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Landing view on theme A

### Overview

Rebuild the page from tokens and `src/components/ui`, with Dbam copy in both locales (charges C1, C2, C3).

### Changes Required:

#### 1. Page markup

**File**: `src/pages/index.astro`, `src/components/Welcome.astro` (delete)

**Intent**: The page holds its own markup, like `dashboard.astro`; the cosmic wrapper, orbs, star field and gradient go, replaced by theme A surfaces.

**Contract**:

- Uses the default `Layout` (floating language switcher stays); no `bg-cosmic`, no inline `style`, no palette classes, no arbitrary values.
- Skip link to `#main` copied from `dashboard.astro:147-152` (`nav.skipToContent`).
- `<header>`: wordmark (`meta.title`, `font-heading`, `text-foreground`) and a sign-in link styled with `buttonVariants({ variant: "ghost", size: "sm" })`.
- `<main id="main">`, centred, comfortable width:
  - Hero: `<h1>` in `font-heading` (`home.title`), subtitle in `text-muted-foreground` at body size or larger (`home.subtitle`), CTAs as `<a>` with `buttonVariants`: `/auth/signup` primary size `lg` (`nav.signup`), `/auth/signin` `outline` size `lg` (`nav.signin`).
  - "How it works" `<section aria-labelledby>` with an `<h2>` (`home.how.heading`) and three `Card`s (`Card` / `CardHeader` / `CardContent` from `ui/card`), each with a `lucide-react` icon (`aria-hidden`, `size-5 text-primary`, e.g. `UserRound`, `ListChecks`, `CalendarCheck`) and an `<h3>` in `font-heading`.
  - Note paragraph (`home.note`) in `text-muted-foreground`, not smaller than `text-sm`.
- Every link shows a `focus-visible` ring from the `ring` token (the `buttonVariants` base already does; any plain link uses the dashboard's `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`).

#### 2. Copy

**File**: `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: Say what Dbam does for a 30+ adult, using only built features (S-01–S-03) and the no-diagnosis guardrail (`context/foundation/prd.md:40`). This is a draft for the owner to edit in manual check 2.9.

**Contract**: Remove `home.features.{auth,stack,dx}.*`. Keep `home.title` and `home.subtitle` (new values). Add `home.how.heading`, `home.features.{profile,tiers,track}.{title,description}`, `home.note`. Draft values:

| Key                                 | pl                                                                                                                                                                       | en                                                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `home.title`                        | Sprawdź, które badania profilaktyczne są teraz dla ciebie                                                                                                                | See which preventive screenings are due for you                                                                                                                            |
| `home.subtitle`                     | Podaj rok urodzenia i kilka informacji o sobie. Dbam pokaże badania odpowiednie do twojego wieku i sytuacji, na podstawie programów NFZ i zaleceń towarzystw medycznych. | Enter your birth year and a few details about yourself. Dbam shows the screenings that fit your age and situation, based on NFZ programmes and medical society guidelines. |
| `home.how.heading`                  | Jak to działa                                                                                                                                                            | How it works                                                                                                                                                               |
| `home.features.profile.title`       | Krótki profil                                                                                                                                                            | A short profile                                                                                                                                                            |
| `home.features.profile.description` | Rok urodzenia, płeć i palenie tytoniu — tylko to, czego potrzeba do dopasowania badań.                                                                                   | Birth year, sex and smoking — only what is needed to match the screenings.                                                                                                 |
| `home.features.tiers.title`         | Lista według ważności                                                                                                                                                    | A list by importance                                                                                                                                                       |
| `home.features.tiers.description`   | Badania w trzech grupach: „Ważne – umów się teraz”, „Warto zaplanować” i „Porozmawiaj z lekarzem”.                                                                       | Screenings in three groups: “Important — schedule now”, “Worth planning” and “Talk to your doctor”.                                                                        |
| `home.features.track.title`         | Zaplanuj i odhacz                                                                                                                                                        | Plan it, tick it off                                                                                                                                                       |
| `home.features.track.description`   | Zapisz termin wizyty albo oznacz badanie jako zrobione — wróci na listę, gdy znów przyjdzie na nie pora.                                                                 | Save the appointment date or mark a screening as done — it comes back to the list when it is due again.                                                                    |
| `home.note`                         | Dbam nie stawia diagnoz — podpowiada, które badania warto zrobić. Twoje dane nie są widoczne dla innych użytkowników.                                                    | Dbam does not diagnose — it suggests which screenings are worth doing. Other users never see your data.                                                                    |

The tier names repeat `dashboard.recommendations.tier.{1,2,3}` (`pl.ts:48-50`, `en.ts:48-50`) verbatim.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/index.astro` returns 0 hits (the `/10x-ui` grep)
- No starter copy or components remain: `rg -n 'Welcome|bg-cosmic|home\.features\.(auth|stack|dx)|10x Astro Starter' src/pages/index.astro src/components src/i18n` returns nothing
- Linting passes: `npm run lint`
- Type and template check passes: `npx astro check`
- Build succeeds: `npm run build`

#### Manual Verification:

- Signed out, `/` in light and dark (system setting) at desktop and ~375px: theme A surfaces, Fraunces headings, no horizontal scroll, cards stack on mobile
- Keyboard: Tab order is skip link → header sign-in → sign-up CTA → sign-in CTA → language switcher, each with a visible ring
- Language switch to English and back returns to `/` with the translated copy
- Owner has reviewed (and edited if needed) the Polish and English copy

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: States and visual gate

### Overview

Close the 7-state matrix for this view and capture the screenshot gate.

### Changes Required:

#### 1. State matrix record

**File**: `context/changes/continue-ui-redesign/plan.md` (this section), PR description

**Intent**: Every cell is shown or N/A with a reason; the verdicts are fixed here so review can check them.

**Contract**:

| State         | Verdict                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| default       | Shown — the page itself, built from tokens and `ui/`                         |
| hover         | Live — `buttonVariants` hover (primary at 90%, accent fill on outline/ghost) |
| focus-visible | Live — `ring` token on every link (Phase 2)                                  |
| disabled      | N/A — the page has only links; nothing can be disabled                       |
| error         | N/A — `/` takes no input; failures render `500.astro` (#62)                  |
| empty         | N/A — static page with no data; the signed-in case is a redirect (Phase 1)   |
| loading       | N/A — server-rendered with no async data after render                        |

No kitchen-sink section is added: with one state shown and the rest N/A, the page itself is the gate.

#### 2. Fix what the gate finds

**File**: `src/pages/index.astro`

**Intent**: Address any contrast, spacing or focus issue found while capturing the screenshots, through tokens and classes only.

**Contract**: Hardcoded-value scan stays at 0.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/index.astro` returns 0 hits
- Build succeeds: `npm run build`

#### Manual Verification:

- Screenshots of `/` at desktop and ~375px, in light and dark, attached to the PR
- Contrast spot-check in both schemes (DevTools picker): body text, muted subtitle and note, primary and outline CTAs, card text and the focus ring are legible
- Hover and focus-visible checked live on every link in both schemes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Identity, guard and docs

### Overview

Replace the remaining starter identity and leave the guard that keeps the landing on the contract.

### Changes Required:

#### 1. Favicon

**File**: `public/favicon.svg` (new), `public/favicon.png` (replace), `public/apple-touch-icon.png` (new), `src/layouts/Layout.astro`

**Intent**: Replace the starter's icon with a simple Dbam mark.

**Contract**:

- `favicon.svg`: a simple, legible-at-16px mark (e.g. a leaf or a "D" drawn as a path, no text element) in theme A primary on a linen tile; the literal colours are the light values of `--primary` and `--background` from `global.css:15,21`, named in an XML comment.
- `favicon.png` (32×32) and `apple-touch-icon.png` (180×180) are rendered once from the SVG with `rsvg-convert` and committed.
- `Layout.astro` links `rel="icon" type="image/svg+xml" href="/favicon.svg"`, keeps the PNG `rel="icon"` as the fallback (Safari 17.5 floor), and adds `rel="apple-touch-icon"`.

#### 2. Names

**File**: `package.json`, `package-lock.json`, `supabase/config.toml`, `CLAUDE.md`

**Intent**: Remove the starter name from the package, the local Supabase project and the agent rules.

**Contract**:

- `package.json` `name` → `"dbam"`; regenerate the lock with `npm install --package-lock-only` (only the root `name` fields change).
- `supabase/config.toml` `project_id` → `"dbam"` (see Critical Implementation Details).
- `CLAUDE.md:3` describes Dbam (preventive-screening reminders for adults in Poland) on the same stack; no other rule changes.

#### 3. README rewrite

**File**: `README.md`

**Intent**: The repo's front page describes Dbam, not the starter.

**Contract**: Title "Dbam" and a short product description; the clone URL is `amakoz/dbam`; the existing setup, design-system, Supabase, catalog, translations, deployment, scheduled jobs, smoke and CI sections are kept and their starter wording removed (including `README.md:287`); the design-system section names the landing as migrated. No instruction changes meaning.

#### 4. Guard

**File**: `scripts/ui-check.mjs`, `package.json`, `src/styles/global.css`

**Intent**: Make the next agent's literal on the landing fail CI and pre-commit.

**Contract**:

- Append `"src/pages/index.astro"` to `MIGRATED` (`scripts/ui-check.mjs:12-19`) and to the lint-staged glob (`package.json:76`).
- The comment above `@utility bg-cosmic` (`global.css:83`) drops "landing" from its list of pages.
- `CLAUDE.md` UI rule needs no new text (it already points at the list).

### Success Criteria:

#### Automated Verification:

- `npm run ui:check` passes with `src/pages/index.astro` listed
- No starter name remains: `rg -niI '10x[- ]astro|astro[- ]starter' --glob '!context/**' --glob '!node_modules/**' --glob '!dist/**' .` returns nothing
- Lock file is consistent: `npm ci` succeeds
- Linting passes: `npm run lint`
- Type and template check passes: `npx astro check`
- Build succeeds: `npm run build`
- pgTAP tests pass on the renamed local stack: `npx supabase test db`

#### Manual Verification:

- The new favicon shows in a browser tab (Chrome, and Safari via the PNG fallback) in light and dark browser chrome
- README reads as Dbam's project doc and its setup steps still work (`npx supabase start` under the new `project_id`, `npm run dev`)
- Committing a test literal (e.g. `text-white`) in `src/pages/index.astro` is blocked by the pre-commit hook, then reverted

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None: the repo has no unit suite yet (F-03), and this change adds no logic beyond a one-line redirect.

### Integration Tests:

- `npm run smoke` (local) after Phase 1: sign-out → `/` still 302, signed-out pages still render.
- `npx supabase test db` after the `project_id` rename (Phase 4).

### Manual Testing Steps:

1. Signed out: open `/`, check light and dark, desktop and ~375px, Tab through every control.
2. Sign in: open `/` → lands on `/dashboard` (or `/onboarding` for a fresh account).
3. Sign out from the dashboard → lands on the new landing.
4. Switch language on `/` → stays on `/` with English copy.

## Performance Considerations

The landing drops three large blurred layers and an inline background image, so it paints less than before. The hero heading pulls Fraunces on demand (not preloaded, `Layout.astro:24-26`); accepted.

## Migration Notes

No database or production changes. Left on the owner's side:

1. **Copy review** — edit the drafted Polish and English copy in Phase 2 (manual check 2.9).
2. **Local Supabase restart** — after pulling Phase 4, and only when no other session uses the shared stack: `npx supabase stop --project-id 10x-astro-starter`, then `npx supabase start` (new, empty stack named `dbam`; re-create local test users). The other worktree (`10xdevs`) needs the same once it has the rename.
3. **GitHub repo metadata** — the repo description and homepage are empty (`gh repo view`); set them if wanted.
4. **Merge** — open PR, checks reported; merging to `main` is yours (it deploys to production). Close #61 with the PR.

## References

- Research: `context/changes/continue-ui-redesign/research.md`
- Prior change (dashboard on theme A): `context/archive/2026-09-30-ui-refactor/plan.md`, `research.md`, `directions.md`
- Pattern: `src/pages/dashboard.astro:147-155` (skip link, `main`), `src/components/AppHeader.astro:18-53` (header, focus ring)
- Guard: `scripts/ui-check.mjs:12-19`, `package.json:76`
- Issues: #61 (this change), #62, #63, #67

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Entry point and leftovers

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 0e22752
- [x] 1.2 Type and template check passes: `npx astro check` — 0e22752
- [x] 1.3 Build succeeds: `npm run build` — 0e22752
- [x] 1.4 No references remain to Topbar, Banner, LibBadge, template.png, nav.notSignedIn — 0e22752
- [x] 1.5 Smoke passes against the local dev server: `npm run smoke` — 0e22752

#### Manual

- [ ] 1.6 Signed out, `/` renders the landing with HTTP 200
- [ ] 1.7 Signed in, `/` redirects to `/dashboard` (or `/onboarding` for unfinished onboarding)
- [ ] 1.8 Signing out from the dashboard lands on the landing page

### Phase 2: Landing view on theme A

#### Automated

- [x] 2.1 Hardcoded-value scan on `src/pages/index.astro` returns 0 hits
- [x] 2.2 No starter copy or components remain in the landing, components and i18n
- [x] 2.3 Linting passes: `npm run lint`
- [x] 2.4 Type and template check passes: `npx astro check`
- [x] 2.5 Build succeeds: `npm run build`

#### Manual

- [ ] 2.6 Signed out, `/` in light and dark at desktop and ~375px matches theme A
- [ ] 2.7 Keyboard Tab order and visible focus ring on every control
- [ ] 2.8 Language switch on `/` returns to `/` with translated copy
- [ ] 2.9 Owner has reviewed the Polish and English copy

### Phase 3: States and visual gate

#### Automated

- [ ] 3.1 Hardcoded-value scan on `src/pages/index.astro` returns 0 hits
- [ ] 3.2 Build succeeds: `npm run build`

#### Manual

- [ ] 3.3 Screenshots of `/` at desktop and ~375px, light and dark, attached to the PR
- [ ] 3.4 Contrast spot-check in both schemes
- [ ] 3.5 Hover and focus-visible checked live on every link in both schemes

### Phase 4: Identity, guard and docs

#### Automated

- [ ] 4.1 `npm run ui:check` passes with `src/pages/index.astro` listed
- [ ] 4.2 No starter name remains outside `context/`
- [ ] 4.3 Lock file is consistent: `npm ci` succeeds
- [ ] 4.4 Linting passes: `npm run lint`
- [ ] 4.5 Type and template check passes: `npx astro check`
- [ ] 4.6 Build succeeds: `npm run build`
- [ ] 4.7 pgTAP tests pass on the renamed local stack: `npx supabase test db`

#### Manual

- [ ] 4.8 New favicon shows in Chrome and Safari tabs, light and dark chrome
- [ ] 4.9 README reads as Dbam's doc and its setup steps work under the new `project_id`
- [ ] 4.10 Pre-commit hook blocks a test literal in `src/pages/index.astro`
