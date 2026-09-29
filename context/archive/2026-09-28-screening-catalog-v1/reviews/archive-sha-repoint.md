# Archive SHA repoint

## 2026-09-29

- **Target:** `origin/main`, snapshot `57332329bf4a7be26275ccb58746225c3a4e667e` (freshly fetched; the base branch of PRs #44 and #46)
- **Why:** PRs #44 and #46 were squash-merged, so the feature-branch SHAs recorded in Progress are not in `main` history (`git merge-base --is-ancestor` exit 1, full clone).
- **Integration commits:**
  - `33f1914` — "Screening catalog v1: schema, tooling, drafting script and first batch (F-01) (#44)" — https://github.com/amakoz/dbam/pull/44. The PR commit list contains `d795b32`, `09059ed`, `ae4a0d4` and `5e8b85c`. Its tree matches the PR head `d57a1ef` except `CLAUDE.md`, which came from #39 on the base branch.
  - `5733232` — "Screening catalog v1: record production verification (4.7) (#46)" — https://github.com/amakoz/dbam/pull/46. The PR commit list contains `421ffff`, and its tree is identical to the PR head `6716093`.
- **Decision:** the owner chose "Update and archive" on 2026-09-29.

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1–1.5 | `d795b32` (d795b32819dd3ed0ec1c675d198e927ff2d29c22) | `33f1914` |
| 2.1–2.5 | `09059ed` (09059ed55189cb88101a7558e5cfc1e4bba6c73c) | `33f1914` |
| 3.1–3.2 | `ae4a0d4` (ae4a0d48d1b5954a7d44ad1380a39b12667350d8) | `33f1914` |
| 4.1–4.6 | `5e8b85c` (5e8b85c0ccd97049e63c9c453eb3434961a41f13) | `33f1914` |
| 4.7 | `421ffff` (421ffffaf071c9ae73574570f1613b6b71bfa445) | `5733232` |

**Rows repointed:** 19. Row 3.3 is pending and was left unchanged.
