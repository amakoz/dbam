# Archive SHA repoint — auth-ui-redesign

- **Date:** 2026-10-05
- **Target:** `origin/main`, snapshot `55df112dc1e102ac5f1bf1acce0e4169ebde551a`
- **Integration commit:** `ba40c8f` (ba40c8f58ba2e9b7057454fa00a0991840e31bac) — UI redesign: landing, auth, onboarding, profile and error pages on theme A (#69)
- **PR:** https://github.com/amakoz/dbam/pull/69 (merged, base `main`, squash)
- **Evidence:** every listed SHA is in PR #69's commit list and not an ancestor of `origin/main` (`git merge-base --is-ancestor` exit 1, full clone). `ba40c8f^` is the branch's merge base `f65e73c`, and `git diff --quiet ba40c8f c620c14` (branch tip) is empty, so the squash integrates exactly this branch's changes.
- **Decision:** the owner chose "Update and archive" on 2026-10-05.

| Row  | Old suffix (resolved OID)                            | New SHA   |
| ---- | ---------------------------------------------------- | --------- |
| 1.1  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.2  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.3  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.4  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.5  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.6  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.7  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.8  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 1.9  | `071ffff` (071ffffdb847e73773d8c134551dd6d5df8565bc) | `ba40c8f` |
| 2.1  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.2  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.3  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.4  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.5  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.6  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.7  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.8  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.9  | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 2.10 | `3e7f7a3` (3e7f7a3248f5d53025ad59fd8b8c9cc08f34ad84) | `ba40c8f` |
| 3.1  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 3.2  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 3.3  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 3.4  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 3.5  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 3.6  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 3.7  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 3.8  | `417b6a1` (417b6a1cf998ce4269dbd7008aea0171570b5a0f) | `ba40c8f` |
| 4.1  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 4.2  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 4.3  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 4.4  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 4.5  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 4.6  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 4.7  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 4.8  | `971abdb` (971abdb3c4e9b4c6933b52b688961769b67d5643) | `ba40c8f` |
| 5.1  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 5.2  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 5.3  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 5.4  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 5.5  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 5.6  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 5.7  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 5.8  | `86fc8ad` (86fc8ade0be08800743c2fe45eb216c936f427d7) | `ba40c8f` |
| 6.1  | `8cab72a` (8cab72a0c638eef37fdbabc8548a9a124e698758) | `ba40c8f` |
| 6.2  | `8cab72a` (8cab72a0c638eef37fdbabc8548a9a124e698758) | `ba40c8f` |
| 6.3  | `8cab72a` (8cab72a0c638eef37fdbabc8548a9a124e698758) | `ba40c8f` |
| 6.4  | `8cab72a` (8cab72a0c638eef37fdbabc8548a9a124e698758) | `ba40c8f` |
| 6.5  | `8cab72a` (8cab72a0c638eef37fdbabc8548a9a124e698758) | `ba40c8f` |
| 6.6  | `8cab72a` (8cab72a0c638eef37fdbabc8548a9a124e698758) | `ba40c8f` |
| 7.1  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.2  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.3  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.4  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.5  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.6  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.7  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.8  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.9  | `4a5f130` (4a5f1301bbc50febe5f414d72960a28d53caab3d) | `ba40c8f` |
| 7.10 | `58ee70b` (58ee70bd7abcdfd8f1d03ddc7b84d201f4a4ff7a) | `ba40c8f` |
| 8.1  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.2  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.3  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.4  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.5  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.6  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.7  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.8  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.9  | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 8.10 | `9be5681` (9be56813f86a5490f026aa4a3a317dae248dd20a) | `ba40c8f` |
| 9.1  | `4bac509` (4bac5096386382ed4f335e2898b4f1b5047ae7e8) | `ba40c8f` |
| 9.2  | `4bac509` (4bac5096386382ed4f335e2898b4f1b5047ae7e8) | `ba40c8f` |
| 9.3  | `4bac509` (4bac5096386382ed4f335e2898b4f1b5047ae7e8) | `ba40c8f` |
| 9.4  | `4bac509` (4bac5096386382ed4f335e2898b4f1b5047ae7e8) | `ba40c8f` |
| 9.5  | `4bac509` (4bac5096386382ed4f335e2898b4f1b5047ae7e8) | `ba40c8f` |
| 9.6  | `4bac509` (4bac5096386382ed4f335e2898b4f1b5047ae7e8) | `ba40c8f` |
| 9.7  | `4bac509` (4bac5096386382ed4f335e2898b4f1b5047ae7e8) | `ba40c8f` |
| 10.1 | `9a695b0` (9a695b0b64cfe741bae14e154c52ec0e8e742923) | `ba40c8f` |
| 10.2 | `9a695b0` (9a695b0b64cfe741bae14e154c52ec0e8e742923) | `ba40c8f` |
| 10.3 | `9a695b0` (9a695b0b64cfe741bae14e154c52ec0e8e742923) | `ba40c8f` |
| 10.4 | `9a695b0` (9a695b0b64cfe741bae14e154c52ec0e8e742923) | `ba40c8f` |
| 10.5 | `9a695b0` (9a695b0b64cfe741bae14e154c52ec0e8e742923) | `ba40c8f` |
| 10.6 | `9a695b0` (9a695b0b64cfe741bae14e154c52ec0e8e742923) | `ba40c8f` |
| 10.7 | `9a695b0` (9a695b0b64cfe741bae14e154c52ec0e8e742923) | `ba40c8f` |

**Rows repointed:** 83
