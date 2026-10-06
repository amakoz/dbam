import { EMAIL_DRY_RUN, REMINDER_TEST_TO } from "astro:env/server";
import { sendEmail } from "@/lib/email";
import { buildReminderFailureEmail, errorDetails, errorName, isoTime, type ReminderJob } from "@/lib/observability";

// Best-effort email to the owner when a reminder job (appointment or due-screening) fails; `runReminderChain`
// (src/lib/reminders/chain.ts) calls it once per failed job. It never throws, so it cannot mask the failure it
// reports, and it logs its own outcome so a failed alert is visible too. Logs never contain the recipient, subject or
// text.

// Resend's simulator address: accepts sends without reaching an inbox.
const DRY_RUN_RECIPIENT = "delivered@resend.dev";

export async function sendReminderFailureAlert(
  { cron, scheduledTime }: { cron: string; scheduledTime: number },
  job: ReminderJob,
  error: unknown,
): Promise<void> {
  const scheduledAt = isoTime(scheduledTime);
  try {
    const to = REMINDER_TEST_TO ?? (EMAIL_DRY_RUN ? DRY_RUN_RECIPIENT : undefined);
    if (!to) {
      console.error(
        JSON.stringify({ event: "failure-alert", outcome: "skipped", job, cron, scheduledAt, reason: "no-recipient" }),
      );
      return;
    }
    const result = await sendEmail({ to, ...buildReminderFailureEmail({ job, error, cron, scheduledTime }) });
    if ("dryRun" in result) {
      console.log(JSON.stringify({ event: "failure-alert", outcome: "dry-run", job, cron, scheduledAt }));
      return;
    }
    console.log(
      JSON.stringify({ event: "failure-alert", outcome: "sent", job, cron, scheduledAt, resendId: result.id }),
    );
  } catch (alertError) {
    // The name and the whitelisted details only, never `message` (Resend's can quote addresses).
    console.error(
      JSON.stringify({
        event: "failure-alert",
        outcome: "failed",
        job,
        cron,
        scheduledAt,
        error: errorName(alertError),
        ...errorDetails(alertError),
      }),
    );
  }
}
