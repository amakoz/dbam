import { EMAIL_DRY_RUN, REMINDER_TEST_TO } from "astro:env/server";
import { EmailSendError, sendEmail } from "@/lib/email";

// Heartbeat job run by the Worker's Cron Trigger (`scheduled()` in src/worker.ts). It proves that a scheduled run can
// deliver email in production. Cron runs in UTC only, so the daily schedule fires at 08:00 and 09:00 UTC and sends only
// on the run that is 10:00 in Warsaw, which holds in both CEST and CET. Logs never contain the recipient address.

/** Proving schedule: every run sends. */
export const HEARTBEAT_CRON_PROVING = "*/30 * * * *";
/** Daily schedule: two UTC runs, one of which is 10:00 Europe/Warsaw. */
export const HEARTBEAT_CRON_DAILY = "0 8,9 * * *";

export type HeartbeatOutcome = "sent" | "skipped" | "dry-run";

const DAILY_SEND_HOUR = 10;
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
    // Error names and Resend's status/error name only, never `message`: once reminder jobs reuse this path, messages
    // (e.g. from Postgres) can quote user data, and Workers Logs must not hold it.
    const details: Record<string, string> =
      error instanceof EmailSendError ? { status: String(error.status), resendError: error.resendError } : {};
    log({
      outcome: "failed",
      cron,
      scheduledAt,
      error: error instanceof Error ? error.name : "UnknownError",
      ...details,
    });
    throw error;
  }
}

function shouldSend(cron: string, scheduledTime: number): boolean {
  switch (cron) {
    case HEARTBEAT_CRON_PROVING:
      return true;
    case HEARTBEAT_CRON_DAILY:
      return warsawHour(scheduledTime) === DAILY_SEND_HOUR;
    default:
      throw new UnknownCronError(`No job for cron "${cron}"`);
  }
}

function warsawHour(time: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(time);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  // A NaN hour would silently skip every daily run; fail the run instead so it shows in Trigger Events.
  if (!Number.isFinite(hour)) {
    throw new Error("Could not read the Europe/Warsaw hour");
  }
  return hour;
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
