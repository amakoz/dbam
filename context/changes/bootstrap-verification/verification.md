---
bootstrapped_at: 2026-09-23T16:40:42Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: dbam
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: dbam
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: true
```

### Why this stack

Dbam is a solo, after-hours web-app MVP with a 3-week timeline, needing accounts, a
profile-driven recommendation engine, and scheduled reminders — exactly the shape
the `(web, js)` recommended default targets. 10x Astro Starter clears all four
agent-friendly gates and bundles auth + PostgreSQL + TypeScript + edge deploy out of
the box, so the account/profile/recommendation loop (FR-001–004) needs no extra
wiring. Its one known gap is scheduled work: the Cloudflare edge runtime doesn't
support long-running background tasks natively, and the PRD's reminder/recurrence
logic (FR-007, FR-009, FR-011, FR-012) depends on scheduled triggers — this was
flagged during selection and the user chose to add it manually (Cloudflare Cron
Triggers or an external queue such as Upstash QStash/Inngest) rather than switch
starters. Deployment stays on the starter's own default (Cloudflare Pages); CI runs
on GitHub Actions with auto-deploy-on-merge, matching a solo/short-timeline profile.

## Pre-scaffold verification

| Signal             | Value                              | Severity | Notes                              |
| ------------------- | ----------------------------------- | -------- | ----------------------------------- |
| npm package        | not run                            | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to resolve |
| GitHub repo        | not run                            | n/a      | `gh` CLI not found in this environment; recency check unavailable |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22 top-level entries (`.env.example`, `.github`, `.gitignore`, `.husky`, `.nvmrc`, `.prettierrc.json`, `.vscode`, `AGENTS.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules`, `package-lock.json`, `package.json`, `public`, `README.md`, `scripts`, `src`, `supabase`, `tsconfig.json`, `wrangler.jsonc`, plus `CLAUDE.md` sidelined below)
**Conflicts (.scaffold siblings)**: `CLAUDE.md` → `CLAUDE.md.scaffold` (existing `CLAUDE.md` in cwd wins per the conflict matrix)
**.gitignore handling**: moved silently (cwd had no `.gitignore` before this run)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` was removed before move-up; temp dir removed after move)

**Note**: the starter ships `AGENTS.md` as a symlink to `CLAUDE.md` inside its own tree. Because the cwd's existing `CLAUDE.md` won the conflict, `AGENTS.md` now resolves to that existing `CLAUDE.md` content rather than the starter's original `CLAUDE.md` (preserved verbatim in `CLAUDE.md.scaffold`). Flagged here for visibility; no automated action taken.

**npm install**: ran as part of the chained command. Exit 0. 656 packages added, 0 vulnerabilities reported at install time. Non-fatal `EBADENGINE` warnings surfaced for `astro-eslint-parser@3.1.0`, `eslint-plugin-astro@3.1.0`, and `undici@8.10.2` (all want newer Node than the local `v22.16.0`); install completed successfully despite the warnings.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: not applicable — 0 findings of any kind across 377 prod / 269 dev / 167 optional dependencies (804 total)

Clean tree. No findings to list.

## Hints recorded but not acted on

| Hint                       | Value                              |
| --------------------------- | ------------------------------------ |
| bootstrapper_confidence    | first-class                        |
| quality_override           | false                               |
| path_taken                 | standard                            |
| self_check_answers         | null                                |
| team_size                  | solo                                |
| deployment_target          | cloudflare-pages                   |
| ci_provider                | github-actions                     |
| ci_default_flow            | auto-deploy-on-merge               |
| has_auth                   | true                                |
| has_payments                | false                               |
| has_realtime                | false                               |
| has_ai                      | true                                |
| has_background_jobs        | true                                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review the `CLAUDE.md.scaffold` sibling and decide whether to fold anything from the starter's own `CLAUDE.md` into your existing one — note that `AGENTS.md` currently symlinks to your existing `CLAUDE.md`, not to `CLAUDE.md.scaffold`.
- `has_background_jobs: true` combined with the Cloudflare edge deployment target means the reminder/recurrence logic (FR-007, FR-009, FR-011, FR-012) needs a scheduled-trigger mechanism added manually (Cloudflare Cron Triggers or an external queue such as Upstash QStash/Inngest) — this was flagged during stack selection and is not scaffolded automatically in v1.
- Address audit findings per your project's risk tolerance — none found in this run, but re-run `npm audit` as dependencies evolve.
