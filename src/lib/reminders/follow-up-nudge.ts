import type { Database } from "@/lib/database.types";
import { MAX_BATCH_SIZE } from "@/lib/email-budget";
import type { ReminderRun } from "@/lib/reminders/chain";
import { reminderDeps } from "@/lib/reminders/deps";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import { buildNudgeMessage, CONFIRM_NUDGE_AFTER_DAYS, SCHEDULE_NUDGE_AFTER_DAYS } from "@/lib/reminders/nudge-message";
import { runClaimSendMark, type ClaimSendMarkJob, type ReminderOutcome } from "@/lib/reminders/runner";
import { warsawToday } from "@/lib/screenings/rules";

// Follow-up nudge job (S-07), run by the Worker's Cron Trigger after the appointment and due-screening jobs on the daily
// 10:00 Warsaw run (`runReminderChain`, src/lib/reminders/chain.ts). It emails a user when a planned exam has had no
// appointment date for SCHEDULE_NUDGE_AFTER_DAYS days (FR-011) or an appointment date passed CONFIRM_NUDGE_AFTER_DAYS
// days ago without a confirmation (FR-012). The database decides who is due (`claim_follow_up_nudges`: opted in,
// active consent, an active catalog entry, not yet nudged for that cycle, and no appointment or due-screening email
// already sent that Warsaw day) and returns each user's account email with a count per kind. The shared runner
// (src/lib/reminders/runner.ts) sends one email per user in one Resend batch, then marks the nudges sent. The job gets
// what is left of the daily email budget and claims at most that many users. Emails and logs never name an exam: logs
// carry counts and error names only, never recipients, subjects or error messages.

export type FollowUpNudgeOutcome = ReminderOutcome;

type ClaimedNudge = Database["public"]["Functions"]["claim_follow_up_nudges"]["Returns"][number];

const followUpNudgeJob: ClaimSendMarkJob<ClaimedNudge> = {
  event: "follow-up-nudge",
  keyPrefix: "dbam-follow-up-nudge",
  select: async (client, { now, budget }) => {
    const { data, error } = await client.rpc("claim_follow_up_nudges", {
      p_today: warsawToday(now),
      p_schedule_after: SCHEDULE_NUDGE_AFTER_DAYS,
      p_confirm_after: CONFIRM_NUDGE_AFTER_DAYS,
      // The runner has already skipped a run without budget, so `budget` is a number here.
      p_limit: Math.min(budget ?? 0, MAX_BATCH_SIZE),
    });
    if (error) {
      throw new ReminderDatabaseError("claim", error.code);
    }
    return { rows: data };
  },
  ids: (row) => row.nudge_ids,
  message: buildNudgeMessage,
  mark: "mark_follow_up_nudges_sent",
};

/** `budget` is how many emails this run may still send today; `sent` is how many Resend accepted. */
export function runFollowUpNudges(
  run: ReminderRun,
  { budget }: { budget: number },
): Promise<{ outcome: FollowUpNudgeOutcome; sent: number }> {
  return runClaimSendMark(followUpNudgeJob, run, budget, reminderDeps());
}
