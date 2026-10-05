# Archive SHA repoint — continue-ui-redesign

- **Date:** 2026-10-05
- **Target:** `origin/main`, snapshot `55df112dc1e102ac5f1bf1acce0e4169ebde551a`
- **Integration commit:** `ba40c8f` (ba40c8f58ba2e9b7057454fa00a0991840e31bac) — UI redesign: landing, auth, onboarding, profile and error pages on theme A (#69)
- **PR:** https://github.com/amakoz/dbam/pull/69 (merged, base `main`, squash)
- **Evidence:** every listed SHA is in PR #69's commit list and not an ancestor of `origin/main` (`git merge-base --is-ancestor` exit 1, full clone). `ba40c8f^` is the branch's merge base `f65e73c`, and `git diff --quiet ba40c8f c620c14` (branch tip) is empty, so the squash integrates exactly this branch's changes.
- **Decision:** the owner chose "Update and archive" on 2026-10-05.

| Row  | Old suffix (resolved OID)                            | New SHA   |
| ---- | ---------------------------------------------------- | --------- |
| 1.1  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 1.2  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 1.3  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 1.4  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 1.5  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 1.6  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 1.7  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 1.8  | `0e22752` (0e22752b1f34ad7fc02d01eb8d1f36a9db0ef009) | `ba40c8f` |
| 2.1  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.2  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.3  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.4  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.5  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.6  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.7  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.8  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 2.9  | `8c27883` (8c27883a31ea620efcd6b1bccc9b750121a5f684) | `ba40c8f` |
| 3.1  | `22a77ce` (22a77ce44bdad7b22d5d75fea95ac3f6b2b47fbd) | `ba40c8f` |
| 3.2  | `22a77ce` (22a77ce44bdad7b22d5d75fea95ac3f6b2b47fbd) | `ba40c8f` |
| 3.3  | `22a77ce` (22a77ce44bdad7b22d5d75fea95ac3f6b2b47fbd) | `ba40c8f` |
| 3.4  | `22a77ce` (22a77ce44bdad7b22d5d75fea95ac3f6b2b47fbd) | `ba40c8f` |
| 3.5  | `22a77ce` (22a77ce44bdad7b22d5d75fea95ac3f6b2b47fbd) | `ba40c8f` |
| 4.1  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.2  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.3  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.4  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.5  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.6  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.7  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.8  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.9  | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |
| 4.10 | `2f7f279` (2f7f2794539f3b444d1e19754759701746023429) | `ba40c8f` |

**Rows repointed:** 32
