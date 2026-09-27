# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Never rename the Worker in place

- **Context**: Any change to `name` in `wrangler.jsonc` (rebrand, repo rename, splitting environments).
- **Problem**: Cloudflare treats a new name as a new Worker. The next deploy creates an empty Worker with no secrets at a different workers.dev URL, the CI token (scoped to the `dbam` Worker only) can't deploy it, and the real site keeps serving old code (F2 in `context/changes/deployment/deployment-plan.md`).
- **Rule**: Keep `name: "dbam"`. If a rename is really needed, plan it as a migration: new Worker, secrets, a scoped token, `PRODUCTION_URL`, and the Supabase Site URL. Then a human retires the old Worker.
- **Applies to**: plan, plan-review, implement, impl-review

## Post-deploy checks race the Worker rollout

- **Context**: Any check that runs against production right after `wrangler deploy` (the `deploy` job's health check and read-only smoke, or a manual check).
- **Problem**: A new Worker version takes up to a minute to reach every edge location, so for a few seconds some requests are still served by the previous version. One 200 from the health check proves only that _one_ location has the new code. On 2026-09-27 the post-deploy smoke for #35 got a 404 on the new `/profile` route 15 s after deploy while the neighbouring new routes answered, and a re-run minutes later passed.
- **Rule**: Treat an immediate post-deploy failure on a route the deploy just added as possible propagation lag: the `deploy` job retries the read-only smoke (3 attempts, 20 s apart) before failing. Don't "fix" it by rolling back; re-check after a minute, and only roll back if it still fails.
- **Applies to**: implement, impl-review
