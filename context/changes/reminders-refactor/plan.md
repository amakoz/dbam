# Reminder jobs: shared claim → send → mark runner — Implementation Plan

## Overview

The three reminder jobs each hand-copy the same gate → claim → send → dry-run stop → mark → log skeleton. Two of the three email builders are inline and untested, and no unit test imports any job module. These are F-12 TD-1, TD-7 and TD-8 (`context/archive/2026-10-27-reminders-research/research.md`).

This plan works guard-first:

1. Characterization tests pin today's behaviour of the three jobs as they are, with no source change.
2. Small TypeScript phases move the jobs onto one pure runner with an injected client, sender and site. Each job's move is self-contained.
3. The two inline builders move into pure modules, one phase each.

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
- **The jobs can be tested today** with `vi.mock("astro:env/server")` (precedent `src/lib/email.test.ts:3-8`), a mocked `@/lib/reminders/admin-client`, `vi.stubEnv("SITE", …)` and a stubbed `fetch`. The research spike (scratchpad, not committed) ran 42 scenarios that way. `vitest.config.ts` is plain Vitest, without Astro's Vite plugin, so `import.meta.env.SITE` is read at run time and `vi.stubEnv` takes effect (plan review, "What holds").
- **The target runner is behaviour-identical.** The same spike showed an Option B runner producing the same transcript as today's jobs on all 42 scenarios: result or error, log lines in key order, RPC calls with arguments, and Resend requests.

## Desired End State

- `src/lib/reminders/runner.ts` (pure, no `astro:*` import) holds the one skeleton, with unit tests that need no mocks of `astro:*`.
- Each job file holds only:
  - a job spec: event, key prefix, select, ids, message, mark RPC;
  - one call into the runner with `reminderDeps()` from `src/lib/reminders/deps.ts`.
- The jobs' exported names and signatures are unchanged, so `src/worker.ts`, `chain.ts`, `failure-alert.ts` and `observability.ts` are untouched.
- `buildAppointmentMessage` and `buildDueScreeningMessage` live in pure modules with unit tests, including the no-exam-name rule. Like `buildNudgeMessage`, they take `(row, site)`.
- The phase 1 characterization tests pass, unchanged, after every later phase. Each later phase's deliberate break proves those tests exercise the code that phase changed.

**Verify:**

- `npm test`, `npm run lint`, `npx astro check` and `npm run build` are green.
- The phase 1 test files show no diff after phase 1 (`git diff <phase-1-sha> -- <the 3 job test files and the helper>` is empty at the end).

### Key Discoveries:

- `chain.ts:13-21` fixes the job signatures. `worker.ts:25-30` binds them. Nothing else imports the job modules (F-12 Q8), and nothing reads `outcome` outside them (F-12 Q10).
- `chain.ts:39,47` computes each later budget from the earlier job's returned `sent`. `chain.test.ts` uses fake jobs, so only the job tests can pin that return contract (I15 below).
- `email.ts:79-83` is the only place `EMAIL_DRY_RUN` is read. The jobs only test `"dryRun" in result` (`appointment.ts:63`).
- `createReminderClient()` runs after both gates, inside the `try` (`appointment.ts:37-43`; `due-screening.ts:34-46`). A missing secret logs `failed` and alerts, and runs skipped by either gate never touch it (invariant I14).
- `isDailySendRun` can throw (`schedule.ts:25-27`). Today it runs inside the job's `try`, so the throw logs `failed`. `scheduledAt` is computed before the `try` (`appointment.ts:36`).
- `eslint.config.js:77-88` turns `no-console` off by file, naming the three job files. A logging runner must be added there.
- `catalog/read.ts:69` can write a plain-string `console.error` on the due job's path (an invalid catalog row, by slug). The test recorder must tolerate non-JSON lines.
- `email-budget.ts:1-2` is the precedent for moving a constant out of `email.ts`.
- `README.md:357` promises that the per-job outcome lines "keep their shape" (I10).

**Invariants:** I1–I14 are defined in `research.md` (Lens 2 table). Plan review F3 added one:

- **I15:** each job resolves to `{ outcome, sent }`, where `sent` is the number of ids Resend accepted when `outcome` is `sent`, and 0 for every other outcome. `chain.ts:39,47` spends the budget from that number.

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

**Guard first.** Phase 1 adds characterization tests that are green on today's code by construction, and proves with a break matrix that they catch a break in each invariant class. Every later phase must leave those test files byte-identical and green, and carries its own deliberate break.

**Then the moves, one phase per PR from phase 3 on** (Migration Notes give the rollback unit):

