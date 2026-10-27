# Reminder jobs: shared claim → send → mark runner — Implementation Plan

## Overview

The three reminder jobs each hand-copy the same gate → claim → send → dry-run stop → mark → log skeleton. Two of the three email builders are inline and untested, and no unit test imports any job module. These are F-12 TD-1, TD-7 and TD-8 (`context/archive/2026-10-27-reminders-research/research.md`).

This plan works guard-first:

1. Characterization tests pin today's behaviour of the three jobs as they are, with no source change.
2. Small, separately revertable TypeScript phases move the jobs onto one pure runner with an injected client, sender and site.
3. The two inline builders move into pure modules.

**The plan is the deliverable.** Implementation is parked by the orchestrator so that it cannot destabilise production reminder runs before milestone M-02 closes. Nothing here is implemented in this change.

## Current State Analysis

- **The skeleton is copied three times:**
  - `src/lib/reminders/appointment.ts:29-80`
  - `src/lib/reminders/due-screening.ts:29-110`
  - `src/lib/reminders/follow-up-nudge.ts:24-78`

  Each repeats the same log helper (`:102`, `:129`, `:80`). The research's Lens 1 table lists every step with its anchors.

- **The jobs differ only in:**
  - the event name;
  - the `batchKey` prefix;
  - whether a budget gate exists (the appointment job has none);
  - the select step (the due job runs candidates → parse → catalog → decide → claim, and adds `candidates` to its log lines);
  - the ids field (`reminder_ids` vs `nudge_ids`);
  - the builder;
  - the mark RPC.
- **What ties them to the Astro runtime:**
  - `admin-client.ts:2` (`astro:env/server`);
  - `email.ts:1` (`astro:env/server`);
  - `import.meta.env.SITE` (`appointment.ts:88`, `due-screening.ts:115`, `follow-up-nudge.ts:56`);
  - the value import of `MAX_BATCH_SIZE` from `email.ts` (`follow-up-nudge.ts:1`).
- **Already pure and tested:**
  - `chain.ts`, which injects its jobs and covers budget, order, alerts and redaction (`chain.test.ts`);
  - `nudge-message.ts`;
  - `candidates.ts`;
  - `email-budget.ts`;
  - `observability.ts`.
- **The jobs can be tested today** with `vi.mock("astro:env/server")` (precedent `src/lib/email.test.ts:3-8`), a mocked `@/lib/reminders/admin-client`, `vi.stubEnv("SITE", …)` and a stubbed `fetch`. The research spike (scratchpad, not committed) ran 42 scenarios that way.
- **The target runner is behaviour-identical.** The same spike showed an Option B runner producing the same transcript as today's jobs on all 42 scenarios: result or error, log lines in key order, RPC calls with arguments, and Resend requests.

## Desired End State

- `src/lib/reminders/runner.ts` (pure, no `astro:*` import) holds the one skeleton, with unit tests that need no mocks of `astro:*`.
- Each job file holds only:
  - a job spec: event, key prefix, select, ids, message, mark RPC;
  - the production wiring.
- The jobs' exported names and signatures are unchanged, so `src/worker.ts`, `chain.ts`, `failure-alert.ts` and `observability.ts` are untouched.
- `buildAppointmentMessage` and `buildDueScreeningMessage` live in pure modules with unit tests, including the no-exam-name rule. Like `buildNudgeMessage`, they take `(row, site)`.
- The phase 1 characterization tests pass, unchanged, after every later phase. That is the evidence of identical behaviour.

**Verify:**

- `npm test`, `npm run lint`, `npx astro check` and `npm run build` are green.
- The phase 1 test files show no diff after phase 1 (`git diff <phase-1-sha> -- <the 3 test files>` is empty at the end).

### Key Discoveries:

- `chain.ts:13-21` fixes the job signatures. `worker.ts:25-30` binds them. Nothing else imports the job modules (F-12 Q8), and nothing reads `outcome` outside them (F-12 Q10).
- `email.ts:79-83` is the only place `EMAIL_DRY_RUN` is read. The jobs only test `"dryRun" in result` (`appointment.ts:63`).
- `createReminderClient()` runs after the gates, inside the `try` (`appointment.ts:37-43`). A missing secret logs `failed` and alerts, and skipped runs never touch it (invariant I14).
- `eslint.config.js:77-88` turns `no-console` off by file, naming the three job files. A logging runner must be added there.
- `email-budget.ts:1-2` is the precedent for moving a constant out of `email.ts` so pure modules can import it.
- `README.md:357` promises that the per-job outcome lines "keep their shape" (I10).

