---
change_id: screening-catalog-v1
title: Screening catalog v1
status: impl_reviewed
created: 2026-09-28
updated: 2026-09-28
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-28 (owner decision): the owner has a claude.ai subscription and no Claude API credits. So Progress 3.3, the live `npm run catalog:draft -- --max 2 --dry-run`, stays pending until an API key is available. The Phase 3 code passed its automated checks, but the drafter has not run against the live API.
- 2026-09-28 (owner decision): Phase 4 entries are drafted inside a Claude Code session, not by `npm run catalog:draft`. The session follows `scripts/catalog/draft-prompt.md`, uses web search/fetch for sources, writes `catalog/entries/<slug>.json` as `draft` and validates with `npm run catalog:check`. Owner review and activation, snapshot generation and the pgTAP checks are unchanged.
