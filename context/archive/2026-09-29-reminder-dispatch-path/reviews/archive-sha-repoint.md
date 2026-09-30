# Archive SHA repoint: reminder-dispatch-path

## 2026-09-30

- **Target**: `origin/main` (base branch of PR #48 and PR #52), snapshot `97e8aa9648ed5e57acd428d8d75d8aa833babd3f`. Fetched fresh; the repository is not shallow.
- **Integration commit**: `792156e723a3280b799aafcdcf56dfa938614938`, "Reminder dispatch path: cron heartbeat email on Workers (F-02) (#48)", the squash merge of https://github.com/amakoz/dbam/pull/48.
- **Evidence**:
  - PR #48's commit list is `e912b29 ced6da1 ed48804 64f0a2c a212319`.
  - `git diff a212319 792156e` is empty: the squash tree equals the PR head.
  - There is no diff between `ced6da1` and `792156e` in `src/worker.ts`, `src/lib/email.ts`, `src/lib/heartbeat.ts`, `wrangler.jsonc` and `astro.config.mjs`.
  - There is no diff between `ed48804` and `792156e` in `.github/workflows/ci.yml`.
  - `ced6da1` and `ed48804` are not ancestors of the target (`merge-base --is-ancestor` exit 1). `97e8aa9` (PR #52) already is, so it is left unchanged.
- **Decision**: user chose "Update and archive" on 2026-09-30.

| Row ID | Old suffix (resolved OID) | New SHA |
| --- | --- | --- |
| 1.1–1.11 (11 rows) | `ced6da1` (`ced6da16497a451315e7889a5baa11519dad4cc9`) | `792156e` |
| 2.1–2.3 (3 rows) | `ed48804` (`ed48804d43e84f6e7df48e9bdbefb117864711e3`) | `792156e` |

**Affected rows: 14.**