## What We're NOT Doing

- **Implementing any phase in this change.** Implementation is parked; `roadmap.md` is not edited by this change.
- **SD-3:** whether a retired catalog entry stops appointment reminders. It is a product question.
- **SD-2:** the SQL recipient-predicate copies. Also no migrations or SQL of any kind.
- **TD-6:** the inconsistent batch cap. Fixing it changes RPC arguments, which would break transcript equality.
- **TD-4:** type-linking the event names to `ReminderJob`.
- **TD-5:** a job list in the chain or a fourth job (see `follow-ups/td-5-job-list.md`).
- **Changes to `chain.ts`, `worker.ts`, `failure-alert.ts`, `observability.ts`, `email.ts`'s send logic, `wrangler.jsonc` or the CI dry-run step.**
- **Changes to log event names, log fields, key prefixes, email copy or i18n keys.**
- **Test-plan Phase 2** ("Reminder recipient integration", DB-level). It complements this unit-level harness and stays separate.
- **Keeping the research spike.** It is not reused as code. Phase 1 writes the harness fresh in the repo.

## Implementation Approach

**Guard first.** Phase 1 adds characterization tests that are green on today's code by construction. Every later phase must leave those three test files byte-identical and green.

**Then the moves, each one commit, revertable on its own when undone in reverse order:**

- Phases 1 and 2 are standalone.
- Phase 3 adds the runner with no consumer.
- Phases 4–6 move one job each.
- Phase 7 extracts the builders.

Reverting phase 4, 5 or 6 restores that job's hand-written body without touching the others.

**Runner contract.** Other phases depend on it, so here it is:

```ts
// src/lib/reminders/runner.ts — pure: no astro:*, no admin client
export type ReminderOutcome = "none" | "skipped" | "dry-run" | "sent";
export interface ReminderDeps {
  client: () => SupabaseClient<Database>; // called after the gates, inside the try (I14)
  send: (batch: { messages: BatchEmailMessage[]; idempotencyKey: string }) => Promise<SendEmailBatchResult>;
  site: string;
}
export interface ClaimSendMarkJob<Row> {
  event: "appointment-reminder" | "due-screening-reminder" | "follow-up-nudge";
  keyPrefix: string;
  select: (
    client,
    ctx: { now: Date; budget: number | undefined },
  ) => Promise<{ rows: Row[]; fields?: Record<string, number> }>;
  ids: (row: Row) => number[];
  message: (row: Row, site: string) => BatchEmailMessage;
  mark: "mark_appointment_reminders_sent" | "mark_due_screening_reminders_sent" | "mark_follow_up_nudges_sent";
}
// budget undefined = no budget gate (appointment); a number gates `<= 0` as `reason: "no-budget"`.
export function runClaimSendMark<Row>(
  job,
  run: ReminderRun,
  budget: number | undefined,
  deps: ReminderDeps,
): Promise<{ outcome: ReminderOutcome; sent: number }>;
```

