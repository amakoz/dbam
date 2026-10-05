---
date: 2026-10-05T12:58:26Z
researcher: Claude (Opus 5.5) for Amadeusz Kozlowski
git_commit: 8e22d32effd1a0030215d64d823e7c7c0e40d781
branch: feat/continue-ui-redesign
repository: amakoz/dbam
topic: "/10x-ui audit of sign-up and sign-in (#62): charges against theme A, continuing the landing audit"
tags: [research, ui, auth, signin, signup, forms, design-system, confirm-email]
status: complete
last_updated: 2026-10-05
last_updated_by: Claude (Opus 5.5)
---

# Research: sign-up and sign-in against the design system (#62)

**Date**: 2026-10-05T12:58:26Z
**Researcher**: Claude (Opus 5.5) for Amadeusz Kozlowski
**Git Commit**: 8e22d32effd1a0030215d64d823e7c7c0e40d781
**Branch**: feat/continue-ui-redesign
**Repository**: amakoz/dbam

## Research Question

This research continues the `/10x-ui` audit from `context/changes/continue-ui-redesign/`, which moved the landing page `/` onto theme A. Its next click leads to sign-up and sign-in.

The view is `src/pages/auth/{signup,signin}.astro` and the form kit both pages render, `src/components/auth/*.tsx`. The questions are:

- Which literals should come from theme A tokens or from `src/components/ui`?
- What happens at the entry points into these pages?
- Do `confirm-email` and `500` belong in this change?

The output is 3–5 charges for `/10x-plan`.

## Summary

- **The view is still on the cosmic theme.** The scan finds 36 hardcoded values across its 8 files.
- **One shared component is used, and only partly.** `ui/button` appears in `SubmitButton`, but its look is overridden with `bg-purple-600`. `ui/input`, `ui/label`, `ui/alert` and `ui/card` exist and are used by the dashboard, but not here.
- **Loading is broken.** The submit button's pending state cannot fire: `useFormStatus` only tracks function form actions, and these forms post to a URL.
- **Entry points are unguarded.** Signed-in users can open the sign-in and sign-up forms. `confirm-email` picks its copy with a dev-mode proxy that does not match confirmation settings.
- **Scope coupling with #63.** The form kit is not auth-only. `ProfileForm.tsx` imports three of its four components, and onboarding and profile still sit on the dark cosmic shell. Moving the kit to tokens therefore changes those two pages too. This is the main scope decision for the plan.

## Charges

Each charge gives a file:line and the effect on the user. The plan must address each one or mark it **deferred** with a reason.

### C1. Missing tokens: the auth pages and form kit paint the cosmic theme (category: missing tokens)

- **Evidence: page shells**
  - The wrapper is `bg-cosmic`, inside a glass card `border-white/10 bg-white/10 … text-white backdrop-blur-xl`, with a `from-blue-200 to-purple-200` gradient h1 (`src/pages/auth/signin.astro:15-17`, `src/pages/auth/signup.astro:14-16`).
  - The "email confirmed" note is `border-green-500/30 bg-green-900/30 … text-green-200` (`signin.astro:21`).
  - Links use `text-purple-300` and body text `text-blue-100/60` (`signin.astro:26-28`, `signup.astro:20-22`).
- **Evidence: form kit**
  - The input base is `bg-white/10 … text-white placeholder-white/40` (`src/components/auth/FormField.tsx:5-6`).
  - The label is `text-blue-100/80` (`:38`) and the icon `text-white/40` (`:42`).
  - Border and ring are `border-red-400/60 focus:ring-red-400` or `border-white/20 focus:ring-purple-400` (`:56`), and the error text is `text-red-300` (`:63`).
  - `SubmitButton.tsx:18` overrides `ui/button` with `bg-purple-600 … text-white hover:bg-purple-500`, and its spinner is `border-white/30 border-t-white` (`:22`).
  - `ServerError.tsx:11` is `border-red-500/30 bg-red-900/30 … text-red-300`.
  - `PasswordToggle.tsx:15` is `text-white/40 hover:text-white/70`.
  - The password hint is `text-blue-100/50` (`SignUpForm.tsx:62`).
- **Should be:** the tokens `bg-background` / `bg-card`, `text-foreground` / `text-muted-foreground`, `border-input`, `ring` and `destructive`, plus `success` for the confirmation note. The note follows the dashboard's `border-success/40` status alert at `src/pages/dashboard.astro:168-170`. All these tokens already exist (`src/styles/global.css:12-81`).
- **Effect on the user:** the new theme-A landing sends visitors via "Zarejestruj się" or "Zaloguj się" to a dark purple page. The second screen of the core flow looks like another product.

