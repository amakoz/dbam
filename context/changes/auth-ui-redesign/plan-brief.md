# Auth, onboarding, profile and error pages on the design system — Plan Brief

> Full plan: `context/changes/auth-ui-redesign/plan.md`
> Research: `context/changes/auth-ui-redesign/research.md`

## What & Why

After the landing moved to theme A, every other screen outside the dashboard still uses the dark purple "cosmic" look: sign-in, sign-up, confirm-email, onboarding, profile and 500. A new user crosses three themes in their first minute.

The audit also found behaviour bugs hiding behind the styling:

- The submit button's loading state can never fire, so a second press posts again.
- Signed-in users can open the sign-in and sign-up forms.
- Confirm-email picks its message by build mode, so it can be wrong in either direction.

This change closes #62 and #63 in one pass and retires `bg-cosmic`.

## Starting Point

Theme A tokens (`src/styles/global.css`) and the shadcn components (`src/components/ui`: button, card, badge, alert, input, label) already cover the dashboard and the landing. The remaining pages use none of them, apart from an overridden `ui/button`. The form kit lives in `src/components/auth/` but also renders the profile form.

## Desired End State

Every page is theme A in the system scheme, with one `<main>`, visible focus rings and no `bg-cosmic`.

- **Forms:** fields are `ui/label` + `ui/input` with errors under them, and server errors are a destructive `Alert`. A valid submit disables the button and shows "signing in…" until the next page.
- **Signed-in users:** they never see auth forms. Confirmation-free sign-ups go straight on to onboarding.
- **Profile:** it carries the app header. Onboarding has a slim header.
- **404 and 500:** they look like the product.
- **Guard:** `ui:check` covers every view file.

## Key Decisions Made

| Decision                                | Choice                                                                                                        | Why (1 sentence)                                                                                                     | Source              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Kit vs onboarding/profile (C5)          | Fold #63 into this change                                                                                     | One consistent flow from landing to dashboard; no interim dark-on-dark                                               | Plan (user)         |
| Extra pages                             | Confirm-email, 500 and a new 404                                                                              | Closes #62 completely                                                                                                | Plan (user)         |
| Signed-in at `/auth/signin`, `/signup`  | Redirect to `/dashboard`                                                                                      | Same as `/`; no auth form for someone already in                                                                     | Plan (user)         |
| Confirm-email                           | Signed in → `/dashboard`; signed out → "check your email"                                                     | Correct in every confirmation setting; verified that sign-up signs in when confirmations are off                     | Plan (user) + probe |
| Headers                                 | `AppHeader` on profile; slim `PublicHeader` (wordmark + sign-out) on onboarding                               | Profile joins the app; onboarding stays a focused gated step                                                         | Plan (user)         |
| Field icons                             | Dropped (password eye toggle stays)                                                                           | Matches the migrated views and theme A's calm look                                                                   | Plan (user)         |
| Pending state                           | `SubmitButton pending` prop, set after valid submit, reset on bfcache restore                                 | `useFormStatus` never fires for URL actions                                                                          | Research + Plan     |
| Kit location                            | `src/components/forms/`                                                                                       | It serves auth and profile, not only auth                                                                            | Plan                |
| Checkboxes and radios                   | Native inputs with tokens, no shadcn Radix controls                                                           | Consent, withdraw and reminders are plain Astro forms that would not hydrate Radix                                   | Plan                |
| New tokens                              | None                                                                                                          | All values exist                                                                                                     | Research            |
| Password strength (added after Phase 7) | ≥ 12 characters with a letter and a digit; checked in `signup.ts` and by Supabase; live rule list in the form | Length is what resists guessing; one shared rule (`src/lib/password.ts`) keeps client, endpoint and Supabase in step | Plan (user)         |

## Scope

**In scope:**

- The form kit (FormField, ChoiceGroup, PasswordToggle, SubmitButton, ServerError).
- Sign-in, sign-up, confirm-email, onboarding, profile, `ProfileForm`, `RemindersForm`, `WithdrawConsentForm`, 500 and a new 404.
- `PublicHeader`, a kitchen-sink forms block, screenshots, deleting `bg-cosmic`, and extending `ui:check` and lint-staged.
- README and `CLAUDE.md` lines.

**Out of scope:**

- No API, field-name, error-contract, middleware-list or `signup.ts` changes.
- No new tokens, no shadcn Checkbox or RadioGroup, no pending state for plain Astro forms.
- No dashboard tier rows (#67).

## Architecture / Approach

Static Astro pages render React `ui/*` server-side. Islands (sign-in, sign-up, profile form) keep `client:load`.

- **Kit first:** the shared kit moves before any page, then each page group follows, then the error pages, then the gate. `bg-cosmic` is deleted last, once nothing uses it.
- **Smoke stays green throughout:** the HTML markers smoke reads (`name="version" value=`, `data-reminders`, `action="/api/consent/withdraw"`) and all field names are preserved, and smoke runs after every phase.

## Phases at a Glance

| Phase                                 | What it delivers                                                                | Key risk                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Shared form kit                    | Kit in `forms/` on `ui/*`, real pending state                                   | Pending stuck after Back (bfcache): reset on `pageshow`      |
| 2. Auth pages                         | `PublicHeader`, theme-A sign-in, sign-up and confirm-email; signed-in redirects | Landing header must stay visually identical                  |
| 3. Onboarding                         | Consent and profile steps, `ChoiceGroup`, withdraw on tokens                    | Smoke's `version` and withdraw markers                       |
| 4. Profile                            | `AppHeader`, three cards, reminders badge and buttons                           | `data-reminders` marker; `#reminders` anchor                 |
| 5. Error pages                        | Theme-A 500, new 404                                                            | 404 status kept for unknown routes and the prod kitchen sink |
| 6. States and visual gate             | Kitchen-sink forms block, 7-state matrix, screenshots                           | Destructive contrast in dark                                 |
| 7. Retire `bg-cosmic`, guard and docs | Utility deleted, `ui:check` covers all views                                    | A missed palette class fails the guard (intended)            |
| 8. Strong passwords                   | Policy in `src/lib/password.ts`, endpoint check, live hints, smoke step         | Production Supabase dashboard must be set by the owner       |

**Prerequisites:** the local Supabase `dbam` stack is running and the dev server is on :4322 (both are up).
**Estimated effort:** ~2–3 sessions across 7 phases.

## Open Risks & Assumptions

- Onboarding and profile look mixed between Phases 1 and 3 (branch only, not deployed).
- The destructive button's dark-mode contrast (`dark:bg-destructive/60` with white text) needs the Phase 6 check.
- One PR now closes #61, #62 and #63, which makes it a large review. The screenshots in both change folders carry the visual evidence.

## Success Criteria (Summary)

- The flow landing → sign-up → onboarding → dashboard → profile is visually one product in light and dark, on desktop and mobile.
- Pressing submit gives immediate feedback and can't double-post; signed-in users never see auth forms; unknown URLs get a themed 404.
- No `bg-cosmic`, glass or palette class is left, and `ui:check` fails on any new one.
