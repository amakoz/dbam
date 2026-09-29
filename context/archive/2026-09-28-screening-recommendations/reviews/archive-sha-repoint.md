# Archive SHA repoint

## 2026-09-29

- **Target:** `origin/main`, snapshot `ed1c0520c00350fb3116e9a2414032e25387cf18`, freshly fetched. It's the base branch of PR #50.
- **Why:** PR #50 was squash-merged, so the feature-branch SHAs recorded in Progress are not in `main` history (`git merge-base --is-ancestor` exit 1, full clone).
- **Integration commit:** `ed1c052`, "Screening recommendations: tiered dashboard list, may-apply section and owner review gate (S-02) (#50)", https://github.com/amakoz/dbam/pull/50.
  - The PR commit list contains `b488b11`, `4fc4e3e`, `ac9a280`, `63f3977`, `b1cbcf0` and `01f8496`.
  - The squash tree is identical to the PR head `01f8496`.
- **Decision:** the owner chose "Update and archive" on 2026-09-29.

| Row ID | Old suffix | New SHA |
| --- | --- | --- |
| 1.1–1.7 | `b488b11` | `ed1c052` |
| 2.1–2.8 | `4fc4e3e` | `ed1c052` |
| 3.1–3.6 | `ac9a280` | `ed1c052` |
| 4.1–4.3 | `63f3977` | `ed1c052` |

**Rows repointed:** 24. Row 1.8 already pointed at `ed1c052` and was left unchanged.