### C2. Missing shared component: a hand-built field, alert and card (category: missing shared component)

- **Evidence:**
  - `FormField.tsx:36-71` builds its own `<label>` and `<input>`, where `ui/label` and `ui/input` (`src/components/ui/{label,input}.tsx`) would do. `ui/input` already provides:
    - the focus ring from the `ring` token, `focus-visible:border-ring focus-visible:ring-ring` (`input.tsx:11`);
    - the invalid style from `aria-invalid`, `aria-invalid:border-destructive aria-invalid:ring-destructive/20` (`input.tsx:12`).
  - `ServerError.tsx:10-14` and the confirmation note (`signin.astro:20-24`) rebuild `ui/alert`. It has a `destructive` variant (`alert.tsx:11-13`), and the dashboard already uses it with a `CircleAlert aria-hidden` icon (`kitchen-sink.astro:287-289`, `dashboard.astro:174-176`).
  - The page card rebuilds `ui/card` (`signin.astro:16`, `signup.astro:15`).
- **Effect on the user:**
  - The keyboard focus ring is `purple-400`, not the theme ring (`FormField.tsx:56`).
  - Field errors are 12px pale red, `text-xs text-red-300` (`:63`). The error icon has no `aria-hidden` (`:64`), so screen readers meet an unnamed graphic before the message.
  - Fields look and behave differently from the dashboard's fields.
- **No shared field helper exists yet.** `FormField.tsx` has the only icon-in-input and per-field-message pattern in `src/`. Migrated views show errors through a separate `Alert`, not a message under the field (`ScreeningActions.astro:58-60,84-85`).

### C3. Accidental architecture: the loading state is dead, and submit can be pressed twice (category: accidental architecture)

- **Evidence:**
  - `SubmitButton.tsx:12-20` disables the button and shows `pendingText` only while `useFormStatus().pending` is true.
  - The forms submit natively to a URL: `SignInForm.tsx:46` (`action="/api/auth/signin"`), `SignUpForm.tsx:68` (`/api/auth/signup`) and `ProfileForm.tsx:130` (`/api/profile`).
  - In the installed react-dom 19.3.0, the submit handler starts a host transition, which is what sets `pending`, only when `"function" === typeof action` (`node_modules/react-dom/cjs/react-dom-client.development.js:20725-20790`). A string action is left to the browser.
- **Effect on the user:** after pressing "Zaloguj się" or "Zarejestruj się", nothing changes until the next page loads.
  - The button stays enabled, so a second press posts again.
  - The `auth.signin.pending` / `auth.signup.pending` copy and the spinner are never seen.
  - This is source analysis; it was not observed in a running browser.
- **The dashboard's N/A precedent does not carry over.** The dashboard kitchen sink marks loading N/A because those are plain server forms with no island (`kitchen-sink.astro:204-209`). These forms are hydrated React islands (`client:load`, `signin.astro:25`, `signup.astro:19`), so a client-side pending flag set on a valid submit is available here.

### C4. Accidental architecture: unguarded entry points and a dev-mode copy switch (category: accidental architecture)

- **Evidence:**
  - `/auth/*` is not in `PROTECTED_ROUTES` (`src/middleware.ts:5-13`), and the auth pages never check `Astro.locals.user`. A signed-in user who opens `/auth/signin` or `/auth/signup` sees the form, unlike `/`, which redirects (`src/pages/index.astro:8-10`).
  - `confirm-email.astro:6` chooses between "Registration successful, you can sign in" and "Check your email" with `import.meta.env.DEV`. Whether confirmation is needed depends on the Supabase project's setting, not on the build mode:
    - local `enable_confirmations = false` (`supabase/config.toml:209`);
    - production is configured in the dashboard (`CLAUDE.md`, hard rules).
- **Where the DEV switch shows the wrong copy:**
  - A production build against the local stack (preview, or the CI smoke) shows "check your email" although no email is needed.
  - A dev server against a hosted project with confirmations on would claim the account is ready.
- **Other entry-point issues:**
  - The emoji icons ✅ / 📧 (`confirm-email.astro:10,16,26`) are announced by screen readers.
  - None of the three auth pages has a wordmark or a way back to `/` (`signin.astro:14-33`, `signup.astro:13-27`, `confirm-email.astro:23-35`). The only exit besides the form is the floating language switcher.
- **Effect on the user:**
  - A signed-in user can be shown sign-in again.
  - A new user may be told to wait for an email that never comes, or told they can sign in before they have confirmed.
  - A visitor who opened sign-up by mistake has no link back to the landing page.

