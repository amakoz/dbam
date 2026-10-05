# Auth, onboarding, profile and error pages on the design system — Implementation Plan

## Overview

Move every remaining cosmic-themed screen onto theme A "Len i szałwia" and the shared components in `src/components/ui`:

- sign-in, sign-up and confirm-email;
- onboarding and profile;
- 500, plus a new 404.

Retire `@utility bg-cosmic`. On the way, fix the dead pending state of the submit button, guard the auth entry points, and replace confirm-email's build-mode copy switch. This continues the `/10x-ui` audit of `context/changes/continue-ui-redesign/` (the landing page) on the same branch and PR. It tracks #62 and #63.

## Current State Analysis

From `context/changes/auth-ui-redesign/research.md` (C1–C5) and the planning follow-up audit of onboarding, profile and the error pages.

### The form kit

- `src/components/auth/{FormField,SubmitButton,ServerError,PasswordToggle}.tsx` are hand-built with palette classes:
  - `FormField.tsx:5-64`;
  - `SubmitButton.tsx:18` overrides `ui/button` with `bg-purple-600`;
  - `ServerError.tsx:11`;
  - `PasswordToggle.tsx:15`.
- `ui/input`, `ui/label` and `ui/alert` already provide the ring-token focus, the `aria-invalid` destructive styling and the destructive alert (`src/components/ui/{input,label,alert}.tsx`).
- The kit is shared. `ProfileForm.tsx:3-5` imports `FormField`, `SubmitButton` and `ServerError`. `PasswordToggle` is used only by `SignInForm` and `SignUpForm`.
- The pending state is dead. `SubmitButton` relies on `useFormStatus`, and react-dom 19.3.0 sets `pending` only for function actions (`react-dom-client.development.js:20725-20790`). All three islands post to URLs (`SignInForm.tsx:46`, `SignUpForm.tsx:68`, `ProfileForm.tsx:130`).

### Auth pages

- `signin.astro`, `signup.astro` and `confirm-email.astro` use the `bg-cosmic` glass shell with a gradient h1, with no header and no way back to `/`.
- `/auth/*` has no signed-in guard (`src/middleware.ts:5-13`).
- `confirm-email.astro:6` picks its copy with `import.meta.env.DEV`, and uses the emoji ✅ / 📧.
- With local `enable_confirmations = false`, sign-up signs the user in. This was verified on 2026-10-05: after sign-up, `/dashboard` answers 302 → `/onboarding`.

### Onboarding

- `onboarding.astro:41-111` uses the cosmic glass card, with no `<main>`.
- The consent step (`:52-92`) has a native checkbox (`accent-purple-500`) and a hand-made purple button.
- The profile step (`:94-104`) holds `ProfileForm` and `WithdrawConsentForm`.
- A hand-made sign-out link sits at the bottom (`:107-111`).

### Profile

- `profile.astro:50-86` is the same glass card, with no `AppHeader`, skip link or `<main>`, and a footer back-link plus its own sign-out (`:77-86`).
- `RemindersForm.astro` (21 hits) uses purple and white state boxes with hand-made buttons.
- `WithdrawConsentForm.astro` (13 hits) has a red hand-made button and a native confirm checkbox.

### ProfileForm

- `ProfileForm.tsx:41-99` has a local `ChoiceGroup` of native radios with purple selected styling.
- Hints use `text-blue-100/50`, and the pack-years box uses `bg-white/5` (`:216-223`).

### Error pages

- `500.astro` uses the glass shell, with retry and home links.
- There is no `404.astro`.
- Astro re-routes 404 and 500 responses with an empty body to the custom error page (`REROUTABLE_STATUS_CODES = [404, 500]`, `node_modules/astro/dist/core/constants.js:6`, `core/errors/handler.js:26`).

### `bg-cosmic`

- It is defined at `src/styles/global.css:83-86` and used only by the 6 pages above. README line 88 says these pages are not migrated yet.

## Desired End State

- **Visual:** every page renders on theme A in the system scheme from tokens and `src/components/ui`, with visible focus rings and one `<main>` per page. `@utility bg-cosmic` is gone. `npm run ui:check` covers every view file in `src/pages` and `src/components` outside `ui/`.
- **Forms:**
  - Form fields are `ui/label` + `ui/input` with no leading icons.
  - Errors appear under the field in `text-destructive`.
  - Server errors appear as a destructive `Alert`.
  - Pressing a valid submit disables the button and shows the pending text until the next page loads. A page restored from the browser's back/forward cache shows the button enabled again.
- **Auth pages:** a signed-in user who opens `/auth/signin`, `/auth/signup` or `/auth/confirm-email` lands on `/dashboard`, which forwards to `/onboarding` when onboarding is unfinished. A signed-out user on confirm-email sees "check your email".
- **Profile:** it has the app header. Onboarding has a slim header (wordmark and sign-out).
- **Errors:** unknown paths render a theme-A 404 page with status 404. The 500 page is on theme A.
- **Contracts unchanged:** form actions, field names, the `?error=` redirects and every smoke assertion.

### Key Discoveries:

- **Smoke checks HTML on these pages only through these markers, which must survive:**
  - `/name="version" value="([^"]+)"/` on `/onboarding` (`scripts/smoke.mjs:84`) and `name="version"` (`:117`): keep the attribute order and the double quotes.
  - `data-reminders="on"` on `/profile` (`:185`).
  - `action="/api/consent/withdraw"` on `/onboarding` (`:302-304`).