- Phases 1 and 2 are standalone.
- Phase 3 adds `runner.ts` and `deps.ts` with no consumer. Production behaviour cannot change.
- Phases 4, 5 and 6 move one job each. Each phase edits only:
  - its job file;
  - its own line in the `no-console` allow-list.

  So any one of them reverts without touching the other two.

- Phase 7 (7a) extracts the appointment builder and phase 8 (7b) the due builder. Revert phase 7 (7a) before phase 4, and phase 8 (7b) before phase 6.
- Phase 3 reverts only after phases 4, 5 and 6 are reverted.

**Runner contract.** Other phases depend on it, so here it is:

```ts
// src/lib/reminders/runner.ts — pure: no astro:*, no admin client
import type { ReminderRun } from "@/lib/reminders/chain";
export type ReminderOutcome = "none" | "skipped" | "dry-run" | "sent";
export interface ReminderDeps {
  client: () => SupabaseClient<Database>; // called after both gates, inside the try (I14)
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
): Promise<{ outcome: ReminderOutcome; sent: number }>; // I15
```

**Log line shape.** The runner logs `{ event, outcome, cron, scheduledAt, ...fields, due, sent }`, with `fields` (the due job's `candidates`) placed between `scheduledAt` and `due`. A `failed` line is `{ event, outcome: "failed", cron, scheduledAt, error: errorName(e), ...errorDetails(e) }`, with no `fields`.

## Critical Implementation Details

- **Timing & lifecycle.**
  - `scheduledAt` is computed before the `try`.
  - The `try` wraps everything from the send gate on (step 1 of the runner), so a throwing `isDailySendRun` logs `failed`, as today.
  - `deps.client()` is called after both gates and inside the `try`. An eager client, or one called between the gates, would change I14. With a missing secret, budget-0 due and nudge runs would log `failed` and alert, turning 1 alert into 3 (I5).
  - `deps.site` comes from `reminderDeps()`, which each job calls once per run. Phase 1 records whether today's build inlines `SITE`, and phase 4 re-checks the whole server output.
- **Debug & observability.**
  - The characterization tests capture `console.log`/`console.error` in order. JSON lines are compared as parsed objects with `toEqual`, so key order is not asserted. Non-JSON lines are kept raw.
  - Key order is kept anyway (above), because `README.md:357` promises shape.
  - The `email` dry-run line comes from `email.ts`, and the tests must keep capturing it, because it proves the real sender ran.

## Phase 1: Characterization tests of today's jobs

### Overview

Pin current behaviour of the three jobs with no source change. Prove with a break matrix that the tests catch each invariant class, and record the `SITE` build baseline. These test files are the guard for every later phase.

### Changes Required:

#### 1. Transcript test helper

**File**: `src/lib/reminders/transcript.test-helper.ts` (new; not matched by Vitest's `src/**/*.test.ts` include, imported by the three test files)

**Intent**: One recorder shared by the three job tests, so each test states its scenario and its expectations, not plumbing.

**Contract**: The helper exports:

- `fakeClient(replies, calls)`: answers `.rpc(name, args)` and `.from(table).select(cols).eq(col, val)` from a reply map keyed by RPC name or `from:<table>`, recording each call.
- `stubResend(mode)`: `"ok" | 500 | "missing-id"`. It records URL, `Idempotency-Key` and parsed body.
- `record(invoke)`: returns `{ result | error, thrown, logs, calls, fetches }`.
  - `error` is `{ name, step, code, operation, status, resendError }`; `thrown` is the caught object itself, for `toBe`.
  - `console.log`/`console.error` lines are parsed as JSON when they parse, and kept as raw strings otherwise.
  - The privacy check covers both kinds of line.
- Shared fixtures: claimed rows for each job, valid candidate rows and an active catalog row (pattern: `candidates.test.ts:9-31`), plus the leaky inputs:
  - an RPC error object whose `message` holds an address;
  - a Resend 500 body whose `message` holds an address;
  - a candidate completion slug used as a canary.

#### 2. Job characterization tests

**Files**: `src/lib/reminders/appointment.test.ts`, `src/lib/reminders/due-screening.test.ts`, `src/lib/reminders/follow-up-nudge.test.ts` (new)

**Intent**: Run each exported job function exactly as `worker.ts` calls it and assert the invariants (I1–I15) explicitly. Add one strict `toEqual` transcript per job for the `sent` scenario (decided by the orchestrator).

**Contract**:

- **Mocks in each file:**
  - `vi.mock("astro:env/server")` with a getter for `EMAIL_DRY_RUN` (scenario-controlled), test `EMAIL_FROM`/`RESEND_API_KEY`, and `REMINDER_TEST_TO` set to a sentinel address;
  - `vi.mock("@/lib/reminders/admin-client", importOriginal)`, keeping the real `ReminderConfigError` and replacing only `createReminderClient` (scenario: fake client or throw);
  - `vi.mock("@/lib/schedule", importOriginal)`, wrapping the real `isDailySendRun` in a `vi.fn` so a single scenario can make it throw;
  - `vi.stubEnv("SITE", "https://dbam.example")`.
- **Run times:** `scheduledTime: 1790841600000`, as in `chain.test.ts:7` and the CI dry run. That is 10:00 Warsaw with cron `0 8,9 * * *`.
- **Every non-throwing row asserts `result` with `toEqual` (I15).** Every throwing row asserts exactly one `failed` line and a rethrow (I6).
- **Scenarios for every job, with their assertions:**

  | Scenario                                        | Invariants   | What is asserted                                                                                                                                                                                                                                                                                                                             |
  | ----------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `*/30 * * * *` cron; the 11:00 Warsaw daily run | gate, I15    | `{ outcome: "skipped", sent: 0 }`, 0 RPC calls, 0 fetches                                                                                                                                                                                                                                                                                    |
  | `isDailySendRun` throws                         | I6           | one `failed` line; the thrown object rethrown (`toBe`)                                                                                                                                                                                                                                                                                       |
  | empty claim                                     | I15          | `{ outcome: "none", sent: 0 }`, log fields `due: 0, sent: 0`                                                                                                                                                                                                                                                                                 |
  | dry run with rows                               | I1–I3, I15   | `{ outcome: "dry-run", sent: 0 }`. The claim is called (I2). No fetch, no mark. The `email` dry-run line with `count` precedes the job's `dry-run` line                                                                                                                                                                                      |
  | sent                                            | I4, I13, I15 | **`toEqual` on the full transcript**: result `{ outcome: "sent", sent: <accepted ids> }`, logs, RPC calls with arguments, and the one fetch's URL, key and body. Recipients are the row emails, never `REMINDER_TEST_TO` (I4). Key matches `^<prefix>:[0-9a-f]{64}$` and is pinned (I13). Mark gets the claim's ids flattened in claim order |
  | claim error                                     | I6, I8       | `ReminderDatabaseError` step `claim`                                                                                                                                                                                                                                                                                                         |
  | Resend 500                                      | I6           | `EmailSendError` with status and `resendError`; no mark                                                                                                                                                                                                                                                                                      |
  | Resend 200 with missing ids                     | I6           | `EmailSendError` `missing_id`; no mark                                                                                                                                                                                                                                                                                                       |
  | mark error                                      | I6, I8       | `ReminderDatabaseError` step `mark`                                                                                                                                                                                                                                                                                                          |
  | `createReminderClient` throws on a daily run    | I6, I14      | one `failed` line with `ReminderConfigError`; the test's own error instance rethrown (`toBe`)                                                                                                                                                                                                                                                |
  | `createReminderClient` throws on a skipped run  | I14, I15     | `{ outcome: "skipped", sent: 0 }`, no throw                                                                                                                                                                                                                                                                                                  |

- **Due and nudge jobs also cover:**
  - budget 0 gives `{ outcome: "skipped", sent: 0 }` with `reason: "no-budget"` and 0 RPC calls;
  - **budget 0 with `createReminderClient` throwing** gives `{ outcome: "skipped", sent: 0 }`, no throw, and the client factory not called (I14);
  - nudge with budget 250 claims with `p_limit: 100`.
- **The due job also covers:**
  - 0 candidates;
  - a candidates RPC error (step `candidates`);
  - an invalid candidate row (code `invalid`);
  - a catalog read error (`DatabaseError`, operation `read-catalog`);
  - a candidate not yet due (`none` with `candidates: 1`);
  - budget 1 claims 1 item.
- **Privacy (lessons.md "privacy tests are the guard"; I7, I9):** with the leaky inputs, the captured lines (parsed and raw) contain no `@` or canary slug, and the emails contain no slug. These are tests, not greps.
- **What stays with the existing tests:** I5 and I11 remain covered by `chain.test.ts`, and I12 by `src/lib/screenings/due.perf.test.ts`. Neither file changes.

#### 3. Break matrix (temporary edits, all reverted)

**Intent**: Prove the guard is not vacuous: each class of regression the refactor could introduce fails at least one test (plan review F2).

**Contract**: Make each break below in one job, run that job's test file, confirm it fails, then revert the break before the next one. None of these edits is committed.

| Break                                               | Invariant |
| --------------------------------------------------- | --------- |
| Swap the order of mark and send                     | ordering  |
| Remove the `"dryRun" in result` return              | I1        |
| Send to `REMINDER_TEST_TO` instead of the row email | I4        |
| `throw new Error("x", { cause })` in the catch      | I6        |
| Add `message` to the `failed` line                  | I7        |
| Change the key prefix                               | I13       |
| Move `createReminderClient()` above the gate        | I14       |

#### 4. `SITE` build baseline

**Intent**: Know whether today's build already inlines `SITE`, so phase 4's check has a baseline (plan review F5).

**Contract**: Run `npm run build` on the phase 1 tree, then over the whole server output:

- `grep -rl "https://dbam.amadeuszkozlowski.workers.dev" dist/`: is the URL present?
- `grep -rl "import.meta.env.SITE" dist/`: is the expression absent?

Record both results in `decisions.md` as the baseline.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including the three new job test files, and no file under `src/` changes other than the 4 new test files
- `npm run lint` passes with no errors in the new files
- `npx astro check` passes
- A deliberate mark/send swap fails the guard and is reverted before commit
- A deliberate removal of the dry-run return fails the guard and is reverted before commit
- A deliberate send to `REMINDER_TEST_TO` fails the guard and is reverted before commit
- A deliberate wrapped error in the catch fails the guard and is reverted before commit
- A deliberate `message` in the `failed` line fails the guard and is reverted before commit
- A deliberate key-prefix change fails the guard and is reverted before commit
- A deliberate client call above the gate fails the guard and is reverted before commit
- The `SITE` build baseline (URL present, `import.meta.env.SITE` absent, whole server output) is recorded in `decisions.md`

#### Manual Verification:

- A reviewer reads the `sent` transcripts and confirms that the pinned email texts are today's copy for pl and en, with no exam name

**Implementation Note**: Pause after this phase for the manual check before phase 2.

---

## Phase 2: Move `MAX_BATCH_SIZE` into `email-budget.ts`

### Overview

Keep the nudge spec's value import off `email.ts`, so that a later split of a spec out of its job file stays mock-free. The runner itself needs only types from `email`, so it does not depend on this phase. The phase is kept because it is cheap and harmless (plan review F6).

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
- A deliberate `MAX_BATCH_SIZE = 99` fails the nudge budget-250 case and is reverted before commit

---

## Phase 3: Add the pure runner and the production deps

### Overview

Add `runner.ts`, its unit tests and `deps.ts`. No job uses them yet, so production behaviour cannot change in this phase.

### Changes Required:

#### 1. Runner

**File**: `src/lib/reminders/runner.ts` (new)

**Intent**: The one skeleton. `scheduledAt` is computed first, outside the `try`. Then, inside one `try` that starts at step 1:

1. send gate (`isDailySendRun`);
2. optional budget gate;
3. `deps.client()`;
4. `select`;
5. empty rows give `none`;
6. ids, `batchKey`, `deps.send`;
7. `"dryRun" in result` gives `dry-run` with no mark;
8. mark RPC (an error gives `ReminderDatabaseError("mark", code)`);
9. `sent`.

The `catch` logs one `failed` line and rethrows the caught object itself, with no wrapping.

**Contract**: The runner contract above. It imports only pure modules: `schedule`, `batch-key`, `errors`, `observability`, and types from `email`, `database.types` and `chain` (`ReminderRun`). The header comment carries over the privacy rule from the job headers (`appointment.ts:18-19`).

#### 2. Runner tests

**File**: `src/lib/reminders/runner.test.ts` (new)

**Intent**: Prove the skeleton with a fake spec and fake deps, with **no `astro:*` mock**. That proves the module is pure.

**Contract**: The test covers:

- the gate with no budget (budget `undefined` never gates);
- budget 0 gives `no-budget`;
- the client is called once and only after both gates;
- `fields` spread into `none`/`dry-run`/`sent` lines before `due`;
- the returned `{ outcome, sent }` for every outcome (I15);
- the dry run never marks;
- mark ids equal the flattened `ids` in row order;
- a throwing gate logs `failed`;
- a thrown error is rethrown by identity (`toBe`) after one `failed` line;
- a leaky error's message never reaches the log line.

#### 3. Production deps

**File**: `src/lib/reminders/deps.ts` (new; moved here from phase 4 by plan review F1)

**Intent**: One place that binds the real collaborators, so the three job files don't repeat them. It has no consumer in this phase.

**Contract**: `reminderDeps(): ReminderDeps` returns:

- `client: createReminderClient` (the function, not a client);
- `send: sendEmailBatch`;
- `site: import.meta.env.SITE`.

This module imports `astro:env` through its imports, so it is wiring, not pure.

Each job will call `reminderDeps()` once per run, never at module load. The phase 1 tests mock `createReminderClient` and stub `SITE` per scenario, and they depend on the deps being read at run time.

#### 4. Lint allow-list

**File**: `eslint.config.js`

**Intent**: The runner logs to Workers Logs through `console`, like the jobs.

**Contract**: Add `src/lib/reminders/runner.ts` to `workerLogsConfig.files` (`eslint.config.js:77-88`). The job entries stay until their own phase.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including `runner.test.ts`, and the phase 1 test files are unchanged
- `runner.test.ts` contains no `vi.mock("astro:` call and still passes
- `npm run lint` and `npx astro check` pass
- A deliberate mark before the dry-run check in `runner.ts` fails `runner.test.ts` and is reverted before commit

---

## Phase 4: Appointment job on the runner

### Overview

The first job moves onto the runner. It is the simplest, with one select step and no budget gate.

### Changes Required:

#### 1. Appointment job

**File**: `src/lib/reminders/appointment.ts`

**Intent**: Replace the hand-written body with a spec (`appointmentJob`) and one call to `runClaimSendMark(appointmentJob, run, undefined, reminderDeps())`. Keep the private `buildMessage` for now, adapted to receive `site` from the spec's `message(row, site)`. Remove the local `log` helper.

**Contract**:

- Unchanged:
  - `runAppointmentReminders({ cron, scheduledTime }): Promise<{ outcome; sent }>`;
  - `APPOINTMENT_REMINDER_LEAD_DAYS`;
  - claim arguments (`p_limit: REMINDER_EMAIL_DAILY_BUDGET`);
  - key prefix `dbam-appointment-reminder`;
  - event `appointment-reminder`.
- `AppointmentReminderOutcome` remains exported as an alias of `ReminderOutcome`.
- The header comment stays, trimmed of skeleton details now documented in `runner.ts`.

#### 2. Lint allow-list

**File**: `eslint.config.js`

**Intent**: The job file no longer logs, so remove only `src/lib/reminders/appointment.ts` from `workerLogsConfig.files`. Lint then flags any `console` call that creeps back.

**Contract**: One line removed. The nudge and due entries stay.

#### 3. Verify `SITE` in the built Worker

**Intent**: Turn the research's inference into a checked fact (orchestrator decision 3), against the phase 1 baseline.

**Contract**: After `npm run build`, over the whole server output under `dist/`:

- `https://dbam.amadeuszkozlowski.workers.dev` is present;
- `import.meta.env.SITE` is absent.

The result must equal the phase 1 baseline. If it differs, stop the phase: do not ship it, and record a decision in `decisions.md` before continuing.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, and `appointment.test.ts` is unchanged since phase 1
- `npm run lint` and `npx astro check` pass
- `npm run build` succeeds, and the whole-output `SITE` check matches the phase 1 baseline
- `appointment.ts` contains no `console.` call and no `sendEmailBatch(` call
- A deliberate break in `runner.ts` fails `runner.test.ts` and `appointment.test.ts` and is reverted before commit

#### Manual Verification:

- After this phase's deploy, the next 10:00 Warsaw run's `appointment-reminder` line has the same fields as the pre-deploy run, with no `error` line. This gates phase 5

---

## Phase 5: Follow-up nudge job on the runner

### Overview

The second job: one select step with a budget gate. `buildNudgeMessage` already has the `(row, site)` shape. Start only after the phase 4 production check has passed.

### Changes Required:

#### 1. Nudge job

**File**: `src/lib/reminders/follow-up-nudge.ts`

**Intent**: Replace the body with `followUpNudgeJob` and one call to `runClaimSendMark(…, budget, reminderDeps())`. Remove the local `log` helper.

**Contract**:

- Unchanged:
  - `runFollowUpNudges(run, { budget })`;
  - claim arguments including `p_limit: Math.min(budget, MAX_BATCH_SIZE)` (TD-6 stays);
  - ids from `nudge_ids`;
  - prefix `dbam-follow-up-nudge`;
  - event `follow-up-nudge`.
- `message: buildNudgeMessage`.
- `FollowUpNudgeOutcome` is aliased.

#### 2. Lint allow-list

**File**: `eslint.config.js`

**Intent**: Remove only `src/lib/reminders/follow-up-nudge.ts` from `workerLogsConfig.files`.

**Contract**: One line removed. The due entry stays.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, and `follow-up-nudge.test.ts` is unchanged since phase 1
- `npm run lint` and `npx astro check` pass
- `follow-up-nudge.ts` contains no `console.` call
- A deliberate break in `runner.ts` fails `runner.test.ts`, `appointment.test.ts` and `follow-up-nudge.test.ts` and is reverted before commit

#### Manual Verification:

- After this phase's deploy, the next 10:00 Warsaw run's `follow-up-nudge` line has the same fields as the pre-deploy run, with no `error` line. This gates phase 6

---

## Phase 6: Due-screening job on the runner

### Overview

The most complex job: its candidates → parse → catalog → decide → claim chain becomes the spec's `select`. Start only after the phase 5 production check has passed.

### Changes Required:

#### 1. Due job

**File**: `src/lib/reminders/due-screening.ts`

**Intent**: Replace the body with `dueScreeningJob` and one call to `runClaimSendMark(…, budget, reminderDeps())`. Remove the local `log` helper. Its `select`:

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

#### 2. Lint allow-list

**File**: `eslint.config.js`

**Intent**: Remove only `src/lib/reminders/due-screening.ts` from `workerLogsConfig.files`.

**Contract**: One line removed. After this phase the list names `runner.ts` and none of the three job files.

### Success Criteria:

#### Automated Verification:

- `npm test` passes, and `due-screening.test.ts` is unchanged since phase 1
- `src/lib/screenings/due.perf.test.ts` passes unchanged (the CPU budget gate, orchestrator decision 2)
- `npm run lint` and `npx astro check` pass
- `npm run build` succeeds
- A deliberate break in `runner.ts` fails `runner.test.ts` and all three job test files and is reverted before commit

#### Manual Verification:

- After this phase's deploy, the next 10:00 Warsaw run's `due-screening-reminder` line has the same fields as the pre-deploy run, with no `error` line
- That run's Workers Logs CPU time stays within the 10 ms cap (I12; joins the open S-06 production CPU check, `context/archive/2026-10-06-due-screening-reminder/decisions.md:82`)

---

## Phase 7: Extract the appointment builder (7a)

### Overview

Move the appointment builder into a pure module, following `nudge-message.ts`, and unit-test its copy and the no-exam-name rule directly. This phase depends on phase 4: revert it before phase 4.

### Changes Required:

#### 1. Builder module

**File**: `src/lib/reminders/appointment-message.ts` (new). `appointment.ts` is edited to import it.

**Intent**: `buildAppointmentMessage(row, site)` is moved verbatim. The module is pure: the `email` import is type-only, and there is no `astro:*` import (header like `nudge-message.ts:4-6`). It defines a minimal row interface, like `NudgeRow`.

**Contract**:

- The message text, subject, recipient and link URLs are byte-identical.
- `APPOINTMENT_REMINDER_LEAD_DAYS` stays in `appointment.ts`, because only the claim uses it.

#### 2. Builder test

**File**: `src/lib/reminders/appointment-message.test.ts` (new)

**Intent**: Pattern `nudge-message.test.ts`.

**Contract**: The test covers:

- pl and en copy;
- plural forms by `reminder_ids.length` (`_one`/`_few`/`_many` for pl);
- the date list;
- dashboard and opt-out links built from `site`;
- an unknown locale falls back to the default;
- the leaky case: a row whose fields carry a catalog slug never puts it in subject or text (I9).

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including `appointment-message.test.ts`, and the phase 1 test files are unchanged
- `npm run lint`, `npx astro check` and `npm run build` pass
- `appointment-message.ts` imports nothing from `astro:*` (its test runs without `vi.mock("astro:`)
- A deliberate slug in the builder text fails `appointment-message.test.ts` and the appointment `sent` transcript and is reverted before commit

---

## Phase 8: Extract the due-screening builder (7b)

### Overview

Move the due builder into a pure module, the same way. This phase depends on phase 6: revert it before phase 6.

### Changes Required:

#### 1. Builder module

**File**: `src/lib/reminders/due-screening-message.ts` (new). `due-screening.ts` is edited to import it.

**Intent**: `buildDueScreeningMessage(row, site)` is moved verbatim into a pure module, with a minimal row interface.

**Contract**: The message text, subject, recipient and link URLs are byte-identical.

#### 2. Builder test

**File**: `src/lib/reminders/due-screening-message.test.ts` (new)

**Intent**: Pattern `nudge-message.test.ts`.

**Contract**: The test covers:

- pl and en copy;
- plural forms by `reminder_ids.length`;
- dashboard and opt-out links built from `site`;
- an unknown locale falls back to the default;
- the leaky slug case (I9).

### Success Criteria:

#### Automated Verification:

- `npm test` passes, including `due-screening-message.test.ts`, and the phase 1 test files are unchanged
- `npm run lint`, `npx astro check` and `npm run build` pass
- `due-screening-message.ts` imports nothing from `astro:*`
- A deliberate slug in the builder text fails `due-screening-message.test.ts` and the due `sent` transcript and is reverted before commit

#### Manual Verification:

- After the last phase's deploy, the next 10:00 Warsaw run logs one `appointment-reminder`, one `due-screening-reminder` and one `follow-up-nudge` line with the same fields as before phase 4, and no `error` line

---

## Testing Strategy

### Unit Tests:

- **Characterization (phase 1):** the guard. Three job test files with explicit per-invariant assertions (I1–I15) and one full `toEqual` transcript per job for `sent`. They stay unchanged from phase 2 on.
- **Break matrix (phase 1)** and **one deliberate break per later phase**, so a green guard is shown to exercise the changed code.
- **The runner (phase 3)**, without `astro:*` mocks.
- **The builders (phases 7 and 8):** copy, plurals, links, and the no-exam-name rule.
- **Unchanged guards:** `chain.test.ts` (I5, I11), `observability.test.ts` (I7), `due.perf.test.ts` (I12) and `candidates.test.ts`.

### Integration Tests:

- None added. The CI step "Exercise scheduled handler (dry run)" (`.github/workflows/ci.yml:72-87`) keeps running the real Worker against local Supabase and must stay green on every phase PR. It asserts only `"outcome":"ok"` and never reaches mark, which is why each job phase also has a production row. DB-level recipient tests remain test-plan Phase 2.

### Manual Testing Steps:

1. Phase 1: review the pinned email copy in the `sent` transcripts.
2. Phases 4, 5 and 6: after each deploy, compare the next 10:00 Warsaw run's line for the moved job with the pre-deploy line. Each passing check gates the next job phase.
3. Phase 6: check that run's CPU time in Workers Logs.
4. Phase 8: the final check of all three lines after the last deploy.

## Performance Considerations

The runner adds one generic call layer and closure per job on a cron run capped at 10 ms CPU (`README.md:316`). `due.perf.test.ts` remains the automated gate. The production CPU check is a phase 6 manual row, the phase where the due job moves. No new dependency, parsing library or `Intl` constructor is added.

## Migration Notes

There is no data or schema migration. Every phase is TypeScript only.

**The rollback unit is one phase, shipped as its own PR from phase 3 on.** Every merge to `main` deploys (CLAUDE.md), so one PR per phase makes one deploy per phase.

**Order of reverts:**

- Phases 1 and 2 revert on their own.
- Phases 4, 5 and 6 each revert on their own (each touches only its job file and its own allow-list line), after the builder phase that depends on it:
  - phase 7 (7a) before phase 4;
  - phase 8 (7b) before phase 6.
- Phase 3 reverts only after phases 4, 5 and 6.

**Procedure when a deployed phase misbehaves:**

1. `wrangler rollback` the Worker to the previous version.
2. Before the next merge to `main`, open a git revert PR of that phase. Otherwise the next deploy ships the bad code again.

**A Worker rollback has limits:**

- **It is per deploy.** Rolling back past later merges also rolls those merges back.
- **It restores code, not data.** Claims and marks written by a faulty run stay in the ledgers. A runner bug that marks without sending consumes those reminders permanently; they are not resent.
- **It is not sticky.** The next deploy replaces it, which is why step 2 is required.

## References

- Research: `context/changes/reminders-refactor/research.md` (Lenses 1–3; invariants I1–I14; spike results)
- Plan review: `context/changes/reminders-refactor/plan-review.md` (F1–F7, all decided)
- Parent research: `context/archive/2026-10-27-reminders-research/research.md` (TD-1, TD-2, TD-3, TD-7, TD-8)
- Decisions: `context/changes/reminders-refactor/decisions.md`
- Patterns: `src/lib/reminders/chain.ts:4-21` (injection), `src/lib/reminders/nudge-message.ts` (pure builder), `src/lib/email-budget.ts` (pure constant), `src/lib/email.test.ts:3-8` (`astro:env` mock)
- Lessons: `context/foundation/lessons.md` ("Grep gates are heuristics; privacy tests are the guard")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Characterization tests of today's jobs

#### Automated

- [ ] 1.1 npm test passes with the three job test files and no other src file changed
- [ ] 1.2 npm run lint passes with no errors in the new files
- [ ] 1.3 npx astro check passes
- [ ] 1.4 A deliberate mark/send swap fails the guard and is reverted before commit
- [ ] 1.6 A deliberate removal of the dry-run return fails the guard and is reverted before commit
- [ ] 1.7 A deliberate send to REMINDER_TEST_TO fails the guard and is reverted before commit
- [ ] 1.8 A deliberate wrapped error in the catch fails the guard and is reverted before commit
- [ ] 1.9 A deliberate message in the failed line fails the guard and is reverted before commit
- [ ] 1.10 A deliberate key-prefix change fails the guard and is reverted before commit
- [ ] 1.11 A deliberate client call above the gate fails the guard and is reverted before commit
- [ ] 1.12 The SITE build baseline is recorded in decisions.md

#### Manual

- [ ] 1.5 Reviewer confirms the pinned sent-transcript email copy is today's pl and en text with no exam name

### Phase 2: Move MAX_BATCH_SIZE into email-budget.ts

#### Automated

- [ ] 2.1 npm test passes with the phase 1 test files unchanged
- [ ] 2.2 npm run lint and npx astro check pass
- [ ] 2.3 email-budget.ts imports nothing from astro:*
- [ ] 2.4 A deliberate MAX_BATCH_SIZE of 99 fails the nudge budget-250 case and is reverted before commit

### Phase 3: Add the pure runner and the production deps

#### Automated

- [ ] 3.1 npm test passes including runner.test.ts with the phase 1 test files unchanged
- [ ] 3.2 runner.test.ts has no astro:* mock and passes
- [ ] 3.3 npm run lint and npx astro check pass
- [ ] 3.4 A deliberate mark before the dry-run check fails runner.test.ts and is reverted before commit

### Phase 4: Appointment job on the runner

#### Automated

- [ ] 4.1 npm test passes with appointment.test.ts unchanged since phase 1
- [ ] 4.2 npm run lint and npx astro check pass
- [ ] 4.3 npm run build succeeds and the whole-output SITE check matches the phase 1 baseline
- [ ] 4.4 appointment.ts has no console call and no direct sendEmailBatch call
- [ ] 4.5 A deliberate runner break fails runner.test.ts and appointment.test.ts and is reverted before commit

#### Manual

- [ ] 4.6 Next 10:00 Warsaw run after deploy logs the appointment-reminder line with unchanged fields and no error line

### Phase 5: Follow-up nudge job on the runner

#### Automated

- [ ] 5.1 npm test passes with follow-up-nudge.test.ts unchanged since phase 1
- [ ] 5.2 npm run lint and npx astro check pass
- [ ] 5.3 follow-up-nudge.ts has no console call
- [ ] 5.4 A deliberate runner break fails runner.test.ts, appointment.test.ts and follow-up-nudge.test.ts and is reverted before commit

#### Manual

- [ ] 5.5 Next 10:00 Warsaw run after deploy logs the follow-up-nudge line with unchanged fields and no error line

### Phase 6: Due-screening job on the runner

#### Automated

- [ ] 6.1 npm test passes with due-screening.test.ts unchanged since phase 1
- [ ] 6.2 due.perf.test.ts passes unchanged
- [ ] 6.3 npm run lint and npx astro check pass
- [ ] 6.4 npm run build succeeds
- [ ] 6.5 A deliberate runner break fails runner.test.ts and all three job test files and is reverted before commit

#### Manual

- [ ] 6.6 Next 10:00 Warsaw run after deploy logs the due-screening-reminder line with unchanged fields and no error line
- [ ] 6.7 That run's Workers Logs CPU time stays within the 10 ms cap

### Phase 7: Extract the appointment builder (7a)

#### Automated

- [ ] 7.1 npm test passes including appointment-message.test.ts with the phase 1 test files unchanged
- [ ] 7.2 npm run lint, npx astro check and npm run build pass
- [ ] 7.3 appointment-message.ts imports nothing from astro:*
- [ ] 7.4 A deliberate slug in the appointment builder fails its test and the appointment sent transcript and is reverted before commit

### Phase 8: Extract the due-screening builder (7b)

#### Automated

- [ ] 8.1 npm test passes including due-screening-message.test.ts with the phase 1 test files unchanged
- [ ] 8.2 npm run lint, npx astro check and npm run build pass
- [ ] 8.3 due-screening-message.ts imports nothing from astro:*
- [ ] 8.4 A deliberate slug in the due builder fails its test and the due sent transcript and is reverted before commit

#### Manual

- [ ] 8.5 First production run after the last deploy logs the three job lines with unchanged fields and no error line
