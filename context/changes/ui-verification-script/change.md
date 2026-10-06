---
change_id: ui-verification-script
title: Playwright screenshot script for agent UI verification (F-05)
status: implemented
created: 2026-10-06
updated: 2026-10-06
archived_at: null
---

## Notes

(foundation) npm run ui:shots (Playwright, run as a script, not an MCP server) signs in a seeded fixture user against BASE_URL, and screenshots the dashboard, onboarding, profile and kitchen sink in light and dark at 1440px and 390px into a gitignored folder. Agents use it in /10x-implement manual-verification gates and attach the paths to PRs. Roadmap F-05; PRD refs: NFR (testing). Risk: local Supabase only (refuse a non-local BASE_URL, like scripts/smoke.mjs); Playwright browsers must stay out of the production build and the Worker bundle.