- **Smoke opens `/auth/signin` and `/auth/signup` only before signing in** (`smoke.mjs:94-95`), so the signed-in redirect keeps them at 200.
- **Field names read by the APIs:**
  - `email` and `password` (`api/auth/signin.ts:9-10`, `signup.ts:9-10`);
  - `mode`, `birth_year`, `sex`, `smoking_status`, `packs_per_day`, `smoking_years` and `years_since_quitting` (`api/profile.ts:18`, `lib/profile.ts:72-109`);
  - `consent`, `version`, `confirm`, `from` and `enabled` (consent, withdraw and reminders forms).
- **Plain Astro forms cannot hydrate a Radix control.** The consent, withdraw and reminders forms are plain Astro forms with no island, so shadcn Checkbox and RadioGroup (Radix, button-based, needs hydration) would be inert there. Native inputs stay, styled with tokens (`accent-primary`, `border-input`).
- **`createT` already falls back to Polish** when `locals.locale` is unset (`src/i18n/index.ts:40-42`), so the error pages need no extra locale guard.
- **Patterns to copy:**
  - the skip link and `<main>`: `dashboard.astro:147-155`;
  - the success alert `border-success/40`: `dashboard.astro:168-170`;
  - the destructive alert with an `aria-hidden` icon: `kitchen-sink.astro:287-289`;
  - link buttons via `buttonVariants`: `src/pages/index.astro`;
  - the header with focus ring and ghost sign-out: `AppHeader.astro:18-53`.

## What We're NOT Doing

