import { createT, resolveLocale } from "@/i18n";
import type { BatchEmailMessage } from "@/lib/email";

// The follow-up nudge's thresholds and its email, pure on purpose: no `astro:*` or admin-client import (the `email`
// import is type-only), so Vitest covers the copy and the no-exam-name rule. The job in `follow-up-nudge.ts` passes
// the thresholds to the database, which decides who is due.

/** Nudge a plan that has had no appointment date for this many Warsaw days (FR-011). */
export const SCHEDULE_NUDGE_AFTER_DAYS = 14;
/** Nudge a plan whose appointment date passed this many days ago without a confirmation (FR-012). */
export const CONFIRM_NUDGE_AFTER_DAYS = 7;

/** What the email reads from a claimed row: counts only, never an exam. */
export interface NudgeRow {
  email: string;
  locale: string;
  schedule_count: number;
  confirm_count: number;
}

/** One email per user: a count line per kind that applies, the dashboard link and the opt-out link. */
export function buildNudgeMessage(row: NudgeRow, site: string): BatchEmailMessage {
  const t = createT(resolveLocale(row.locale));
  const lines = [t("email.followUpNudge.greeting"), ""];
  if (row.confirm_count > 0) {
    lines.push(t.plural("email.followUpNudge.confirm", row.confirm_count), "");
  }
  if (row.schedule_count > 0) {
    lines.push(t.plural("email.followUpNudge.schedule", row.schedule_count), "");
  }
  lines.push(
    t("email.followUpNudge.dashboard", { url: new URL("/dashboard", site).href }),
    "",
    t("email.followUpNudge.optOut", { url: new URL("/profile#reminders", site).href }),
    "",
  );
  return { to: row.email, subject: t("email.followUpNudge.subject"), text: lines.join("\n") };
}
