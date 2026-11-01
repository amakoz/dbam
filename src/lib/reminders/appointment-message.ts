import { createT, resolveLocale } from "@/i18n";
import type { BatchEmailMessage } from "@/lib/email";
import { formatDay } from "@/lib/screenings/format";

// The appointment reminder's email, pure on purpose: no `astro:*` or admin-client import (the `email` import is
// type-only), so Vitest covers the copy and the no-exam-name rule. The job in `appointment.ts` claims the rows.

/** What the email reads from a claimed row: dates and a count, never an exam. */
export interface AppointmentRow {
  email: string;
  locale: string;
  appointment_dates: string[];
  reminder_ids: number[];
}

/** Only the appointment dates, a count, a dashboard link and an opt-out link: never an exam name. */
export function buildAppointmentMessage(row: AppointmentRow, site: string): BatchEmailMessage {
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
