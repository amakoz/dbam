import { createT, resolveLocale } from "@/i18n";
import type { BatchEmailMessage } from "@/lib/email";

// The due-screening reminder's email, pure on purpose: no `astro:*` or admin-client import (the `email` import is
// type-only), so Vitest covers the copy and the no-exam-name rule. The job in `due-screening.ts` claims the rows.

/** What the email reads from a claimed row: a count only, never an exam. */
export interface DueScreeningRow {
  email: string;
  locale: string;
  reminder_ids: number[];
}

/** Only a count, a dashboard link and an opt-out link: never an exam name. */
export function buildDueScreeningMessage(row: DueScreeningRow, site: string): BatchEmailMessage {
  const t = createT(resolveLocale(row.locale));
  const text = [
    t("email.dueScreeningReminder.greeting"),
    "",
    t.plural("email.dueScreeningReminder.body", row.reminder_ids.length),
    "",
    t("email.dueScreeningReminder.dashboard", { url: new URL("/dashboard", site).href }),
    "",
    t("email.dueScreeningReminder.optOut", { url: new URL("/profile#reminders", site).href }),
    "",
  ].join("\n");
  return { to: row.email, subject: t("email.dueScreeningReminder.subject"), text };
}
