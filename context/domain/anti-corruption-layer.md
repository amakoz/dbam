---
artifact: anti-corruption-layer
generated: 2026-11-03
head: c9d5685
inputs: context/domain/domain-distillation.md, context/map/repo-map.md, grep over src/
---

# Anti-corruption layer: Dbam

Question: which external dependency leaks into the domain, through how many layers, and what would isolate it? This is the third DDD note next to `domain-distillation.md` (language, invariants, drift) and `glossary.md`.

## Method

Counts come from `git grep` at `c9d5685`, without tests, test helpers and `src/lib/database.types.ts`:

- Supabase data access: `git grep -nE '\.(from|rpc)\(' -- src` (`Array.from` filtered out).
- Supabase Auth: `git grep -lE '\.auth\.(get|sign|exchange|verify)' -- src`.
- Resend: `git grep -n 'api.resend.com' -- src`.
- Package imports: `git grep -lE "from ['\"]@supabase/" -- src`.

## Findings

| Dependency                             | Where it appears                                                                                                                                                                                                                                      | Layers | Verdict                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Resend (email API)                     | `src/lib/email.ts` only (`RESEND_ENDPOINT`, `RESEND_BATCH_ENDPOINT`)                                                                                                                                                                                  | 1      | Isolated: `email.ts` is already the adapter, and the reminder jobs get the sender injected (`deps.ts`). |
| Supabase Auth errors                   | Auth routes and middleware call `supabase.auth.*` (5 files); error codes are translated in one place, `src/lib/auth-errors.ts`                                                                                                                        | 2      | Contained: the translation is a working ACL for errors.                                                 |
| Supabase package (`@supabase/*`)       | Imported in `src/lib` only (7 files)                                                                                                                                                                                                                  | 1      | Contained at import level.                                                                              |
| **Supabase query builder (PostgREST)** | **API routes:** 9 calls in 5 files, 5 of them in `src/pages/api/screenings.ts` (incl. a dynamic `.from(table)`). **Read modules:** 7 calls (`catalog/read.ts`, `consent.ts`, `screenings/read.ts`). **Reminders:** 5 calls (4 files, injected client) | 3      | **Leaks.** Table names, filter chains and `PostgrestError` shapes reach the HTTP layer.                 |

The worst leak sits on the Exam aggregate (`domain-distillation.md`, ranking #1). `api/screenings.ts` writes the exam's rows directly. The rule "mark done also deletes the plan" (R-03) is two separate PostgREST calls there (D-03), so no single object owns the exam's invariants.

## Proposal

- **Port:** an `ExamRepository` in `src/lib/screenings/` with domain operations (`plan`, `unplan`, `markDone`, `undoDone`, `confirm`) that take `(userId, slug)` and return domain results, not `PostgrestError`.
- **Adapter:** a Supabase implementation. `markDone` becomes one RPC, which makes D-03 atomic. `confirm` already is one (`confirm_screening_plan`).
- **Value objects:** `ScreeningSlug` and `MonthDate` replace raw strings at the port boundary.
- **Out of scope:** the reminder jobs, which already reach Supabase only through an injected client (F-16), and the auth calls, which already have their error ACL.

**Done when:** `git grep -nE '\.(from|rpc)\(' -- src/pages` returns no lines, and a failed mark-done leaves no plan beside its done record.
