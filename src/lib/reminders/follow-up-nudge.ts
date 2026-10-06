import { MAX_BATCH_SIZE, sendEmailBatch } from "@/lib/email";
import { errorDetails, errorName } from "@/lib/observability";
import { createReminderClient } from "@/lib/reminders/admin-client";
import { batchKey } from "@/lib/reminders/batch-key";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import { buildNudgeMessage, CONFIRM_NUDGE_AFTER_DAYS, SCHEDULE_NUDGE_AFTER_DAYS } from "@/lib/reminders/nudge-message";
import { isDailySendRun } from "@/lib/schedule";
import { warsawToday } from "@/lib/screenings/rules";

// Follow-up nudge job (S-07), run by the Worker's Cron Trigger after the appointment and due-screening jobs on the daily
// 10:00 Warsaw run (`runReminderChain`, src/lib/reminders/chain.ts). It emails a user when a planned exam has had no
// appointment date for SCHEDULE_NUDGE_AFTER_DAYS days (FR-011) or an appointment date passed CONFIRM_NUDGE_AFTER_DAYS
// days ago without a confirmation (FR-012). The database decides who is due (`claim_follow_up_nudges`: opted in,
// active consent, an active catalog entry, not yet nudged for that cycle, and no appointment or due-screening email
// already sent that Warsaw day) and returns each user's account email with a count per kind. The job sends one email per
// user in one Resend batch, then marks the nudges sent. A failed send leaves them unsent for the next run, and a
// retry of the same run reuses the batch key, so Resend deduplicates it. With EMAIL_DRY_RUN=true nothing is sent and
// nothing is marked. The job gets what is left of the daily email budget and claims at most that many users. Emails
// and logs never name an exam: logs carry counts and error names only, never recipients, subjects or error messages.

export type FollowUpNudgeOutcome = "none" | "skipped" | "dry-run" | "sent";

/** `budget` is how many emails this run may still send today; `sent` is how many Resend accepted. */
export async function runFollowUpNudges(
  { cron, scheduledTime }: { cron: string; scheduledTime: number },
  { budget }: { budget: number },
): Promise<{ outcome: FollowUpNudgeOutcome; sent: number }> {
  const scheduledAt = new Date(scheduledTime).toISOString();
  try {
    if (!isDailySendRun(cron, scheduledTime)) {
      log({ outcome: "skipped", cron, scheduledAt });
      return { outcome: "skipped", sent: 0 };
    }
    if (budget <= 0) {
      log({ outcome: "skipped", cron, scheduledAt, reason: "no-budget" });
      return { outcome: "skipped", sent: 0 };
    }

    const supabase = createReminderClient();
    const { data: claimed, error } = await supabase.rpc("claim_follow_up_nudges", {
      p_today: warsawToday(new Date(scheduledTime)),
      p_schedule_after: SCHEDULE_NUDGE_AFTER_DAYS,
      p_confirm_after: CONFIRM_NUDGE_AFTER_DAYS,
      p_limit: Math.min(budget, MAX_BATCH_SIZE),
    });
    if (error) {
      throw new ReminderDatabaseError("claim", error.code);
    }

    if (claimed.length === 0) {
      log({ outcome: "none", cron, scheduledAt, due: 0, sent: 0 });
      return { outcome: "none", sent: 0 };
    }

    const ids = claimed.flatMap((row) => row.nudge_ids);
    const site = import.meta.env.SITE;
    const result = await sendEmailBatch({
      messages: claimed.map((row) => buildNudgeMessage(row, site)),
      idempotencyKey: await batchKey("dbam-follow-up-nudge", ids),
    });
    if ("dryRun" in result) {
      // Marks nothing, so local and CI runs never consume nudges.
      log({ outcome: "dry-run", cron, scheduledAt, due: claimed.length, sent: 0 });
      return { outcome: "dry-run", sent: 0 };
    }

    const marked = await supabase.rpc("mark_follow_up_nudges_sent", { p_ids: ids });
    if (marked.error) {
      throw new ReminderDatabaseError("mark", marked.error.code);
    }
    log({ outcome: "sent", cron, scheduledAt, due: claimed.length, sent: result.ids.length });
    return { outcome: "sent", sent: result.ids.length };
  } catch (error) {
    // The error name and the whitelisted details only (src/lib/observability.ts), never `message`.
    log({ outcome: "failed", cron, scheduledAt, error: errorName(error), ...errorDetails(error) });
    throw error;
  }
}

function log(fields: Record<string, string | number>): void {
  console.log(JSON.stringify({ event: "follow-up-nudge", ...fields }));
}