**Log line shape.** The runner logs `{ event, outcome, cron, scheduledAt, ...fields, due, sent }`, with `fields` (the due job's `candidates`) placed between `scheduledAt` and `due`. A `failed` line is `{ event, outcome: "failed", cron, scheduledAt, error: errorName(e), ...errorDetails(e) }`, after which the runner rethrows the same error object.

## Critical Implementation Details

- **Timing & lifecycle.**
  - The runner must call `deps.client()` after both gates and inside its `try`. An eager client, or one built at wiring time, would change I14: a config error on a skipped run, or a config error that is not logged as `failed`.
  - `deps.site` is passed per call by the job's wiring (`import.meta.env.SITE`). Phase 4 verifies in the built Worker that the value is the inlined production URL, not a runtime lookup.
- **Debug & observability.** The characterization tests capture `console.log` lines as parsed JSON, in order, and compare them with `toEqual`, so key order is not asserted. Key order is kept anyway (above), because `README.md:357` promises shape. The `email` dry-run line comes from `email.ts`, and the tests must keep capturing it, because it proves the real sender ran.

## Phase 1: Characterization tests of today's jobs

### Overview

Pin current behaviour of the three jobs with no source change. These three files are the guard for every later phase.

### Changes Required:

#### 1. Transcript test helper

**File**: `src/lib/reminders/transcript.test-helper.ts` (new; not matched by Vitest's `src/**/*.test.ts` include, imported by the three test files)

**Intent**: One recorder shared by the three job tests, so each test states its scenario and its expectations, not plumbing.

**Contract**: The helper exports:

- `fakeClient(replies, calls)`: answers `.rpc(name, args)` and `.from(table).select(cols).eq(col, val)` from a reply map keyed by RPC name or `from:<table>`, recording each call.
- `stubResend(mode)`: `"ok" | 500 | "missing-id"`. It records URL, `Idempotency-Key` and parsed body.
- `record(invoke)`: returns `{ result | error: {name, step, code, operation, status, resendError}, logs, calls, fetches }`, with `console.log`/`console.error` captured as parsed lines.
- Shared fixtures: claimed rows for each job, valid candidate rows and an active catalog row (pattern: `candidates.test.ts:9-31`), plus the leaky inputs:
  - an RPC error object whose `message` holds an address;
  - a Resend 500 body whose `message` holds an address;
  - a candidate completion slug used as a canary.

#### 2. Job characterization tests

**Files**: `src/lib/reminders/appointment.test.ts`, `src/lib/reminders/due-screening.test.ts`, `src/lib/reminders/follow-up-nudge.test.ts` (new)

**Intent**: Run each exported job function exactly as `worker.ts` calls it and assert the invariants from the research (I1–I14) explicitly. Add one strict `toEqual` transcript per job for the `sent` scenario (decided by the orchestrator).

**Contract**:

- **Mocks in each file:**
  - `vi.mock("astro:env/server")` with a getter for `EMAIL_DRY_RUN` (scenario-controlled), test `EMAIL_FROM`/`RESEND_API_KEY`, and `REMINDER_TEST_TO` set to a sentinel address;
  - `vi.mock("@/lib/reminders/admin-client", importOriginal)`, keeping the real `ReminderConfigError` and replacing only `createReminderClient` (scenario: fake client or throw);
  - `vi.stubEnv("SITE", "https://dbam.example")`.
- **Run times:** `scheduledTime: 1790841600000`, as in `chain.test.ts:7` and the CI dry run. That is 10:00 Warsaw with cron `0 8,9 * * *`.
- **Scenarios for every job, with their assertions:**

  | Scenario                                        | Invariants | What is asserted                                                                                                                                                                                                                                                                      |
  | ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `*/30 * * * *` cron; the 11:00 Warsaw daily run | gate       | outcome `skipped`, 0 RPC calls, 0 fetches                                                                                                                                                                                                                                             |
  | empty claim                                     | —          | outcome `none`, the log fields `due: 0, sent: 0`                                                                                                                                                                                                                                      |
  | dry run with rows                               | I1, I2, I3 | claim called (I2); no fetch, no mark; the `email` dry-run line with `count` precedes the job's `dry-run` line                                                                                                                                                                         |
  | sent                                            | I4, I13    | **`toEqual` on the full transcript** (logs, RPC calls with arguments, the one fetch's URL, key and body). Recipients are the row emails, never `REMINDER_TEST_TO` (I4). Key matches `^<prefix>:[0-9a-f]{64}$` and is pinned (I13). Mark gets the claim's ids flattened in claim order |
  | claim error                                     | I6, I8     | `ReminderDatabaseError` step `claim`                                                                                                                                                                                                                                                  |
  | Resend 500                                      | I6         | `EmailSendError` with status and `resendError`; no mark                                                                                                                                                                                                                               |
  | Resend 200 with missing ids                     | I6         | `EmailSendError` `missing_id`; no mark                                                                                                                                                                                                                                                |
  | mark error                                      | I6, I8     | `ReminderDatabaseError` step `mark`                                                                                                                                                                                                                                                   |
  | `createReminderClient` throws on a daily run    | I14        | `ReminderConfigError` logged `failed` and rethrown                                                                                                                                                                                                                                    |
  | `createReminderClient` throws on a skipped run  | I14        | outcome `skipped`, no throw                                                                                                                                                                                                                                                           |

  Every failure row also asserts I6: exactly one `failed` line, then a rethrow of an instance of the original class.

- **Due and nudge jobs also cover:**
  - budget 0 gives `skipped` with `reason: "no-budget"` and 0 RPC calls;
  - nudge with budget 250 claims with `p_limit: 100`.
- **The due job also covers:**
  - 0 candidates;
  - a candidates RPC error (step `candidates`);
  - an invalid candidate row (code `invalid`);
  - a catalog read error (`DatabaseError`, operation `read-catalog`);
  - a candidate not yet due (`none` with `candidates: 1`);
  - budget 1 claims 1 item.
- **Privacy (lessons.md "privacy tests are the guard"; I7, I9):** with the leaky inputs, the serialized logs contain no `@` or canary slug, and the emails contain no slug. These are tests, not greps.
- **What stays with the existing tests:** I5 and I11 remain covered by `chain.test.ts`, and I12 by `src/lib/screenings/due.perf.test.ts`. Neither file changes.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the three new job test files, with zero source files changed in the phase commit (`git show --stat` lists only the 4 new test files)
- `npm run lint` passes with no errors in the new files
- `npx astro check` passes
- A deliberate break fails the guard: temporarily swapping the order of mark and send in one job makes its test file fail, and the swap is reverted before commit

#### Manual Verification:

- A reviewer reads the `sent` transcripts and confirms that the pinned email texts are today's copy for pl and en, with no exam name

**Implementation Note**: Pause after this phase for the manual check before phase 2.

---

## Phase 2: Move `MAX_BATCH_SIZE` into `email-budget.ts`

### Overview

Make the batch cap importable by pure modules without pulling `astro:env` through `email.ts`. The spike showed that the runner path is otherwise not mock-free.

### Changes Required:

#### 1. Pure constant

**Files**: `src/lib/email-budget.ts`, `src/lib/email.ts`, `src/lib/reminders/follow-up-nudge.ts`

**Intent**: Declare `MAX_BATCH_SIZE = 100` (with its Resend comment) in `email-budget.ts`. `email.ts` re-exports it, as it does `REMINDER_EMAIL_DAILY_BUDGET` (`email.ts:4`), and uses it in `sendEmailBatch`. `follow-up-nudge.ts` imports it from `@/lib/email-budget`.

**Contract**: `MAX_BATCH_SIZE` stays exported from `@/lib/email` with the same value. The `RangeError` text in `email.ts:77` is unchanged.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, and the phase 1 test files are unchanged
- `npm run lint` and `npx astro check` pass
- `src/lib/email-budget.ts` imports nothing from `astro:*`

---

## Phase 3: Add the pure runner

### Overview

Add `runner.ts` and its unit tests. No job uses it yet, so production behaviour cannot change in this phase.

### Changes Required:

#### 1. Runner

**File**: `src/lib/reminders/runner.ts` (new)

**Intent**: The one skeleton, with the order and log shape set out under Implementation Approach:

1. send gate (`isDailySendRun`);
2. optional budget gate;
3. `deps.client()`;
4. `select`;
5. empty rows give `none`;
6. ids, `batchKey`, `deps.send`;
7. `"dryRun" in result` gives `dry-run` with no mark;
8. mark RPC (error gives `ReminderDatabaseError("mark", code)`);
9. `sent`;
10. a `catch` that logs `failed` and rethrows the same object.

**Contract**: The runner contract above. It imports only pure modules: `schedule`, `batch-key`, `errors`, `observability`, and types from `email` and `database.types`. The header comment carries over the privacy rule from the job headers (`appointment.ts:18-19`).

#### 2. Runner tests

**File**: `src/lib/reminders/runner.test.ts` (new)

**Intent**: Prove the skeleton with a fake spec and fake deps, with **no `astro:*` mock**. That proves the module is pure.

**Contract**: The test covers:

- the gate with no budget (budget `undefined` never gates);
- budget 0 gives `no-budget`;
- client called once and only after the gates;
- `fields` spread into `none`/`dry-run`/`sent` lines before `due`;
- the dry run never marks;
- mark ids equal the flattened `ids` in row order;
- a thrown error is rethrown by identity (`toBe`) after one `failed` line;
- a leaky error's message never reaches the log line.

#### 3. Lint allow-list

**File**: `eslint.config.js`

**Intent**: The runner logs to Workers Logs through `console`, like the jobs.

**Contract**: Add `src/lib/reminders/runner.ts` to `workerLogsConfig.files` (`eslint.config.js:77-88`).

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including `runner.test.ts`, and the phase 1 test files are unchanged
- `runner.test.ts` contains no `vi.mock("astro:` call and still passes
- `npm run lint` and `npx astro check` pass

---

## Phase 4: Appointment job on the runner

### Overview

The first job moves onto the runner. It is the simplest, with one select step and no budget gate. This phase also adds the production deps factory.

### Changes Required:

#### 1. Production deps

**File**: `src/lib/reminders/deps.ts` (new)

**Intent**: One place that binds the real collaborators, so the three job files don't repeat them.

**Contract**: `reminderDeps(): ReminderDeps` returns:

- `client: createReminderClient` (the function, not a client);
- `send: sendEmailBatch`;
- `site: import.meta.env.SITE`.

This module imports `astro:env` through its imports, so it is wiring, not pure.

Each job calls `reminderDeps()` once per run, never at module load. The phase 1 tests mock `createReminderClient` and stub `SITE` per scenario, and they depend on the deps being read at run time.

#### 2. Appointment job

**File**: `src/lib/reminders/appointment.ts`

**Intent**: Replace the hand-written body with a spec (`appointmentJob`) and one-line wiring. Keep the private `buildMessage` for now, adapted to receive `site` from the spec's `message(row, site)`. Remove the local `log` helper.

**Contract**:

- Unchanged:
  - `runAppointmentReminders({ cron, scheduledTime }): Promise<{ outcome; sent }>`;
  - `APPOINTMENT_REMINDER_LEAD_DAYS`;
  - claim arguments (`p_limit: REMINDER_EMAIL_DAILY_BUDGET`);
  - key prefix `dbam-appointment-reminder`;
  - event `appointment-reminder`.
- `AppointmentReminderOutcome` remains exported as an alias of `ReminderOutcome`.
- Budget is passed as `undefined`.
- The header comment stays, trimmed of skeleton details now documented in `runner.ts`.

#### 3. Verify `SITE` in the built Worker

**Intent**: Turn the research's inference into a checked fact (orchestrator decision 3): in the build, `import.meta.env.SITE` must be the inlined production URL.

**Contract**: After `npm run build`:

- the server output under `dist/` contains `https://dbam.amadeuszkozlowski.workers.dev` in the module that contains `dbam-appointment-reminder`;
- no `import.meta.env.SITE` remains in `dist/`.

If either check fails, stop the phase. Do not ship it, and record a decision in `decisions.md` before continuing.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, and `appointment.test.ts` is unchanged since phase 1
- `npm run lint` and `npx astro check` pass
- `npm run build` succeeds, and the built-output `SITE` check above holds
- `appointment.ts` contains no `console.` call and no `sendEmailBatch(` call

---

## Phase 5: Follow-up nudge job on the runner

### Overview

The second job: one select step with a budget gate. `buildNudgeMessage` already has the `(row, site)` shape.

### Changes Required:

#### 1. Nudge job

**File**: `src/lib/reminders/follow-up-nudge.ts`

**Intent**: Replace the body with `followUpNudgeJob` plus wiring through `reminderDeps()`. Remove the local `log` helper.

**Contract**:

- Unchanged:
  - `runFollowUpNudges(run, { budget })`;
  - claim arguments including `p_limit: Math.min(budget, MAX_BATCH_SIZE)` (TD-6 stays);
  - ids from `nudge_ids`;
  - prefix `dbam-follow-up-nudge`;
  - event `follow-up-nudge`.
- `message: buildNudgeMessage`.
- `FollowUpNudgeOutcome` is aliased.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, and `follow-up-nudge.test.ts` is unchanged since phase 1
- `npm run lint` and `npx astro check` pass
- `follow-up-nudge.ts` contains no `console.` call

---

## Phase 6: Due-screening job on the runner

### Overview

The most complex job: its candidates → parse → catalog → decide → claim chain becomes the spec's `select`.

### Changes Required:

#### 1. Due job

**File**: `src/lib/reminders/due-screening.ts`

**Intent**: Replace the body with `dueScreeningJob` plus wiring. Remove the local `log` helper. Its `select`:

- returns `{ rows: [], fields: { candidates: 0 } }` on 0 candidates;
- returns `{ rows: [], fields: { candidates: n } }` when no item is due or the claim is empty;
- otherwise returns the claimed rows with `fields: { candidates: n }`.

That collapses today's three `none` exits (`:56-59`, `:63-66`, `:76-79`) into the runner's one exit with identical lines.

**Contract**:

- Unchanged:
  - `runDueScreeningReminders(run, { budget })`;
  - the RPC order and arguments (`DUE_CANDIDATE_LIMIT`, the `{ ...item }` spread and its comment);
  - `getActiveRuleCatalog(client)`;
  - `collectClaimItems(…, budget)`;
  - error steps `candidates`/`claim`;
  - prefix `dbam-due-screening-reminder`;
  - event `due-screening-reminder`.
- `DueScreeningOutcome` is aliased.
- No zod and no `Intl.Collator` are added on this path (I12).

#### 2. Lint allow-list cleanup

**File**: `eslint.config.js`

**Intent**: After this phase no job file logs, so remove the three job entries from `workerLogsConfig.files`. Lint then flags any `console` call that creeps back into a job file.

**Contract**: `workerLogsConfig.files` lists `runner.ts` and no `appointment.ts`, `due-screening.ts` or `follow-up-nudge.ts`.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, and `due-screening.test.ts` is unchanged since phase 1
- `src/lib/screenings/due.perf.test.ts` passes unchanged (the CPU budget gate, orchestrator decision 2)
- `npm run lint` and `npx astro check` pass
- `npm run build` succeeds

---

## Phase 7: Extract the two email builders

### Overview

Move the appointment and due builders into pure modules, following `nudge-message.ts`, and unit-test their copy and the no-exam-name rule directly.

### Changes Required:

#### 1. Builder modules

**Files**: `src/lib/reminders/appointment-message.ts`, `src/lib/reminders/due-screening-message.ts` (new). `appointment.ts` and `due-screening.ts` are edited to import them.

**Intent**: `buildAppointmentMessage(row, site)` and `buildDueScreeningMessage(row, site)` are moved verbatim. Each module is pure: the `email` import is type-only, and there is no `astro:*` import (header like `nudge-message.ts:4-6`). Each defines a minimal row interface, like `NudgeRow`.

**Contract**:

- The message text, subject, recipient and link URLs are byte-identical.
- `APPOINTMENT_REMINDER_LEAD_DAYS` stays in `appointment.ts`, because only the claim uses it.

#### 2. Builder tests

**Files**: `src/lib/reminders/appointment-message.test.ts`, `src/lib/reminders/due-screening-message.test.ts` (new)

**Intent**: Pattern `nudge-message.test.ts`.

**Contract**: The tests cover:

- pl and en copy;
- plural forms by `reminder_ids.length` (`_one`/`_few`/`_many` for pl);
- the date list (appointment);
- dashboard and opt-out links built from `site`;
- an unknown locale falls back to the default;
- the leaky case: a row whose fields carry a catalog slug never puts it in subject or text (I9).

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the two builder test files, and the phase 1 test files are unchanged
- `npm run lint`, `npx astro check` and `npm run build` pass
- The new builder modules import nothing from `astro:*` (their tests run without `vi.mock("astro:`)

#### Manual Verification:

- After the eventual production deploy of the full stack: the next 10:00 Warsaw run's Workers Logs show one `appointment-reminder`, one `due-screening-reminder` and one `follow-up-nudge` line, with the same fields as before the deploy and no `error` line
- After the same deploy: Workers Logs CPU time for that scheduled run stays within the 10 ms cap (I12; joins the open S-06 production CPU check, `context/archive/2026-10-06-due-screening-reminder/decisions.md:82`)

---

## Testing Strategy

### Unit Tests:

- **Characterization (phase 1):** the guard. Three job test files with explicit per-invariant assertions and one full `toEqual` transcript per job for `sent`. They stay unchanged from phase 2 on.
- **The runner (phase 3)**, without `astro:*` mocks.
- **The builders (phase 7):** copy, plurals, links, and the no-exam-name rule.
- **Unchanged guards:** `chain.test.ts` (I5, I11), `observability.test.ts` (I7), `due.perf.test.ts` (I12) and `candidates.test.ts`.

### Integration Tests:

- None added. The CI step "Exercise scheduled handler (dry run)" (`.github/workflows/ci.yml:72-87`) keeps running the real Worker against local Supabase and must stay green on every phase PR. DB-level recipient tests remain test-plan Phase 2.

### Manual Testing Steps:

1. Phase 1: review the pinned email copy in the `sent` transcripts.
2. After deploying the whole stack: compare one production run's three job log lines against a pre-deploy run's lines (fields and outcome).
3. Check that run's CPU time in Workers Logs.

## Performance Considerations

The runner adds one generic call layer and closure per job on a cron run capped at 10 ms CPU (`README.md:316`). `due.perf.test.ts` remains the automated gate. The production CPU check is a phase 7 manual row. No new dependency, parsing library or `Intl` constructor is added.

## Migration Notes

There is no data or schema migration. Each phase is TypeScript only, so a Worker rollback, or a revert of the phase's commit (in reverse order for phases 3–7), restores the previous behaviour fully. Phases may ship in separate PRs. A PR that stops after phase 1 or 2 leaves production untouched.

## References

- Research: `context/changes/reminders-refactor/research.md` (Lenses 1–3; invariants I1–I14; spike results)
- Parent research: `context/archive/2026-10-27-reminders-research/research.md` (TD-1, TD-2, TD-3, TD-7, TD-8)
- Decisions: `context/changes/reminders-refactor/decisions.md`
- Patterns: `src/lib/reminders/chain.ts:4-21` (injection), `src/lib/reminders/nudge-message.ts` (pure builder), `src/lib/email-budget.ts` (pure constant), `src/lib/email.test.ts:3-8` (`astro:env` mock)
- Lessons: `context/foundation/lessons.md` ("Grep gates are heuristics; privacy tests are the guard")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Characterization tests of today's jobs

#### Automated

- [ ] 1.1 npm test passes with the three job test files and zero source files changed
- [ ] 1.2 npm run lint passes with no errors in the new files
- [ ] 1.3 npx astro check passes
- [ ] 1.4 A deliberate mark/send swap fails the guard and is reverted before commit

#### Manual

- [ ] 1.5 Reviewer confirms the pinned sent-transcript email copy is today's pl and en text with no exam name

### Phase 2: Move MAX_BATCH_SIZE into email-budget.ts

#### Automated

- [ ] 2.1 npm test passes with the phase 1 test files unchanged
- [ ] 2.2 npm run lint and npx astro check pass
- [ ] 2.3 email-budget.ts imports nothing from astro:*

### Phase 3: Add the pure runner

#### Automated

- [ ] 3.1 npm test passes including runner.test.ts with the phase 1 test files unchanged
- [ ] 3.2 runner.test.ts has no astro:* mock and passes
- [ ] 3.3 npm run lint and npx astro check pass

### Phase 4: Appointment job on the runner

#### Automated

- [ ] 4.1 npm test passes with appointment.test.ts unchanged since phase 1
- [ ] 4.2 npm run lint and npx astro check pass
- [ ] 4.3 npm run build succeeds and the built Worker inlines SITE as the production URL
- [ ] 4.4 appointment.ts has no console call and no direct sendEmailBatch call

### Phase 5: Follow-up nudge job on the runner

#### Automated

- [ ] 5.1 npm test passes with follow-up-nudge.test.ts unchanged since phase 1
- [ ] 5.2 npm run lint and npx astro check pass
- [ ] 5.3 follow-up-nudge.ts has no console call

### Phase 6: Due-screening job on the runner

#### Automated

- [ ] 6.1 npm test passes with due-screening.test.ts unchanged since phase 1
- [ ] 6.2 due.perf.test.ts passes unchanged
- [ ] 6.3 npm run lint and npx astro check pass
- [ ] 6.4 npm run build succeeds

### Phase 7: Extract the two email builders

#### Automated

- [ ] 7.1 npm test passes including both builder test files with the phase 1 test files unchanged
- [ ] 7.2 npm run lint, npx astro check and npm run build pass
- [ ] 7.3 The builder modules import nothing from astro:*

#### Manual

- [ ] 7.4 First production run after deploy logs the three job lines with unchanged fields and no error line
- [ ] 7.5 That run's Workers Logs CPU time stays within the 10 ms cap
