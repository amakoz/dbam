import { createT, resolveLocale } from "@/i18n";
import type { Database } from "@/lib/database.types";
import { REMINDER_EMAIL_DAILY_BUDGET, type BatchEmailMessage } from "@/lib/email";
import { reminderDeps } from "@/lib/reminders/deps";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import { runClaimSendMark, type ClaimSendMarkJob, type ReminderOutcome } from "@/lib/reminders/runner";
import type { ReminderRun } from "@/lib/reminders/chain";
import { formatDay } from "@/lib/screenings/format";
import { warsawToday } from "@/lib/screenings/rules";

// Appointment reminder job run by the Worker's Cron Trigger (`scheduled()` in src/worker.ts) on the daily 10:00 Warsaw
// run. The database decides who is due (`claim_due_appointment_reminders`: opted in, active consent, a plan dated 1–3
// days ahead, not yet reminded for that date) and returns each user's account email. The shared runner
// (src/lib/reminders/runner.ts) sends one email per user in one Resend batch, then marks the reminders sent. At most
// REMINDER_EMAIL_DAILY_BUDGET users are claimed: the due-screening job shares that daily budget and runs after this
// one, so this job has no budget gate of its own. Emails and logs never name an exam; logs carry counts and error names
// only, never recipients, subjects or error messages.

/** Remind a plan when its appointment is 1 to this many Warsaw days ahead. */
export const APPOINTMENT_REMINDER_LEAD_DAYS = 3;

export type AppointmentReminderOutcome = ReminderOutcome;

type ClaimedReminder = Database["public"]["Functions"]["claim_due_appointment_reminders"]["Returns"][number];

const appointmentJob: ClaimSendMarkJob<ClaimedReminder> = {
  event: "appointment-reminder",
  keyPrefix: "dbam-appointment-reminder",
  select: async (client, { now }) => {
    const { data, error } = await client.rpc("claim_due_appointment_reminders", {
      p_today: warsawToday(now),
      p_lead_days: APPOINTMENT_REMINDER_LEAD_DAYS,
      p_limit: REMINDER_EMAIL_DAILY_BUDGET,
    });
    if (error) {
      throw new ReminderDatabaseError("claim", error.code);
    }
    return { rows: data };
  },
  ids: (row) => row.reminder_ids,
  message: buildMessage,
  mark: "mark_appointment_reminders_sent",
};

/** `sent` is the number of emails Resend accepted: 0 unless the outcome is `sent`. The due job spends what is left. */
export function runAppointmentReminders(
  run: ReminderRun,
): Promise<{ outcome: AppointmentReminderOutcome; sent: number }> {
  return runClaimSendMark(appointmentJob, run, undefined, reminderDeps());
}

function buildMessage(row: ClaimedReminder, site: string): BatchEmailMessage {
  const locale = resolveLocale(row.locale);
  const t = createT(locale);
  const dates = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    row.appointment_dates.map((date) => formatDay(date, locale)),
  );
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
