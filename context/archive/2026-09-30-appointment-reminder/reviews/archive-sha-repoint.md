# Archive SHA repoint — appointment-reminder

## 2026-10-05

- **Target:** `origin/main` (remote default branch per `git ls-remote --symref origin HEAD`), snapshot `f65e73c6d3372bfcfb999360c699da7fa6aa4caf`
- **Integration commit:** `d85fe1406dde692c5c010f5815c0ce7e95e62794` — "Appointment reminder: opt-in email before a recorded appointment (S-04) (#66)"
- **PR:** https://github.com/amakoz/dbam/pull/66 (merged 2026-10-01, base `main`, squash merge)
- **Evidence:**
  - All four old SHAs are in PR #66's commit list (`a8a98f3`, `23beafe`, `289347c`, `dca7fbe`, then `05b9dca`, `1a0846a`, `b86c7e3`, `4292296`).
  - None of them is an ancestor of the target (`git merge-base --is-ancestor` exit 1; the repository is not shallow).
  - `d85fe14` is an ancestor of the target (exit 0).
  - Its tree is identical to the PR head `4292296` (`git diff --quiet 4292296 d85fe14`), so the squash commit integrates the full implementation the rows cover.
- **Decision:** the owner chose "Update and archive", after checking `main` for changes made while the PR waited (`f65e73c`, the ui-refactor close-out, which does not touch S-04).

| Row ID | Old suffix (resolved OID)                            | New SHA   |
| ------ | ---------------------------------------------------- | --------- |
| 1.1    | `a8a98f3` (a8a98f3c9999ae88573e166cc297660508d9d023) | `d85fe14` |
| 1.2    | `a8a98f3` (a8a98f3c9999ae88573e166cc297660508d9d023) | `d85fe14` |
| 1.3    | `a8a98f3` (a8a98f3c9999ae88573e166cc297660508d9d023) | `d85fe14` |
| 1.4    | `a8a98f3` (a8a98f3c9999ae88573e166cc297660508d9d023) | `d85fe14` |
| 2.1    | `23beafe` (23beafe11c8b3df0f22636087b0b8faa9dce240f) | `d85fe14` |
| 2.2    | `23beafe` (23beafe11c8b3df0f22636087b0b8faa9dce240f) | `d85fe14` |
| 2.3    | `23beafe` (23beafe11c8b3df0f22636087b0b8faa9dce240f) | `d85fe14` |
| 2.4    | `23beafe` (23beafe11c8b3df0f22636087b0b8faa9dce240f) | `d85fe14` |
| 2.5    | `23beafe` (23beafe11c8b3df0f22636087b0b8faa9dce240f) | `d85fe14` |
| 3.1    | `289347c` (289347c81419e95c8eb002268d81338945ea4dd2) | `d85fe14` |
| 3.2    | `289347c` (289347c81419e95c8eb002268d81338945ea4dd2) | `d85fe14` |
| 3.3    | `289347c` (289347c81419e95c8eb002268d81338945ea4dd2) | `d85fe14` |
| 3.4    | `289347c` (289347c81419e95c8eb002268d81338945ea4dd2) | `d85fe14` |
| 3.5    | `289347c` (289347c81419e95c8eb002268d81338945ea4dd2) | `d85fe14` |
| 3.6    | `289347c` (289347c81419e95c8eb002268d81338945ea4dd2) | `d85fe14` |
| 4.1    | `dca7fbe` (dca7fbe5e948996e59b730ce68df3e740bee40e0) | `d85fe14` |

**Rows repointed:** 16. Manual rows without a SHA suffix (1.5, 2.6, 2.7, 3.7, 3.8, 4.2–4.5) are unchanged.
