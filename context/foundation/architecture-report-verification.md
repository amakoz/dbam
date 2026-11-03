---
artifact: ast-grep-verification
generated: 2026-11-03
tool: ast-grep 0.39.5 (npx -p @ast-grep/cli@0.39.5)
commits: 8529cc8 (the reminder research), c9d5685 (main after the refactor)
---

# Structural claims checked with ast-grep

The research verified its TypeScript claims with AST queries through the TypeScript compiler API (`context/archive/2026-10-27-reminders-research/queries/`). This note re-checks the claims the architecture report relies on, using ast-grep patterns. As the M4L3 lesson requires, every zero was cross-checked with plain grep.

- `@8529cc8`: a detached worktree of the research commit.
- `@HEAD`: `main` at `c9d5685`, after the refactor (F-16).
- Test files and test helpers are excluded.

## Results

| Claim                                                         | Pattern (`-l ts`)                                                                           | At      | Result                                                                                                                          | Verdict                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| TD-1: each job has its own claim → send → mark                | `sendEmailBatch($$$)` in `src/lib/reminders`                                                | 8529cc8 | 3: `appointment.ts:59`, `due-screening.ts:82`, `follow-up-nudge.ts:57`                                                          | confirmed              |
| TD-2: the `log` helper is copied into each job                | `function log($$$): $T { $$$ }`                                                             | 8529cc8 | 3: `appointment.ts:102`, `due-screening.ts:129`, `follow-up-nudge.ts:80`                                                        | confirmed              |
| TD-7: two of three email builders are inline                  | `function buildMessage($$$): $T { $$$ }` / `export function $F($$$): BatchEmailMessage {…}` | 8529cc8 | 2 inline (`appointment.ts:82`, `due-screening.ts:113`), 1 exported (`nudge-message.ts:22`)                                      | confirmed              |
| TD-8: no test imports the appointment or due job              | grep `reminders/(appointment\|due-screening)` imports                                       | 8529cc8 | only `src/worker.ts`                                                                                                            | confirmed              |
| TD-6: only the nudge job caps the batch size                  | `Math.min($A, MAX_BATCH_SIZE)`                                                              | 8529cc8 | 1: `follow-up-nudge.ts:44` (`A=budget`)                                                                                         | confirmed              |
| TD-10: 9 `.rpc()` call sites, all with generated types        | `$C.rpc($$$)`                                                                               | 8529cc8 | 9: 7 in the jobs, `api/screenings.ts:78`, `api/consent/withdraw.ts:27`                                                          | confirmed (see note 2) |
| Refactor done: all three jobs run on the shared runner        | `runClaimSendMark($$$)`                                                                     | HEAD    | 3: `appointment.ts:48`, `follow-up-nudge.ts:50`, `due-screening.ts:69`                                                          | confirmed              |
| Refactor done: no copied `log` helper is left                 | `function log($$$): $T { $$$ }`                                                             | HEAD    | 0, and grep agrees                                                                                                              | confirmed              |
| Refactor done: all builders are exported pure modules         | `export function $F($$$): BatchEmailMessage { $$$ }`                                        | HEAD    | 3: `appointment-message.ts:17`, `due-screening-message.ts:15`, `nudge-message.ts:22`                                            | confirmed              |
| Refactor done: the sender is injected, not called by the jobs | `sendEmailBatch($$$)` in `src/lib`                                                          | HEAD    | 0 calls; grep: only the definition (`email.ts:68`) and the injection (`reminders/deps.ts:9`)                                    | confirmed              |
| ACL: the query builder leaks into API routes                  | `$X.from($$$)`, `$X.rpc($$$)` in `src/pages`                                                | HEAD    | 7 + 2 = 9 calls in 5 files, 5 of them in `api/screenings.ts` (68, 78, 138, 150, 158)                                            | confirmed              |
| ACL: read modules and reminder jobs call it too               | `$X.from($$$)`, `$X.rpc($$$)` in `src/lib`                                                  | HEAD    | 7 `supabase.from` (`consent.ts`, `catalog/read.ts`, `screenings/read.ts`) + 5 `client.rpc` in reminders; 4 `Array.from` dropped | confirmed              |
| ACL: auth calls stay at the edge                              | `$X.auth.$M($$$)` in `src`                                                                  | HEAD    | 5: `middleware.ts:54` and the 4 auth routes                                                                                     | confirmed              |

## Notes

1. **Zeros that grep overturned:** the first patterns, `function log($$$) { $$$ }` and `function buildMessage($$$) { $$$ }`, returned 0. Grep found all the declarations: they carry return-type annotations, which the pattern must spell out (`: $T`). With that fixed, the counts match the research exactly.
2. **An undercount that grep caught:** `$C.rpc($NAME, $$$)` returned 8 call sites. Grep found 9: `withdraw.ts:27` calls `.rpc("withdraw_health_data_consent")` with no argument object. `$C.rpc($$$)` returns 9, matching the research's Q9.
3. **Why TD-8 uses grep:** an import-path claim is about a string literal, so grep is the right tool. ast-grep adds nothing there.

## Reproduce

```bash
git worktree add --detach /tmp/at-research 8529cc8
npx -y -p @ast-grep/cli@0.39.5 ast-grep run -l ts -p 'function log($$$): $T { $$$ }' /tmp/at-research/src/lib/reminders
npx -y -p @ast-grep/cli@0.39.5 ast-grep run -l ts -p 'runClaimSendMark($$$)' src/lib/reminders
npx -y -p @ast-grep/cli@0.39.5 ast-grep run -l ts -p '$X.from($$$)' src/pages
```
