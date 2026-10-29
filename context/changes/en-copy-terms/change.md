---
change_id: en-copy-terms
title: English copy says "screening" for catalog items and "exam" for the user's own
status: planned
created: 2026-10-29
updated: 2026-10-29
archived_at: null
---

## Notes

Roadmap S-11 (PRD MS-05, covers backlog B-16): an English-language user reads 'screening' for a catalog item and 'exam' for their own planned or done one, everywhere in the app; Polish copy is unchanged. Risk: copy only, but strings pinned by the wording tests (src/lib/catalog, src/lib/screenings) or asserted by the e2e/smoke suites change with it; update those in the same change. Then /10x-research en-copy-terms. Research: dispatch at most 2 sub-agents, none if the change touches 3 modules or fewer.
