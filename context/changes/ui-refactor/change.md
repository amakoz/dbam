---
change_id: ui-refactor
title: Ui refactor
status: implementing
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

Replace the starter-template look with a new, clean visual identity (user request, 2026-09-30).

- **Scope (user decision):** global tokens + one view, `/dashboard` (`src/pages/dashboard.astro` and the components it renders). Other pages (landing, auth, onboarding, profile) inherit the tokens and get their own follow-up changes. This follows the `/10x-ui` one-view rule.
- **Token source:** `src/styles/global.css` (`:root` / `.dark`, published via `@theme inline`). Components: `src/components/ui` (shadcn new-york, extended with `npx shadcn add`).
- **Contract variant:** fresh starter with a mostly unused token file. The pre-audit found only `button.tsx` in `src/components/ui`, and 93 hardcoded-value hits across the dashboard, layout and feature components.
- **Visual direction (user decision, 2026-09-30):** theme A "Len i szałwia" (linen and sage; `directions.md` §A).
- **Tracking:** #60 (this change). Follow-ups: #61 landing page + starter branding; #62 auth pages + 500/404; #63 onboarding + profile, which also retires `bg-cosmic`.
- **Tier row styling (user, 2026-09-30):** Phase 3 check 3.10 accepted, but tier rows are "still not clean enough". Polish them in Phase 4 (visual gate) or a follow-up.
