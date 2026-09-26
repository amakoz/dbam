---
starter_id: 10x-astro-starter
package_manager: npm
project_name: dbam
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
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
---

## Why this stack

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
starters. Deployment stays on the starter's own default (Cloudflare Workers — corrected from an
earlier "Pages" assumption per `/10x-infra-research`'s findings: `astro.config.mjs` and
`wrangler.jsonc` already target Workers, and Astro 7's `@astrojs/cloudflare` adapter
defaults to Workers, not Pages); CI runs on GitHub Actions with auto-deploy-on-merge,
matching a solo/short-timeline profile.
