---
change_id: dashboard-tier-polish
title: Dashboard tier rows polish
status: active
created: 2026-10-05
updated: 2026-10-05
---

## Notes

Follow-up to ui-refactor (#60), tracked in #67: the owner accepted the dashboard tier rows as "still not clean enough".

- **View:** `/dashboard`, tier sections only — `src/components/recommendations/RecommendationItem.astro`, `TierBadge.astro`, the tier section cards (`TIER_STYLES`, was in `src/pages/dashboard.astro`), and the matching cells in `src/pages/dev/kitchen-sink.astro`.
- **Token source:** `src/styles/global.css` (theme A "Len i szałwia"). Components: `src/components/ui`. No new tokens.
- **Contract variant:** existing design system — extend, don't fork. All touched files are already in `scripts/ui-check.mjs`.
- **Lightweight /10x-ui run:** charges → fixes in this file, no separate research/plan (small, single-view polish).

## Charges

Audited from `/dashboard` (fixture: woman born 1970, 12 tier rows) and `/dev/kitchen-sink`, both schemes, 1440px and 390px.

1. **Redundant tier badge** — `src/components/recommendations/RecommendationItem.astro:48`. Every row in a tier section repeats the section heading as a pill ("Ważne" under "Ważne – umów się teraz"), 12 times on the fixture dashboard; the pill also jumps between the right edge and its own line depending on the exam name's length, so rows have no stable shape. _User impact:_ more to read, no new information, ragged rows.
   **Fix:** drop `TierBadge` from tier rows (the section heading carries the tier). Keep it in "Your plans" (`PlanItem.astro:44`), where the row has no tier heading around it.
2. **Every access fact as a pill** — `RecommendationItem.astro:55-78`. Each row shows two pills (NFZ, referral) and on the fixture 11 of 12 rows show the same pair ("Bezpłatne w NFZ", "Bez skierowania"); the one row that needs a referral looks the same at a glance. _User impact:_ the signal the user has to act on (needs a referral / pays out of pocket) is lost in repeated chrome.
   **Fix:** one quiet meta line with icons (interval · NFZ · referral) in `text-muted-foreground`; the actionable exceptions ("Wymaga skierowania", "Poza NFZ") use `text-foreground font-medium`, NFZ-funded keeps a `text-success` icon. Icon + text, never colour alone.
3. **Unbalanced tier cards, inlined in the page** — `src/pages/dashboard.astro:84-93` (`TIER_STYLES`). Tier 1 has a 2px `tier-1-solid` border plus a header band; tiers 2/3 are plain cards that look like "Twój profil". The section card markup lives only in the page, so the kitchen sink shows tier rows in a headerless card (`src/pages/dev/kitchen-sink.astro:338-349`) and can't render the real section. _User impact:_ tier 1 shouts while tiers 2/3 don't read as a ranked sequence; reviewers can't see the real section in the visual gate.
   **Fix:** extract `src/components/recommendations/TierSection.astro` (card + heading + rows slot) used by both the dashboard and the kitchen sink. Every tier gets the same header band on its own tier token (`bg-tier-N` / `text-tier-N-foreground`); only tier 1 adds a 1px `border-tier-1-solid` border, so it stays first in weight without the 2px frame.
4. **Save highlight borrows a tier token** — `src/components/recommendations/saved.ts:13` (`bg-tier-2`). The "saved" success row is tinted with the tier 2 surface, so it looks like tier styling (and inside the new tier 2 band context it would read as part of the section); any tier-2 restyle silently changes save feedback. _User impact:_ "just saved" is not distinguishable from "worth planning".
   **Fix:** `bg-success/10 ring-2 ring-success` — the same success token family as the success badge and the saved alert.

## Deferred

- The two stacked disclosures per row ("Zaplanuj lub oznacz jako wykonane", "Szczegóły") stay on separate lines: side by side, an opened `<details>` would push its sibling around in a ~400px column. Revisit if the panel becomes a dialog.

## Visual gate

Saved in `screenshots/` (1440px unless noted, Playwright Chromium against `astro dev --port 4323`, fixture: woman born 1970, former smoker): `before-*` / `after-*` for `/dashboard` light, dark and 390px, the kitchen-sink scheme columns before, and the kitchen-sink tier sections and saved plan row after. The full dashboard page got shorter (2932px → 2666px tall at 1440px) with the same 12 rows.

## Verification

`npm run lint`, `npm run ui:check` (34 files, no hardcoded values), `npx astro check` (0 errors), `npm run build`, and `npm run smoke` against the local dev server — all green.
