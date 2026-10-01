import { createT, resolveLocale } from "@/i18n";
import type { Database } from "@/lib/database.types";
import { EmailSendError, MAX_BATCH_SIZE, sendEmailBatch, type BatchEmailMessage } from "@/lib/email";
import { createReminderClient } from "@/lib/reminders/admin-client";
import { isDailySendRun } from "@/lib/schedule";
import { formatDay } from "@/lib/screenings/format";
import { warsawToday } from "@/lib/screenings/rules";

// Appointment reminder job run by the Worker's Cron Trigger (`scheduled()` in src/worker.ts) on the daily 10:00 Warsaw
// run. The database decides who is due (`claim_due_appointment_reminders`: opted in, active consent, a plan dated 1–3
// days ahead, not yet reminded for that date) and returns each user's account email. The job sends one email per
// user in one Resend batch, then marks the reminders sent. A failed send leaves them unsent for the next run, and
// a retry of the same run reuses the batch key, so Resend deduplicates it. With EMAIL_DRY_RUN=true nothing is sent and
// nothing is marked. Emails and logs never name an exam; logs carry counts and error names only, never recipients,
// subjects or error messages.

/** Remind a plan when its appointment is 1 to this many Warsaw days ahead. */
export const APPOINTMENT_REMINDER_LEAD_DAYS = 3;

export type AppointmentReminderOutcome = "none" | "skipped" | "dry-run" | "sent";

type ClaimedReminder = Database["public"]["Functions"]["claim_due_appointment_reminders"]["Returns"][number];

/** A reminder database call failed. Carries the SQLSTATE only, never Postgres' message (it can quote row values). */
export class ReminderDatabaseError extends Error {
  override name = "ReminderDatabaseError";

  constructor(
    readonly step: "claim" | "mark",
    readonly code: string,
  ) {
    super(`Reminder ${step} failed (${code})`);
  }
}

export async function runAppointmentReminders({
  cron,
  scheduledTime,
}: {
  cron: string;
  scheduledTime: number;
}): Promise<AppointmentReminderOutcome> {
  const scheduledAt = new Date(scheduledTime).toISOString();
  try {
    if (!isDailySendRun(cron, scheduledTime)) {
      log({ outcome: "skipped", cron, scheduledAt });
      return "skipped";
    }

    const supabase = createReminderClient();
    const { data: claimed, error } = await supabase.rpc("claim_due_appointment_reminders", {
      p_today: warsawToday(new Date(scheduledTime)),
      p_lead_days: APPOINTMENT_REMINDER_LEAD_DAYS,
      p_limit: MAX_BATCH_SIZE,
    });
    if (error) {
      throw new ReminderDatabaseError("claim", error.code);
    }

    if (claimed.length === 0) {
      log({ outcome: "none", cron, scheduledAt, due: 0, sent: 0 });
      return "none";
    }

    const ids = claimed.flatMap((row) => row.reminder_ids);
    const result = await sendEmailBatch({
      messages: claimed.map((row) => buildMessage(row)),
      idempotencyKey: await batchKey(ids),
    });
    if ("dryRun" in result) {
      // Marks nothing, so local and CI runs never consume reminders.
      log({ outcome: "dry-run", cron, scheduledAt, due: claimed.length, sent: 0 });
      return "dry-run";
    }

    const marked = await supabase.rpc("mark_appointment_reminders_sent", { p_ids: ids });
    if (marked.error) {
      throw new ReminderDatabaseError("mark", marked.error.code);
    }
    log({ outcome: "sent", cron, scheduledAt, due: claimed.length, sent: result.ids.length });
    return "sent";
  } catch (error) {
    const details: Record<string, string> =
      error instanceof EmailSendError
        ? { status: String(error.status), resendError: error.resendError }
        : error instanceof ReminderDatabaseError
          ? { step: error.step, code: error.code }
          : {};
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

function buildMessage(row: ClaimedReminder): BatchEmailMessage {
  const locale = resolveLocale(row.locale);
  const t = createT(locale);
  const dates = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    row.appointment_dates.map((date) => formatDay(date, locale)),
  );
  const site = import.meta.env.SITE;
  const text = [
    t("email.appointmentReminder.greeting"),
    "",
    t.plural("email.appointmentReminder.body", row.reminder_ids.length, { dates }),
    "",
    t("email.appointmentReminder.dashboard", { url: new URL("/dashboard", site).href }),
    "",
    t("email.appointmentReminder.optOut", { url: new URL("/profile#reminders", site).href }),
    "",
  ].join("\n");
  return { to: row.email, subject: t("email.appointmentReminder.subject"), text };
}

/** Resend `Idempotency-Key` for this set of reminders: the same claim retried gives the same key. */
async function batchKey(ids: number[]): Promise<string> {
  const sorted = [...ids].sort((a, b) => a - b).join(",");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sorted));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `dbam-appointment-reminder:${hex}`;
}

function log(fields: Record<string, string | number>): void {
  console.log(JSON.stringify({ event: "appointment-reminder", ...fields }));
}
