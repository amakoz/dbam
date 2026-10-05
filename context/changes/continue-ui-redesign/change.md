---
change_id: continue-ui-redesign
title: Landing page on the design system, plus starter cleanup
status: implementing
created: 2026-10-05
updated: 2026-10-05
archived_at: null
---

## Notes

- **Tracking:** #61 (landing page + starter branding), a follow-up of the archived `2026-09-30-ui-refactor` (#60).
- **View (one):** `/`, which is `src/pages/index.astro` → `src/components/Welcome.astro` → `src/components/Topbar.astro` (rendered only by Welcome).
- **Token source / variant:** existing design system. Theme A "Len i szałwia" lives in `src/styles/global.css` (`light-dark()` values, published via `@theme inline`), and the components live in `src/components/ui` (button, card, badge, alert, input, label). Extend it. No second palette, no `shadcn init`.
- **Ride-along cleanup (in #61 scope):** the starter leftovers `Banner.astro` and `ui/LibBadge.astro` (both unused), `public/template.png` and the README "10x Astro Starter" header, and the `home.*` starter copy in `src/i18n/{pl,en}.ts`.
- **Out of scope:** `@utility bg-cosmic` stays, because auth, 500, onboarding and profile still use it. It's removed by the last follow-up (#63). Auth/500 is #62, onboarding/profile #63, tier rows #67.
- **Pre-audit (2026-10-05):** hardcoded-value scan: `Welcome.astro` 40, `Topbar.astro` 13, `Banner.astro` 9 (unused), `index.astro` 0. Token classes and `ui/` imports in the view: 0. `CLAUDE.md` already carries the UI rule, and none of its rules invite one-off values.