### C5. Accidental architecture: the "auth" form kit is the app's form kit (category: accidental architecture / scope)

- **Evidence:**
  - `src/components/profile/ProfileForm.tsx:3-5` imports `FormField`, `SubmitButton` and `ServerError` from `@/components/auth/*`. Only `PasswordToggle` is auth-only (it is imported only by `SignInForm.tsx:4` and `SignUpForm.tsx:4`).
  - `ProfileForm` renders inside the cosmic glass shells of `src/pages/onboarding.astro:41-42` and `src/pages/profile.astro:50-51`, which are #63's pages.
  - `ProfileForm` also styles its own choice groups and pack-years box with palette classes (`ProfileForm.tsx:44-96`).
- **Effect on the user:**
  - If only the kit moves to tokens, onboarding and profile will show theme-A fields (dark `text-foreground` in a light scheme) on the dark cosmic glass until #63. That is low contrast on the first screen after sign-up.
  - If the kit is copied instead, there are two field components, which the design-system contract forbids.
  - The kit's location in `auth/` hides that it is shared.
- **The plan must choose one of:**
  - (a) migrate the kit and give onboarding/profile a minimal token shell now, i.e. part of #63;
  - (b) migrate the kit and accept or mitigate the interim look on #63's pages;
  - (c) fold onboarding/profile fully into this change.

## Detailed Findings

### Source → views

- **Tokens:** theme A is defined at `src/styles/global.css:12-42` and published at `:45-81`. `@utility bg-cosmic` (`:83-86`) is still used by signin, signup, confirm-email, 500, onboarding and profile.
- **Components:**
  - `ui/input` and `ui/label` are imported by `ScreeningActions.astro:5-6` and `kitchen-sink.astro:12-13`.
  - `ui/alert` is imported by `ScreeningActions.astro:3`, `DoneItem.astro:5`, `dashboard.astro:18` and `kitchen-sink.astro:9`.
  - `ui/card` is imported by `dashboard.astro:19`, `kitchen-sink.astro:11` and `index.astro:4`.
  - None of the auth files imports them. `SubmitButton.tsx:3` imports `ui/button` and overrides its look.
- **Repo field conventions:**
  - The invalid state is `aria-invalid` on `Input` (`ScreeningActions.astro:84-85`).
  - Hints are `text-xs text-muted-foreground` (`ScreeningActions.astro:88,121`).
  - Errors are a `destructive` `Alert` (`ScreeningActions.astro:58-60`).
  - Success is `Alert role="status" className="border-success/40"` (`dashboard.astro:168-170`).
  - No migrated file puts an icon inside an input.

### View → source: contracts that must not change

- **Form actions and field names:**
  - The forms post to `/api/auth/signin` and `/api/auth/signup`.
  - The API reads the `email` and `password` fields (`signin.ts:9-10`, `signup.ts:9-10`). `FormField` sets `name={name ?? id}` (`FormField.tsx:45`).
  - `confirmPassword` is client-side only.
- **Error contract:**
  - Auth endpoints redirect with `?error=<code>`, translated by `authErrorMessageKey` (`src/lib/auth-errors.ts`). This is the CLAUDE.md hard rule.
  - `callback.ts:24-27` sends a failed code exchange to `/auth/signin?confirmed=1` on purpose, because the email is already confirmed.
- **Smoke:** it asserts only status and location for the auth pages: `signin page renders` / `signup page renders` → 200 (`scripts/smoke.mjs:94-95`), and POSTs with `{ email, password }` (`:102-112`). It does not assert on HTML, so markup changes are free.

### 7-state matrix: inputs for the plan

- **default, hover, focus-visible:** apply to the inputs, the password toggle, the links and the submit button.
- **disabled:** the submit button while pending, which needs C3.
- **error:**
  - client field errors (`SignInForm.tsx:21-33`, `SignUpForm.tsx:25-48`);
  - the server error from `?error=` (`signin.astro:9-10`).
- **empty:** N/A. This is a form, with nothing to list.
- **loading:** the pending submit, which needs C3.
- **Kitchen sink:** it renders no `client:` island today (`kitchen-sink.astro`). React components can be rendered statically there with props such as `error` and `serverError`. A pending state rendered there needs a prop, not only internal state.

### Scope candidates

