---
change_id: auth-ui-redesign
title: Sign-up and sign-in on the design system
status: archived
created: 2026-10-05
updated: 2026-10-05
archived_at: 2026-10-05T17:13:51Z
---

## Notes

- **Continuation** of the `/10x-ui` audit started in `context/changes/continue-ui-redesign/` (landing `/`, implemented on `feat/continue-ui-redesign`, not yet pushed). Same branch and PR (owner decision, 2026-10-05).
- **Tracking:** #62 (auth pages + 500/404).
- **View (one):** sign-up and sign-in, which share one form kit: `src/pages/auth/{signup,signin}.astro` → `src/components/auth/{SignUpForm,SignInForm,FormField,PasswordToggle,SubmitButton,ServerError}.tsx`. `confirm-email.astro` (the screen right after sign-up) and `500.astro` are audit candidates; research decides whether they ride along or are deferred.
- **Token source / variant:** existing design system. Theme A "Len i szałwia" in `src/styles/global.css`, components in `src/components/ui` (button, card, badge, alert, input, label). Extend it. No second palette, no `shadcn init`.
- **Out of scope:** removing `@utility bg-cosmic` (onboarding/profile #63 still use it), dashboard tier rows #67.
- **Pre-audit (2026-10-05):** hardcoded-value scan: `signin.astro` 10, `signup.astro` 7, `FormField.tsx` 9, `SubmitButton.tsx` 4, `ServerError.tsx` 3, `PasswordToggle.tsx` 2, `SignUpForm.tsx` 1, `SignInForm.tsx` 0 (36 across the view), plus `confirm-email.astro` 7 and `500.astro` 10. Repo components used: only `ui/button` (in `SubmitButton`, overridden by palette classes); `ui/input`, `ui/label`, `ui/card`, `ui/alert` exist but are unused here.
