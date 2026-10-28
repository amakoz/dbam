import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { BatchEmailMessage, SendEmailBatchResult } from "@/lib/email";
import { errorDetails, errorName } from "@/lib/observability";
import { batchKey } from "@/lib/reminders/batch-key";
import type { ReminderRun } from "@/lib/reminders/chain";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import { isDailySendRun } from "@/lib/schedule";

// The one claim → send → mark skeleton of the three daily reminder jobs (appointment, due-screening, follow-up nudge),
// each of which supplies a spec (`ClaimSendMarkJob`) and the collaborators (`ReminderDeps`, bound in `deps.ts`). The
// database decides who is due and returns each user's account email; the runner sends one email per user in one
// Resend batch, then marks the reminders sent. A failed send leaves them unsent for the next run, and a retry of the
// same run reuses the batch key, so Resend deduplicates it. With EMAIL_DRY_RUN=true the sender reports a dry run and
// nothing is marked. Pure: no `astro:*` or admin-client import, so Vitest covers it with fakes. Logs carry counts and
// error names only, never recipients, subjects or error messages.

export type ReminderOutcome = "none" | "skipped" | "dry-run" | "sent";

export interface ReminderDeps {
  /** Called after both gates, inside the `try`: a missing secret fails only a run that would have sent (I14). */
  client: () => SupabaseClient<Database>;
  send: (batch: { messages: BatchEmailMessage[]; idempotencyKey: string }) => Promise<SendEmailBatchResult>;
  site: string;
}

export interface ClaimSendMarkJob<Row> {
  event: "appointment-reminder" | "due-screening-reminder" | "follow-up-nudge";
  keyPrefix: string;
  /** Finds who is due and claims them. `fields` are extra counts for the log line (the due job's `candidates`). */
  select: (
    client: SupabaseClient<Database>,
    ctx: { now: Date; budget: number | undefined },
  ) => Promise<{ rows: Row[]; fields?: Record<string, number> }>;
  ids: (row: Row) => number[];
  message: (row: Row, site: string) => BatchEmailMessage;
  mark: "mark_appointment_reminders_sent" | "mark_due_screening_reminders_sent" | "mark_follow_up_nudges_sent";
}

/**
 * Runs one job. `budget` is how many emails the run may still send: `undefined` means no budget gate (the appointment
 * job), a number gates `<= 0` as `reason: "no-budget"`. `sent` is the number of ids Resend accepted when the outcome
 * is `sent`, and 0 for every other outcome: the chain spends the budget from it (I15). A failure logs one `failed`
 * line and rethrows the caught error itself.
 */
export async function runClaimSendMark<Row>(
  job: ClaimSendMarkJob<Row>,
  { cron, scheduledTime }: ReminderRun,
  budget: number | undefined,
  deps: ReminderDeps,
): Promise<{ outcome: ReminderOutcome; sent: number }> {
  const scheduledAt = new Date(scheduledTime).toISOString();
  const log = (fields: Record<string, string | number>) => {
    console.log(JSON.stringify({ event: job.event, ...fields }));
  };
  try {
    if (!isDailySendRun(cron, scheduledTime)) {
      log({ outcome: "skipped", cron, scheduledAt });
      return { outcome: "skipped", sent: 0 };
    }
    if (budget !== undefined && budget <= 0) {
      log({ outcome: "skipped", cron, scheduledAt, reason: "no-budget" });
      return { outcome: "skipped", sent: 0 };
    }

    const client = deps.client();
    const { rows, fields } = await job.select(client, { now: new Date(scheduledTime), budget });
    if (rows.length === 0) {
      log({ outcome: "none", cron, scheduledAt, ...fields, due: 0, sent: 0 });
      return { outcome: "none", sent: 0 };
    }

    const ids = rows.flatMap((row) => job.ids(row));
    const result = await deps.send({
      messages: rows.map((row) => job.message(row, deps.site)),
      idempotencyKey: await batchKey(job.keyPrefix, ids),
    });
    if ("dryRun" in result) {
      // Marks nothing, so local and CI runs never consume reminders.
      log({ outcome: "dry-run", cron, scheduledAt, ...fields, due: rows.length, sent: 0 });
      return { outcome: "dry-run", sent: 0 };
    }

    const marked = await client.rpc(job.mark, { p_ids: ids });
    if (marked.error) {
      throw new ReminderDatabaseError("mark", marked.error.code);
    }
    log({ outcome: "sent", cron, scheduledAt, ...fields, due: rows.length, sent: result.ids.length });
    return { outcome: "sent", sent: result.ids.length };
  } catch (error) {
    // The error name and the whitelisted details only (src/lib/observability.ts), never `message`.
    log({ outcome: "failed", cron, scheduledAt, error: errorName(error), ...errorDetails(error) });
    throw error;
  }
}