- **`confirm-email.astro`:** this is the screen right after sign-up (`signup.ts:28`). It shares the shell and adds C4's copy switch. Its 7 hits are all in the shell.
- **`500.astro`:** a standalone error page with the same glass shell (10 hits). It links to retry (`retry = pathname + search`) and to `/`, and uses `errorPage.*` keys only. #62 also mentions a new `404.astro`. There is none today, and smoke expects a plain 404 for unknown paths (`scripts/smoke.mjs:96`).

## Code References

- `src/pages/auth/signin.astro:9-33`: the shell, the confirmation note, the server error and the island
- `src/pages/auth/signup.astro:9-27`: the shell and the island
- `src/pages/auth/confirm-email.astro:6-35`: the DEV copy switch, the emojis and the shell
- `src/components/auth/FormField.tsx:5-71`: the hand-built field (label, icon, input, error and hint)
- `src/components/auth/SubmitButton.tsx:11-33`: `useFormStatus` pending and the palette override
- `src/components/auth/ServerError.tsx:7-15`: a hand-built destructive alert
- `src/components/auth/PasswordToggle.tsx:10-21`: the eye toggle with `aria-label`
- `src/components/auth/SignInForm.tsx:21-90`, `SignUpForm.tsx:25-137`: validation and form markup
- `src/components/profile/ProfileForm.tsx:3-5,130`: imports the kit and posts to `/api/profile`
- `src/components/ui/{input,label,alert,card,button}.tsx`: the components to use
- `src/middleware.ts:5-13`: `PROTECTED_ROUTES`, which has no auth-page redirect
- `src/pages/api/auth/{signin,signup,callback}.ts`: field names and redirect targets
- `node_modules/react-dom/cjs/react-dom-client.development.js:20725-20790`: pending only for function actions

## Architecture Insights

- **Forms differ by page.** The auth and profile forms are React islands with client validation that post natively. The dashboard's forms are plain Astro forms. So the pending UX can be island state here, without changing the server contract.
- **Kit location.** A shared form kit would sit naturally outside `auth/`, for example `src/components/forms/`. Moving it is cheap: it has 3 importers plus `PasswordToggle`'s 2.
- **Icons inside inputs.** The icon-in-input design (`FormField.tsx:42`, with padding `pl-10`) has no counterpart in theme A's migrated views. Keeping or dropping it is a visual choice for the plan.

## Historical Context (from prior changes)

- `context/archive/2026-09-30-ui-refactor/plan.md:59` lists auth (sign-in, sign-up, confirm-email), 500/404, onboarding and profile as follow-ups, with `bg-cosmic` removed by the last one. This still holds.
- `context/archive/2026-09-30-ui-refactor/research.md:42` notes that `SubmitButton` overrides `bg-primary` with `bg-purple-600`. This still holds (`SubmitButton.tsx:18`).
- `context/archive/2026-09-30-ui-refactor/research.md:154-155` counts 10 hits each for `signin.astro` and `500.astro`, and 9 for `FormField.tsx`. These match today's scan.
- **GitHub #62** asks for:
  - `signin`, `signup` and `confirm-email` (it notes the emojis), `500.astro` and a new `404.astro` on theme A;
  - `FormField` → `Input`/`Label`, `ServerError` → `Alert`, and dropping the `SubmitButton` override;
  - the 7-state matrix in the kitchen sink, and the files added to `ui-check.mjs`.
- `context/changes/continue-ui-redesign/plan.md` (landing, implemented) set the link-button pattern (`buttonVariants` on `<a>`), the screenshot gate and the signed-in redirect on `/`.

## Related Research

- `context/changes/continue-ui-redesign/research.md`: the landing audit this change continues
- `context/archive/2026-09-30-ui-refactor/research.md`: the dashboard audit and the theme A decision

## Open Questions

1. **C5 scope (product decision):** migrate the shared kit and give onboarding/profile a minimal token shell now, accept the interim look until #63, or fold #63 in?
2. **`confirm-email` and `500`:** do they ride along? `confirm-email` is the next screen after sign-up and carries C4. `500` is standalone, and #62 also wants a new `404`.
3. **Signed-in visitor at `/auth/signin` and `/auth/signup`:** redirect to `/dashboard` as `/` does, or leave the pages reachable?
4. **`confirm-email` copy:** what should replace the DEV switch? Options: always the neutral "check your email" copy, a server-known setting, or a signed-in check. The last one relies on an unverified expectation: with confirmations off, Supabase `signUp` returns a session and the SSR client stores it, so the user arrives at `/auth/confirm-email` signed in. `signup.ts:18-28` does not read the session, so check this before planning on it.
5. **Field icons:** keep the icons inside the inputs, or follow the migrated views, which have none?
