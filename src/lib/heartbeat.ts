import { EMAIL_DRY_RUN, REMINDER_TEST_TO } from "astro:env/server";
import { sendEmail } from "@/lib/email";
import { errorDetails, errorName } from "@/lib/observability";
import { DAILY_CRON, isDailySendRun, PROVING_CRON } from "@/lib/schedule";

// Heartbeat job run by the Worker's Cron Trigger (`scheduled()` in src/worker.ts). It proves that a scheduled run can
// deliver email in production. The proving schedule sends on every run; the daily schedule sends only on the run that
// is 10:00 in Warsaw (src/lib/schedule.ts). Logs never contain the recipient address.

export type HeartbeatOutcome = "sent" | "skipped" | "dry-run";

// Resend's simulator address: accepts sends without reaching an inbox.
const DRY_RUN_RECIPIENT = "delivered@resend.dev";

/** `scheduled()` was invoked with a cron string this job does not know. */
export class UnknownCronError extends Error {
  override name = "UnknownCronError";
}

/** A secret the heartbeat needs is missing on the Worker. */
export class HeartbeatConfigError extends Error {
  override name = "HeartbeatConfigError";
}

export async function runHeartbeat({
  cron,
  scheduledTime,
}: {
  cron: string;
  scheduledTime: number;
}): Promise<HeartbeatOutcome> {
  const scheduledAt = new Date(scheduledTime).toISOString();
  try {
    if (!shouldSend(cron, scheduledTime)) {
      log({ outcome: "skipped", cron, scheduledAt });
      return "skipped";
    }
    const result = await sendEmail({
      to: recipient(),
      subject: "Dbam heartbeat",
      text: `Dbam heartbeat: the scheduled reminder path ran.\n\nCron: ${cron}\nScheduled time: ${scheduledAt}\n`,
      idempotencyKey: `dbam-heartbeat:${cron}:${scheduledTime}`,
    });
    if ("dryRun" in result) {
      log({ outcome: "dry-run", cron, scheduledAt });
      return "dry-run";
    }
    log({ outcome: "sent", cron, scheduledAt, resendId: result.id });
    return "sent";
  } catch (error) {
    // The error name and the whitelisted details only (src/lib/observability.ts), never `message`: messages (e.g. from
    // Postgres or Resend) can quote user data, and Workers Logs must not hold it.
    log({ outcome: "failed", cron, scheduledAt, error: errorName(error), ...errorDetails(error) });
    throw error;
  }
}

function shouldSend(cron: string, scheduledTime: number): boolean {
  switch (cron) {
    case PROVING_CRON:
      return true;
    case DAILY_CRON:
      return isDailySendRun(cron, scheduledTime);
    default:
      throw new UnknownCronError(`No job for cron "${cron}"`);
  }
}

function recipient(): string {
  if (REMINDER_TEST_TO) {
    return REMINDER_TEST_TO;
  }
  if (EMAIL_DRY_RUN) {
    return DRY_RUN_RECIPIENT;
  }
  throw new HeartbeatConfigError("REMINDER_TEST_TO is not set");
}

function log(fields: Record<string, string>): void {
  console.log(JSON.stringify({ event: "heartbeat", ...fields }));
}
