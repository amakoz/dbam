# Archive SHA repoint: onboarding-profile

## 2026-09-28

- **Target**: `origin` / `main` (from the implementation PRs' base branch; remote HEAD is `refs/heads/main`), snapshot `a5ad7d5f714ebe943b279b180c33183d77acd272` (freshly fetched).
- **Integration commits**:
  - `670912fadbafa9ddbca026a824981b9b6cf7297b`: "Onboarding profile: translations (PL default) + health-data schema and migration delivery (S-01, phases 1–2) (#30)". https://github.com/amakoz/dbam/pull/30
  - `6f1a98050feb2b7216baf1537e95c5f44dd714e4`: "Onboarding profile: consent + onboarding flow, profile edit and withdrawal (S-01, phases 3–4) (#35)". https://github.com/amakoz/dbam/pull/35
- **Evidence**:
  - Both PRs were squash-merged into `main`, and their remote branches were deleted, so the recorded branch commits are not ancestors of `main` (`git merge-base --is-ancestor` exit 1).
  - PR #30's commit list contains `ad3b864` and `edabdb0`; PR #35's contains `d2b0f43` and `86bfbb4`.
  - Each branch tip (`edabdb0` for #30, `c4d9eeb` for #35) is identical to its squash commit on all code paths (`src`, `supabase`, `scripts`, `.github`, `eslint.config.js`, `package.json`: 0 files differ).
  - Both squash commits are ancestors of the target snapshot.
- **Scope**: the implementation of Phases 1–2 (#30) and Phases 3–4 (#35). The later review fixes (#37, `a5ad7d5`) are not tracked in Progress rows and were not mapped.
- **Decision**: the owner chose "Update and archive" in `/10x-archive`, which also resolves `reviews/impl-review.md` F9.
- **Rows repointed**: 32. Rows already pointing at `670912f`/`6f1a980` (2.6–2.9, 4.8) were unchanged.

| Row  | Old suffix (resolved OID)                              | New SHA   |
| ---- | ------------------------------------------------------ | --------- |
| 1.1  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 1.2  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 1.3  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 1.4  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 1.5  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 1.6  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 1.7  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 1.8  | `ad3b864` (`ad3b86430ae0749fbe8b863eb287ebaa0a8c7950`) | `670912f` |
| 2.1  | `edabdb0` (`edabdb0404a1bcc1a7d93cfc845742a4f1b0773c`) | `670912f` |
| 2.2  | `edabdb0` (`edabdb0404a1bcc1a7d93cfc845742a4f1b0773c`) | `670912f` |
| 2.3  | `edabdb0` (`edabdb0404a1bcc1a7d93cfc845742a4f1b0773c`) | `670912f` |
| 2.4  | `edabdb0` (`edabdb0404a1bcc1a7d93cfc845742a4f1b0773c`) | `670912f` |
| 2.5  | `edabdb0` (`edabdb0404a1bcc1a7d93cfc845742a4f1b0773c`) | `670912f` |
| 3.1  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.2  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.3  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.4  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 3.5  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.6  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.7  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.8  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.9  | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 3.10 | `d2b0f43` (`d2b0f43df43e12be243ca0163d0da1b754ed6152`) | `6f1a980` |
| 4.1  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.2  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.3  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.4  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.9  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.5  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.6  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.7  | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
| 4.10 | `86bfbb4` (`86bfbb4196ee6fe2b05981284a9c4f59edc2ec21`) | `6f1a980` |