- No new tokens. Every value exists in `global.css:12-81`.
- No shadcn Checkbox or RadioGroup. Native inputs are styled with tokens instead (see Key Discoveries).
- No change to API routes, form actions, field names, the error-code contract, middleware `PROTECTED_ROUTES` or `signup.ts`'s redirect target.
- No pending state for the plain Astro forms (consent, reminders, withdraw). They are server POSTs with no island, the same N/A as the dashboard (`kitchen-sink.astro:204-209`).
- No leading icons inside inputs.
- No dashboard tier-row polish (#67).
- No change to the landing copy.

## Implementation Approach

The shared form kit goes first, because sign-in, sign-up and the profile form all render it. Then each page group, then the error pages, then the visual gate, and last the guard together with the deletion of `bg-cosmic`, once no page uses it. A `PublicHeader.astro` (wordmark linking to `/`, plus one action slot) is extracted from the landing header and reused by the auth pages, onboarding and the error pages.

## Critical Implementation Details

- **Pending state and the back/forward cache.** The island sets `submitting = true` only after client validation passes, then lets the native POST proceed. If the browser later restores the page from its back/forward cache (the Back button after a redirect), React state is restored with it, so the button would stay disabled. Reset `submitting` on `pageshow` when `event.persisted` is true.
- **Intermediate look between phases.** Phase 1 changes the kit that `ProfileForm` renders inside onboarding's and profile's cosmic glass, so those two pages look mixed until Phases 3–4 land. This is acceptable on the branch, but don't take Phase 1 screenshots of onboarding or profile as gate evidence.

## Phase 1: Shared form kit on theme A

### Overview

Move the kit to `src/components/forms/`, rebuild it from `ui/*` and tokens without leading icons, and give the submit button a real pending state.

### Changes Required:

#### 1. Kit location

**File**: `src/components/auth/{FormField,SubmitButton,ServerError,PasswordToggle}.tsx` → `src/components/forms/` (move); `SignInForm.tsx`, `SignUpForm.tsx`, `ProfileForm.tsx` (imports)

**Intent**: The kit serves every form in the app, not only auth.

**Contract**:

- The four modules live in `src/components/forms/` with the same export names.
- `SignInForm` and `SignUpForm` stay in `src/components/auth/`.
- All three importers point at `@/components/forms/*`.

#### 2. FormField

**File**: `src/components/forms/FormField.tsx`

**Intent**: Replace the hand-built label and input with `ui/label` and `ui/input`, so focus and invalid states come from the ring and destructive tokens (charges C1, C2).

**Contract**:

- The `icon` prop is removed, and callers stop passing it.
- `endContent` stays, for the password toggle, which keeps the input's right padding.
- `aria-invalid` and the single `${id}-description` wiring are unchanged.
- Error text: `text-sm text-destructive` with a `CircleAlert` marked `aria-hidden`.
- Hint text: `text-sm text-muted-foreground`.
- `name ?? id` naming is unchanged.

#### 3. SubmitButton and pending state

**File**: `src/components/forms/SubmitButton.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`, `ProfileForm.tsx`

**Intent**: Make the loading and disabled state real (charge C3).

**Contract**:

- `SubmitButton` takes `pending: boolean` and drops `useFormStatus`.
- It renders `ui/button` with the default variant at full width, with no palette override.
- While pending:
  - `disabled`;
  - `aria-busy`;
  - a `Loader2` (or equivalent lucide) spinner, `animate-spin aria-hidden`, followed by `pendingText`.
- Its `icon` prop becomes optional.
- Each island sets `submitting` in `handleSubmit` after validation passes, and resets it on `pageshow` with `persisted` (see Critical Implementation Details).

#### 4. ServerError and PasswordToggle

**File**: `src/components/forms/ServerError.tsx`, `src/components/forms/PasswordToggle.tsx`

**Intent**: The server error is the repo's destructive alert, and the toggle uses tokens and has a focus ring.

**Contract**:

- `ServerError` renders `Alert variant="destructive"` with `CircleAlert aria-hidden` and `AlertDescription`. It renders nothing when there is no message.
- `PasswordToggle` uses `text-muted-foreground hover:text-foreground`, a `focus-visible` ring from `ring`, and keeps its `aria-label`.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/components/forms/*.tsx` returns 0 hits.
- No old paths remain: `rg -n 'components/auth/(FormField|SubmitButton|ServerError|PasswordToggle)|useFormStatus' src` returns nothing.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- Smoke passes against a local dev server: `npm run smoke`.

#### Manual Verification:

- On sign-in, submitting with empty fields shows the field errors under the inputs. They are red from the destructive token, and the input border turns destructive.
- A valid sign-in or sign-up submit disables the button and shows the pending text until the redirect.
- After a failed sign-in, Back then Forward leaves the button enabled.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Auth pages

### Overview

Give sign-in, sign-up and confirm-email the theme-A shell with a public header, guard them for signed-in users, and fix confirm-email (charges C1, C4).

### Changes Required:

#### 1. PublicHeader

**File**: `src/components/PublicHeader.astro` (new), `src/pages/index.astro`

**Intent**: One header for pages outside the app. The wordmark leads back to `/`.

**Contract**:

- `<header>` with the wordmark (`meta.title`, `font-heading`) as a link to `/` with the dashboard's `focusRing` classes.
- A default slot for one right-side action.
- The landing page renders it with its sign-in link, replacing its inline header without any visual change.

#### 2. Sign-in and sign-up

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/components/auth/{SignInForm,SignUpForm}.tsx`

**Intent**: Theme A shell, and no auth forms for someone already signed in.

**Contract**:

- `Astro.locals.user` → `Astro.redirect("/dashboard")`.
- The page has the skip link, `PublicHeader` (no action), and `<main id="main">` with a centred `Card`. The `CardHeader` holds the `<h1>` in `font-heading`.
- `?confirmed` renders the success `Alert` (`role="status"`, `border-success/40`, `CircleCheck aria-hidden`).
- The switch link ("No account? Sign up" and its reverse) is a `text-primary` link with a focus ring.
- No `bg-cosmic`, gradient or palette classes.
- The forms drop the `icon` props.

#### 3. Confirm-email

**File**: `src/pages/auth/confirm-email.astro`, `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: Base the page on the session, not the build mode.

**Contract**:

- `Astro.locals.user` → `Astro.redirect("/dashboard")`. This is the confirmations-off path.
- Otherwise it renders the "check your email" card: a `MailCheck` icon (`aria-hidden`, `text-primary`), `auth.confirm.pending.*` copy, and a link to `/auth/signin`.
- Remove the `auth.confirm.success.*` keys, the emoji and `import.meta.env.DEV`.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/auth/*.astro`, `src/components/auth/*.tsx` and `src/components/PublicHeader.astro` returns 0 hits.
- No old switches remain: `rg -n 'import\.meta\.env\.DEV|auth\.confirm\.success|bg-cosmic' src/pages/auth` returns nothing.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- Smoke passes against a local dev server: `npm run smoke`.

#### Manual Verification:

- Sign-in, sign-up and confirm-email in light and dark, at desktop width and ~375px: theme A, with a wordmark link back to `/`.
- Signed in, `/auth/signin`, `/auth/signup` and `/auth/confirm-email` redirect to `/dashboard`, or on to `/onboarding`.
- `/auth/signin?confirmed=1` shows the success alert. `/auth/signin?error=invalid_credentials` shows the destructive alert.
- The landing page header looks unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Onboarding

### Overview

Theme A for both onboarding steps, `ProfileForm` and the withdraw form, which both onboarding and profile render.

### Changes Required:

#### 1. Onboarding page

**File**: `src/pages/onboarding.astro`

**Intent**: A focused, gated step with a slim header (no app nav).

**Contract**:

- Skip link, `PublicHeader` with a sign-out ghost button (POST `/api/auth/signout`, `nav.signout`) as its action, and `<main id="main">`. Each step sits in a `Card` with an `<h1>` in `font-heading`.
- The bottom sign-out link is removed.
- `?withdrawn`: success `Alert`.
- Consent `?error`: destructive `Alert`.
- The consent `dl` uses token text: headings `text-foreground`, body `text-muted-foreground`.
- The consent checkbox stays a native `required` checkbox with `accent-primary`, in a label box styled `border-input bg-card`. Its submit is `ui/button`.
- The hidden `version` input keeps `name="version" value=...` in that order.

#### 2. ProfileForm and ChoiceGroup

**File**: `src/components/profile/ProfileForm.tsx`, `src/components/forms/ChoiceGroup.tsx` (new, extracted)

**Intent**: The radio group becomes a shared, token-based kit piece, so the kitchen sink can render it.

**Contract**:

- `ChoiceGroup` keeps its fieldset, legend and native radios, and its `aria-describedby` wiring for hint and error.
  - The selected option is `border-primary bg-primary/10 text-foreground`.
  - Others are `border-input bg-card hover:bg-accent`.
  - Focus is `focus-within` ring from `ring`, or `destructive` when there is an error.
  - Radios use `accent-primary`.
  - The error has the same markup as `FormField`'s.
- In `ProfileForm`:
  - hints use `text-muted-foreground`;
  - the pack-years box uses `border-border bg-muted`, with the value in `text-foreground`;
  - leading icons are removed;
  - field names and the hidden `mode` are unchanged.

#### 3. WithdrawConsentForm

**File**: `src/components/profile/WithdrawConsentForm.astro`

**Intent**: A recognisably destructive action, on tokens.

**Contract**:

- The section heading is `font-heading` and the text `text-muted-foreground`.
- The confirm checkbox is native, with `accent-destructive`, in a label box styled `border-input bg-card`.
- The error uses a destructive `Alert`. The submit is `ui/button variant="destructive"`.
- `action="/api/consent/withdraw"` and the hidden `from` / `confirm` names are unchanged.
- The `border-white/10` divider becomes `border-border`.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/onboarding.astro`, `src/components/profile/ProfileForm.tsx`, `src/components/profile/WithdrawConsentForm.astro` and `src/components/forms/ChoiceGroup.tsx` returns 0 hits.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- Smoke passes against a local dev server: `npm run smoke`. This covers the onboarding `version` and withdraw markers.

#### Manual Verification:

- A fresh account, in light and dark at desktop width and ~375px:
  - The consent step and the profile step look like theme A.
  - The smoking choices reveal the conditional fields.
  - The pack-years box is readable.
- Keyboard: radios, checkbox, fields and buttons all show a visible ring.
- Withdraw from onboarding without ticking the box shows the destructive alert. With the box ticked, it lands on the success alert.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Profile

### Overview

Make profile part of the app: the same header as the dashboard, and cards for its three sections.

### Changes Required:

#### 1. Profile page

**File**: `src/pages/profile.astro`

**Intent**: Remove the dead-end card with its own back-link and sign-out.

**Contract**:

- The layout follows `dashboard.astro:147-155`:
  - `Layout hideLanguageSwitcher`;
  - the skip link;
  - `AppHeader`, where "Profile" gets `aria-current`;
  - `<main id="main">` with an `<h1>` in `font-heading` and an intro in `text-muted-foreground`.
- `?saved`: success `Alert`.
- Three `Card`s: the profile form, reminders (`id="reminders"` kept for the dashboard hint link `/profile#reminders`), and withdraw.
- The footer back-link and sign-out are removed.

#### 2. RemindersForm

**File**: `src/components/profile/RemindersForm.astro`

**Intent**: Token state and real buttons.

**Contract**:

- On/off state: a `Badge`, with `bg-secondary` for on and the outline style for off.
- Toggle: `ui/button`. "Turn on" uses the default variant and "Turn off" the outline variant.
- Saved: success `Alert`. Error: destructive `Alert`.
- `section#reminders`, `data-reminders="on|off"`, `action="/api/reminders"` and the hidden `enabled` are unchanged.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/profile.astro` and `src/components/profile/RemindersForm.astro` returns 0 hits.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- Smoke passes against a local dev server: `npm run smoke`. This covers `data-reminders` and `/profile?saved=1`.

#### Manual Verification:

- Profile in light and dark at desktop width and ~375px: app header, three cards, readable states.
- Turning reminders on and off shows the saved alert and switches the badge.
- The dashboard's reminders hint link scrolls to the reminders card.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Error pages

### Overview

Theme A for 500, and a new 404.

### Changes Required:

#### 1. 500 and 404

**File**: `src/pages/500.astro`, `src/pages/404.astro` (new), `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: The error pages look like the product and offer a way on.

**Contract**:

- Both pages: `PublicHeader`, `<main id="main">`, and a centred `Card` with an `<h1>` in `font-heading`. Text is `text-muted-foreground`. Actions are `<a>` elements styled with `buttonVariants`.
- 500 keeps `role="alert"` and its retry (`pathname + search`, default variant) and home (outline variant) links.
- 404 has a home link (default variant). New keys `notFound.title` and `notFound.message`, with the home label reused from `errorPage.home`, in both locales.
- Unknown routes and `/dev/kitchen-sink` in a production build still return status 404.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/500.astro` and `src/pages/404.astro` returns 0 hits.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- In the production preview, `/does-not-exist` and `/dev/kitchen-sink` both return 404 with the new page: `npm run preview`, then `curl -s -o /dev/null -w "%{http_code}"` on each, printing `404`.
- Smoke passes against a local dev server: `npm run smoke`.

#### Manual Verification:

- 404 in light and dark at desktop width and ~375px, with a working home link.
- 500 is reviewed by opening `/500` in the dev server, which renders the page with status 500 (checked 2026-10-05). Check theme A and both links.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: States and visual gate

### Overview

Show the form states in the kitchen sink and capture screenshots of every migrated page.

### Changes Required:

#### 1. Kitchen sink "Forms" block

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Render the states that drift first, in both schemes, through the real kit.

**Contract**:

- A new block per scheme column renders the kit statically, with no `client:` directive:
  - `FormField` in default, with hint, invalid (with error text) and disabled;
  - `PasswordToggle` inside a field;
  - `SubmitButton` idle and `pending`;
  - `ServerError` with a message;
  - `ChoiceGroup` with one selected, plus an error variant;
  - the success `Alert`.
- The legend notes are updated:
  - loading is "Shown" for the island submit and N/A for plain Astro forms;
  - error and disabled list the new forms block.

#### 2. 7-state matrix and screenshots

**File**: `context/changes/auth-ui-redesign/screenshots/` (new), PR description

**Intent**: Gate evidence for every page touched.

**Contract**: The verdicts below; screenshots of sign-in, sign-up, confirm-email, onboarding (consent and profile step), profile and 404, in light and dark at 1280px and 375px (the iframe method from `continue-ui-redesign`); and the kitchen-sink forms block.

| State         | Verdict                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------ |
| default       | Shown: every page and the kitchen-sink forms block                                         |
| hover         | Live: `ui/button` variants, links, choice options (`hover:bg-accent`)                      |
| focus-visible | Live: `ring` on inputs, toggle, radios (`focus-within`), checkboxes, buttons, links        |
| disabled      | Shown: kitchen-sink disabled field and pending button                                      |
| error         | Shown: field error, server error alert, consent/withdraw/reminders destructive alerts      |
| empty         | N/A: forms have no list data; a signed-in user on auth pages is a redirect                 |
| loading       | Shown for island submits (pending button); N/A for plain Astro POST forms (full page load) |

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/dev/kitchen-sink.astro` returns 0 hits.
- Build succeeds, and the kitchen sink still returns 404 in production: `npm run build`.
- Linting passes: `npm run lint`.

#### Manual Verification:

- Screenshots of every listed page at 1280px and 375px, light and dark, saved in the change folder and attached to the PR.
- Contrast spot-check in both schemes: muted text, destructive text and button (dark), the success alert border, and the focus ring.
- Kitchen-sink forms block reviewed in both columns.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Retire `bg-cosmic`, guard and docs

### Overview

Delete the legacy utility, put every migrated file under the guard, and update the docs.

### Changes Required:

#### 1. Remove the legacy utility

**File**: `src/styles/global.css`

**Intent**: No cosmic theme left to fall back to.

**Contract**: Delete `@utility bg-cosmic` (`:83-86`) and its comment.

#### 2. Guard

**File**: `scripts/ui-check.mjs`, `package.json`

**Intent**: Every view file is checked in CI and in pre-commit.

**Contract**:

- `MIGRATED` gains:
  - `src/pages/onboarding.astro`, `src/pages/profile.astro`, `src/pages/500.astro`, `src/pages/404.astro`;
  - `src/pages/auth/*.astro`;
  - `src/components/PublicHeader.astro`;
  - `src/components/auth/*.tsx`, `src/components/forms/*.tsx`;
  - `src/components/profile/*.tsx`, `src/components/profile/*.astro`.
- The lint-staged glob at `package.json:76` gains the same paths inside its braces.

#### 3. Docs

**File**: `README.md`, `CLAUDE.md`

**Intent**: The docs match the state of the code.

**Contract**:

- `README.md:88` no longer says pages are unmigrated. Its design-system section lists the shared form kit.
- `CLAUDE.md`'s UI section gains one line:
  - the form kit lives in `src/components/forms/` (FormField, ChoiceGroup, PasswordToggle, SubmitButton with `pending`, ServerError);
  - check there before building a field;
  - native checkboxes and radios in plain Astro forms (Radix controls need hydration).

### Success Criteria:

#### Automated Verification:

- `npm run ui:check` passes with the extended list.
- No cosmic theme remains: `rg -n 'bg-cosmic|backdrop-blur|bg-gradient-to|text-transparent' src` returns nothing.
- No palette classes remain outside `ui/`: `rg -n '\b(bg|text|border)-(white|black|purple|blue|red|green)' src --glob '!src/components/ui/**'` returns nothing.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- Smoke passes against a local dev server: `npm run smoke`.
- pgTAP tests still pass: `npx supabase test db`.

#### Manual Verification:

- Full flow on a fresh account, in light and dark: landing → sign-up → (confirm-email redirect) → onboarding consent → profile step → dashboard → profile → sign-out → landing. There are no cosmic remnants.
- The pre-commit hook blocks a test literal (e.g. `text-white`) in `src/pages/profile.astro`, which is then reverted.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 8: Strong passwords

### Overview

Added on 2026-10-05 at the owner's request, after Phases 1–7 were implemented: sign-up requires a strong password. The policy (owner decision) is **at least 12 characters, containing at least one letter and one digit**. Supabase Auth enforces it on the server, the sign-up endpoint checks it before calling Supabase, and the form shows the rules live.

### Changes Required:

#### 1. Shared policy

**File**: `src/lib/password.ts` (new)

**Intent**: One definition of "strong", used by the form and the endpoint.

**Contract**:

- `PASSWORD_MIN_LENGTH = 12`.
- `passwordIssues(password)` returns the unmet rules out of `"too_short"` and `"needs_letter_and_digit"`.
- A letter is ASCII `A–Z`/`a–z` and a digit is `0–9`. This mirrors Supabase's `letters_digits`, which counts only those characters, so the client never accepts a password the server rejects.

#### 2. Server enforcement

**File**: `src/pages/api/auth/signup.ts`, `supabase/config.toml`

**Intent**: The policy holds even when the client check is bypassed.

**Contract**:

- `signup.ts`: when `passwordIssues` is non-empty, redirect to `/auth/signup?error=weak_password` before calling Supabase. The code and its copy already exist (`errors.auth.weak_password`), and the endpoint keeps the redirect-with-code shape.
- `config.toml`: `minimum_password_length = 12`, `password_requirements = "letters_digits"`. This is local only. Production is set by the owner in the Supabase dashboard, never with `config push` (CLAUDE.md hard rule).

#### 3. Sign-up form

**File**: `src/components/auth/SignUpForm.tsx`, `src/i18n/pl.ts`, `src/i18n/en.ts`, `src/pages/dev/kitchen-sink.astro`

**Intent**: The user sees the rules before submitting, not only an error afterwards.

**Contract**:

- Validation uses `passwordIssues`. "Too short" reuses `auth.form.passwordTooShort` with the new count. "Needs a letter and a digit" gets the new key `auth.form.passwordNeedsLetterAndDigit`.
- The password hint becomes a live two-item rule list:
  - the items are length ≥ 12, and a letter plus a digit;
  - each shows met or unmet with an `aria-hidden` icon, using `text-success` for met and `text-muted-foreground` for unmet;
  - each rule's state is also in text, not colour alone.
- `passwordRemaining_*` keys are removed if unused.
- The placeholder reflects 12.
- The kitchen-sink Forms block shows the rule list with one rule met and one unmet.

#### 4. Smoke and docs

**File**: `scripts/smoke.mjs`, `README.md`, `CLAUDE.md`

**Intent**: The policy is tested and the production setting is not forgotten.

**Contract**:

- Smoke adds `signup rejects a weak password` (POST with a short, digit-free password) → 302 to `/auth/signup?error=weak_password`, before the real sign-up. The existing smoke password (`Smoke-Test-Passw0rd!`) already complies.
- README states the policy and the matching dashboard setting.
- CLAUDE.md gains one line: the policy lives in `src/lib/password.ts` and must match `config.toml` and the production dashboard.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/components/auth/SignUpForm.tsx` and `src/pages/dev/kitchen-sink.astro` returns 0 hits.
- After the local stack restarts with the new `config.toml`, Supabase rejects a weak password directly: `POST /auth/v1/signup` with `short1` returns `weak_password`.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- `npm run ui:check` passes.
- Smoke passes against a local dev server, including the new weak-password step: `npm run smoke`.

#### Manual Verification:

- On sign-up, typing a password updates both rules live. A compliant password submits, and a weak one is blocked with the error under the field.
- Posting a weak password with client validation bypassed (e.g. devtools) lands on the weak-password alert.
- The owner sets the same policy in the production Supabase dashboard: Authentication → Email → minimum length 12, "Letters and digits".

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 9: Quieter consent withdrawal on onboarding

### Overview

Added on 2026-10-05 at the owner's request: the full withdraw section should not compete with the profile form on onboarding's profile step. It cannot be removed. Once consent is given in step 1, withdrawing must stay possible before a profile exists (GDPR Art. 7(3)). The S-01 change put it there, and smoke checks it. The owner chose a collapsed toggle.

### Changes Required:

#### 1. Collapsed withdrawal

**File**: `src/pages/onboarding.astro`, `src/components/profile/WithdrawConsentForm.astro`, `src/i18n/pl.ts`, `src/i18n/en.ts`

**Intent**: Keep withdrawal one click away but visually quiet.

**Contract**:

- On the profile step, `WithdrawConsentForm` sits inside a `<details>` under the form, with a top `border-border` divider.
- Its `<summary>` follows the dashboard's summary pattern (`ScreeningActions.astro:64`), in `text-muted-foreground`. Copy: `onboarding.withdraw.toggle`, "Chcesz wycofać zgodę?" / "Want to withdraw your consent?".
- The `<details>` is `open` when a withdraw attempt came back with an error.
- The form's own onboarding-only divider is removed.
- The form stays in the HTML, so smoke's `action="/api/consent/withdraw"` check on `/onboarding` holds. Profile is unchanged.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on `src/pages/onboarding.astro` and `src/components/profile/WithdrawConsentForm.astro` returns 0 hits.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- Smoke passes against a local dev server: `npm run smoke`. This includes "onboarding offers withdrawal before a profile exists".

#### Manual Verification:

- On the onboarding profile step, withdrawal shows only as the muted "Chcesz wycofać zgodę?" toggle. Opening it shows the full form, and withdrawing still works.
- A withdraw attempt without the confirm box reopens the page with the toggle expanded and the error visible.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 10: Vertically centred auth and error pages, working pre-commit hook

### Overview

Added on 2026-10-05 after the manual review:

- **Centring (owner request):** the sign-in, sign-up, confirm-email, 404 and 500 cards are centred vertically instead of sitting near the top.
- **Pre-commit hook (fixes manual check 7.10):** the hook check failed because `package.json` never had a `prepare` script, so husky was never installed in any clone and the documented pre-commit `ui:check` never ran. The fix landed in `58ee70b`.

### Changes Required:

#### 1. Centred shell

**File**: `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/pages/404.astro`, `src/pages/500.astro`

**Intent**: The card is the focus of these single-task pages.

**Contract**:

- `PublicHeader` and `<main>` sit in a `flex min-h-dvh flex-col` wrapper.
- `<main>` is `flex flex-1 flex-col justify-center` and keeps `pb-24`, so the floating language pill never covers the card on mobile. The card therefore sits slightly above true centre.

#### 2. Pre-commit hook

**File**: `package.json`

**Intent**: The hook described in CLAUDE.md is installed on `npm install` / `npm ci`.

**Contract**: The `"prepare": "husky"` script sets `core.hooksPath = .husky/_`. Note that this config is shared by every worktree of the repo.

### Success Criteria:

#### Automated Verification:

- Hardcoded-value scan on the five pages returns 0 hits.
- Linting passes: `npm run lint`.
- Type and template check passes: `npx astro check`.
- Build succeeds: `npm run build`.
- `npm run ui:check` passes.
- Smoke passes against a local dev server: `npm run smoke`.

#### Manual Verification:

- Sign-in, sign-up, confirm-email, 404 and 500 show the card vertically centred at desktop and 375px, light and dark.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- None: the repo has no unit suite yet (F-03). Client validation and naming are unchanged.

### Integration Tests:

- `npm run smoke` after every phase. It covers auth, onboarding, profile, reminders, withdraw and sign-out, plus the HTML markers listed in Key Discoveries.
- `npx supabase test db` in Phase 7 (no database change expected).

### Manual Testing Steps:

1. Signed out: landing → sign-up with a too-short password (hint, then error) → a valid sign-up (pending button) → onboarding.
2. Consent without the box ticked (native required), then with it → profile step → choose "former smoker" → fields appear → save → dashboard.
3. Profile: app header, reminders on/off, a withdraw error, then withdraw → onboarding success alert.
4. While signed in, open `/auth/signin`: redirect. Sign out, open `/auth/signin?confirmed=1`: success alert.
5. Open `/nope`: themed 404.

## Performance Considerations

Removing the glass `backdrop-blur-xl` layers from six pages lowers paint cost. The islands keep `client:load`, and the kit now adds `ui/input`, `ui/label` and `ui/alert`. These are tiny and already bundled for the dashboard's static render, but they are new to the islands.

## Migration Notes

No database, API or production-setting change. The branch is `feat/continue-ui-redesign` and carries the landing change too, in one PR closing #61, #62 and #63. Merging stays with the owner.

## References

- Research: `context/changes/auth-ui-redesign/research.md`
- Previous change on this branch: `context/changes/continue-ui-redesign/plan.md` (landing, `buttonVariants` links, screenshot method)
- Prior theme work: `context/archive/2026-09-30-ui-refactor/plan.md`, `directions.md`
- Patterns: `src/pages/dashboard.astro:147-176`, `src/components/AppHeader.astro`, `src/pages/dev/kitchen-sink.astro:180-210,287-289,405-455`
- Issues: #62, #63

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared form kit on theme A

#### Automated

- [x] 1.1 Hardcoded-value scan on `src/components/forms/*.tsx` returns 0 hits — 071ffff
- [x] 1.2 No old kit paths or `useFormStatus` remain in src — 071ffff
- [x] 1.3 Linting passes: `npm run lint` — 071ffff
- [x] 1.4 Type and template check passes: `npx astro check` — 071ffff
- [x] 1.5 Build succeeds: `npm run build` — 071ffff
- [x] 1.6 Smoke passes against a local dev server: `npm run smoke` — 071ffff

#### Manual

- [x] 1.7 Sign-in empty submit shows destructive field errors under the inputs — 071ffff
- [x] 1.8 Valid submit disables the button and shows the pending text — 071ffff
- [x] 1.9 Back/forward after a failed sign-in leaves the button enabled — 071ffff

### Phase 2: Auth pages

#### Automated

- [x] 2.1 Hardcoded-value scan on auth pages, auth islands and PublicHeader returns 0 hits — 3e7f7a3
- [x] 2.2 No DEV switch, success-copy keys or bg-cosmic remain in auth pages — 3e7f7a3
- [x] 2.3 Linting passes: `npm run lint` — 3e7f7a3
- [x] 2.4 Type and template check passes: `npx astro check` — 3e7f7a3
- [x] 2.5 Build succeeds: `npm run build` — 3e7f7a3
- [x] 2.6 Smoke passes against a local dev server: `npm run smoke` — 3e7f7a3

#### Manual

- [x] 2.7 Auth pages in light and dark at desktop and ~375px with a wordmark link to `/` — 3e7f7a3
- [x] 2.8 Signed-in visits to auth pages redirect to `/dashboard` — 3e7f7a3
- [x] 2.9 `?confirmed=1` shows the success alert and `?error=` the destructive alert — 3e7f7a3
- [x] 2.10 Landing header looks unchanged — 3e7f7a3

### Phase 3: Onboarding

#### Automated

- [x] 3.1 Hardcoded-value scan on onboarding, ProfileForm, WithdrawConsentForm and ChoiceGroup returns 0 hits — 417b6a1
- [x] 3.2 Linting passes: `npm run lint` — 417b6a1
- [x] 3.3 Type and template check passes: `npx astro check` — 417b6a1
- [x] 3.4 Build succeeds: `npm run build` — 417b6a1
- [x] 3.5 Smoke passes against a local dev server: `npm run smoke` — 417b6a1

#### Manual

- [x] 3.6 Fresh account: consent and profile steps on theme A, conditional fields and pack-years readable — 417b6a1
- [x] 3.7 Keyboard ring visible on radios, checkbox, fields and buttons — 417b6a1
- [x] 3.8 Withdraw from onboarding: error alert without the box, success alert with it — 417b6a1

### Phase 4: Profile

#### Automated

- [x] 4.1 Hardcoded-value scan on profile and RemindersForm returns 0 hits — 971abdb
- [x] 4.2 Linting passes: `npm run lint` — 971abdb
- [x] 4.3 Type and template check passes: `npx astro check` — 971abdb
- [x] 4.4 Build succeeds: `npm run build` — 971abdb
- [x] 4.5 Smoke passes against a local dev server: `npm run smoke` — 971abdb

#### Manual

- [x] 4.6 Profile in light and dark at desktop and ~375px with app header and three cards — 971abdb
- [x] 4.7 Reminders on/off shows the saved alert and switches the badge — 971abdb
- [x] 4.8 Dashboard reminders hint link scrolls to the reminders card — 971abdb

### Phase 5: Error pages

#### Automated

- [x] 5.1 Hardcoded-value scan on 500 and 404 returns 0 hits — 86fc8ad
- [x] 5.2 Linting passes: `npm run lint` — 86fc8ad
- [x] 5.3 Type and template check passes: `npx astro check` — 86fc8ad
- [x] 5.4 Build succeeds: `npm run build` — 86fc8ad
- [x] 5.5 Production preview returns 404 with the new page for an unknown path and the kitchen sink — 86fc8ad
- [x] 5.6 Smoke passes against a local dev server: `npm run smoke` — 86fc8ad

#### Manual

- [x] 5.7 404 in light and dark at desktop and ~375px with a working home link — 86fc8ad
- [x] 5.8 500 page reviewed on theme A with both links — 86fc8ad

### Phase 6: States and visual gate

#### Automated

- [x] 6.1 Hardcoded-value scan on the kitchen sink returns 0 hits — 8cab72a
- [x] 6.2 Build succeeds and the kitchen sink still returns 404 in production — 8cab72a
- [x] 6.3 Linting passes: `npm run lint` — 8cab72a

#### Manual

- [x] 6.4 Screenshots of every listed page at 1280px and 375px, light and dark, saved and attached — 8cab72a
- [x] 6.5 Contrast spot-check in both schemes — 8cab72a
- [x] 6.6 Kitchen-sink forms block reviewed in both columns — 8cab72a

### Phase 7: Retire `bg-cosmic`, guard and docs

#### Automated

- [x] 7.1 `npm run ui:check` passes with the extended list — 4a5f130
- [x] 7.2 No cosmic theme remains in src — 4a5f130
- [x] 7.3 No palette classes remain outside `ui/` — 4a5f130
- [x] 7.4 Linting passes: `npm run lint` — 4a5f130
- [x] 7.5 Type and template check passes: `npx astro check` — 4a5f130
- [x] 7.6 Build succeeds: `npm run build` — 4a5f130
- [x] 7.7 Smoke passes against a local dev server: `npm run smoke` — 4a5f130
- [x] 7.8 pgTAP tests still pass: `npx supabase test db` — 4a5f130

#### Manual

- [x] 7.9 Full flow on a fresh account in light and dark without cosmic remnants — 4a5f130
- [x] 7.10 Pre-commit hook blocks a test literal in `src/pages/profile.astro` — 58ee70b

### Phase 8: Strong passwords

#### Automated

- [x] 8.1 Hardcoded-value scan on SignUpForm and the kitchen sink returns 0 hits — 9be5681
- [x] 8.2 Local Supabase rejects a weak password directly after the restart — 9be5681
- [x] 8.3 Linting passes: `npm run lint` — 9be5681
- [x] 8.4 Type and template check passes: `npx astro check` — 9be5681
- [x] 8.5 Build succeeds: `npm run build` — 9be5681
- [x] 8.6 `npm run ui:check` passes — 9be5681
- [x] 8.7 Smoke passes, including the weak-password step: `npm run smoke` — 9be5681

#### Manual

- [x] 8.8 Sign-up shows live rules; compliant submits, weak is blocked under the field — 9be5681
- [x] 8.9 A weak password posted past client validation lands on the weak-password alert — 9be5681
- [x] 8.10 Owner sets the policy in the production Supabase dashboard — 9be5681

### Phase 9: Quieter consent withdrawal on onboarding

#### Automated

- [x] 9.1 Hardcoded-value scan on onboarding and WithdrawConsentForm returns 0 hits — 4bac509
- [x] 9.2 Linting passes: `npm run lint` — 4bac509
- [x] 9.3 Type and template check passes: `npx astro check` — 4bac509
- [x] 9.4 Build succeeds: `npm run build` — 4bac509
- [x] 9.5 Smoke passes, including onboarding withdrawal: `npm run smoke` — 4bac509

#### Manual

- [x] 9.6 Onboarding shows withdrawal as a muted toggle that opens the full form — 4bac509
- [x] 9.7 A failed withdraw reopens with the toggle expanded and the error visible — 4bac509

### Phase 10: Vertically centred auth and error pages, working pre-commit hook

#### Automated

- [x] 10.1 Hardcoded-value scan on the five pages returns 0 hits
- [x] 10.2 Linting passes: `npm run lint`
- [x] 10.3 Type and template check passes: `npx astro check`
- [x] 10.4 Build succeeds: `npm run build`
- [x] 10.5 `npm run ui:check` passes
- [x] 10.6 Smoke passes against a local dev server: `npm run smoke`

#### Manual

- [ ] 10.7 Auth and error cards vertically centred at desktop and 375px, light and dark
