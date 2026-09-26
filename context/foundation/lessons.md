# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Never rename the Worker in place

- **Context**: Any change to `name` in `wrangler.jsonc` (rebrand, repo rename, splitting environments).
- **Problem**: Cloudflare treats a new name as a new Worker. The next deploy creates an empty Worker with no secrets at a different workers.dev URL, the CI token (scoped to the `dbam` Worker only) can't deploy it, and the real site keeps serving old code (F2 in `context/changes/deployment/deployment-plan.md`).
- **Rule**: Keep `name: "dbam"`. If a rename is really needed, plan it as a migration: new Worker, secrets, a scoped token, `PRODUCTION_URL`, and the Supabase Site URL. Then a human retires the old Worker.
- **Applies to**: plan, plan-review, implement, impl-review
