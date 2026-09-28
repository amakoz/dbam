<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Onboarding Profile

- **Plan**: context/changes/onboarding-profile/plan.md
- **Scope**: Phase 1 of 4
- **Reviewed phases**: 1
- **Date**: 2026-09-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence:

- **Commit**: `ad3b864`.
- **Plan adherence**: all 5 planned items MATCH, and all 10 error codes plus `unknown` exist in both PL and EN. No hard-coded English strings remain.
- **Scope**: no "What We're NOT Doing" boundary was crossed.
- **Automated criteria** (re-run 2026-09-27): lint, `astro check` (0 errors), build and full local smoke (11/11) all PASS.
- **Manual rows 1.5–1.8**: the user confirmed them explicitly before the commit.

## Findings

### F1 — Open-redirect guard in /api/locale bypassed with a tab character

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/locale.ts:7-12
- **Detail**:
  - `safeNext` checks string prefixes only (`/`, not `//`, not `/\`).
  - `next=/<TAB>/evil.com` is reproduced as `Location: /\t/evil.com`. Browsers strip tabs, so `new URL("/\t/evil.com", base)` resolves to `http://evil.com/`.
  - Astro's `checkOrigin` blocks cross-site POSTs (a foreign Origin, no Origin, or `Origin: null` all get 403), so it isn't exploitable today. It becomes one if the helper is reused for a GET `?next=` flow, or if `checkOrigin` is ever turned off.
  - A `next` containing CR/LF also gives a 500, from the invalid Location header.
- **Fix**: resolve with `new URL(next, context.url)` and require `url.origin === context.url.origin`, then redirect to `url.pathname + url.search + url.hash`. Otherwise redirect to `/`.
- **Decision**: FIXED — origin-checked URL parsing in `safeNext` (src/pages/api/locale.ts)

### F2 — Common Supabase auth errors fall back to the generic message

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/i18n/pl.ts:84-95, src/i18n/en.ts:84-94
- **Detail**:
  - Before this change, users saw Supabase's raw (English) reason.
  - Now these frequent codes show "Coś poszło nie tak": `email_address_invalid`, `email_exists`, `signup_disabled`, `email_address_not_authorized`.
  - `email_address_not_authorized` is the default-SMTP restriction every non-team sign-up hits until custom SMTP lands.
  - This is a gap in the plan's code list, not drift.
- **Fix**: add PL/EN `errors.auth.*` keys for those four codes.
- **Decision**: FIXED — PL/EN keys added for email_address_invalid, email_exists, signup_disabled, email_address_not_authorized

### F3 — Error-message helper is auth-scoped; Phase 3 needs non-auth codes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/auth-errors.ts:12-15; plan.md Phase 3 §1 (`parseProfileForm` error type)
- **Detail**:
  - `authErrorMessageKey` hard-codes the `errors.auth.` prefix and falls back to `errors.auth.unknown`.
  - Phases 3–4 redirect with `consent_required`, `invalid_profile`, `save_failed`, `withdraw_confirm_required` and `withdraw_failed`, and `/onboarding` receives codes from two endpoints.
  - Separately, the plan types `parseProfileForm` field errors as `string /* message key */`. `MessageKey` would let typos fail `astro check`.
- **Fix A ⭐ Recommended**: note it as an addendum in the plan's Phase 3 section: add `errorMessageKey(code)` over a shared `errors.<code>` namespace with `errors.unknown`, keep the auth helpers as thin wrappers, and type field errors as `MessageKey`.
  - Strength: keeps Phase 1 untouched and puts the design where the new codes arrive.
  - Tradeoff: the plan changes after review.
  - Confidence: HIGH — flat dictionary plus `isMessageKey` makes the generalization a few lines.
  - Blind spot: none significant.
- **Fix B**: generalize the helper now, in a Phase 1 follow-up commit.
  - Strength: Phase 3 starts from a finished API.
  - Tradeoff: adds Phase 1 churn for codes that don't exist yet, and the namespace choice gets made without the real call sites.
  - Confidence: MED — the right shape is clearer once the endpoints exist.
  - Blind spot: the exact code set for Phases 3–4 may shift during implementation.
- **Decision**: FIXED via Fix A — addendum in plan.md Phase 3 §1; queued in follow-ups/review-fixes.md

### F4 — Polish copy nits

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/i18n/pl.ts:85, src/i18n/pl.ts:92 (and en.ts:85)
- **Detail**:
  - `errors.auth.not_configured` says "Logowanie jest chwilowo niedostępne…", but sign-up and the callback show it too, and "chwilowo" (temporarily) misdescribes a missing configuration.
  - `errors.auth.weak_password` "Wybierz dłuższe lub trudniejsze do odgadnięcia." is missing the noun "hasło".
- **Fix**: reword to a neutral "Uwierzytelnianie jest niedostępne: brak konfiguracji Supabase." (and the EN equivalent), and append "hasło" to the weak-password message.
- **Decision**: FIXED differently — weak_password gets the noun "hasło" now; per user, the Supabase config banner must not be user-visible: its removal (plus /api/health for smoke and the deploy check, and a not_configured text that doesn't name Supabase) was added to plan.md Phase 4 §4, rows 4.9/4.10

### F5 — /api/locale overwrites the cookie to `pl` on a missing or invalid `lang`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/locale.ts:17-19
- **Detail**: an empty or garbage POST returns `set-cookie: lang=pl`, silently replacing an existing `en` preference. Only hand-crafted requests can trigger it; the switcher always sends a valid `lang`.
- **Fix**: call `cookies.set` only when `isLocale(lang)`.
- **Decision**: FIXED — cookie set only when isLocale(lang)

### F6 — `class:list` vs the CLAUDE.md `cn()` rule

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/LanguageSwitcher.astro:25-28
- **Detail**:
  - CLAUDE.md says conditional Tailwind classes go through `cn()`.
  - The switcher uses Astro `class:list`, following `Banner.astro:11`, because `class={cn(...)}` triggers `astro/prefer-class-list-directive`.
  - The code and the lint config agree; only the docs disagree.
- **Fix**: reword the CLAUDE.md rule to say "`cn()` in React/TS, `class:list` in `.astro` files".
- **Decision**: FIXED — CLAUDE.md Coding Style rule now allows class:list in .astro files

### F7 — `createT` has no guard against an undefined locale

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/i18n/index.ts:40-44
- **Detail**: if a page is ever prerendered or rendered without the middleware, `Astro.locals.locale` is undefined and `t()` throws. Nothing is prerendered today (`output: "server"`).
- **Fix**: use `dictionaries[resolveLocale(locale)]` inside `createT`.
- **Decision**: FIXED — createT re-resolves the locale
