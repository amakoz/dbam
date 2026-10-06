import { createT, resolveLocale } from "@/i18n";
import type { Database } from "@/lib/database.types";
import { sendEmailBatch, type BatchEmailMessage } from "@/lib/email";
import { getActiveRuleCatalog } from "@/lib/catalog/read";
import { errorDetails, errorName } from "@/lib/observability";
import { createReminderClient } from "@/lib/reminders/admin-client";
import { batchKey } from "@/lib/reminders/batch-key";
import { collectClaimItems, parseCandidateRows } from "@/lib/reminders/candidates";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import { isDailySendRun } from "@/lib/schedule";
import { DUE_CANDIDATE_LIMIT } from "@/lib/screenings/due";
import { warsawToday } from "@/lib/screenings/rules";

// Due-screening reminder job (S-06), run by the Worker's Cron Trigger after the appointment job on the daily 10:00
// Warsaw run (`runReminderChain`, src/lib/reminders/chain.ts). It emails a user when a done or confirmed exam is due
// again because its repeat interval has elapsed. The database narrows the search to candidate users
// (`get_due_screening_candidates`: a superset of what is due, with the minimal rule inputs and the SQL anchor month);
// `dueScreeningItems` decides with the dashboard's own rules; `claim_due_screening_reminders` re-checks live data and
// records one ledger row per completion cycle. One email per user goes out in one Resend batch, then the rows are
// marked sent. A failed send leaves them unsent for the next run, and a retry of the same run reuses the batch key, so
// Resend deduplicates it. With EMAIL_DRY_RUN=true nothing is sent and nothing is marked. Emails and logs never name an
// exam, a due month or an address: logs carry counts and error names only.

export type DueScreeningOutcome = "none" | "skipped" | "dry-run" | "sent";

type ClaimedReminder = Database["public"]["Functions"]["claim_due_screening_reminders"]["Returns"][number];

/** `budget` is how many emails this run may still send today; `sent` is how many Resend accepted. */
export async function runDueScreeningReminders(
  { cron, scheduledTime }: { cron: string; scheduledTime: number },
  { budget }: { budget: number },
): Promise<{ outcome: DueScreeningOutcome; sent: number }> {
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

    const now = new Date(scheduledTime);
    const today = warsawToday(now);
    const supabase = createReminderClient();

    const { data, error } = await supabase.rpc("get_due_screening_candidates", {
      p_today: today,
      p_limit: DUE_CANDIDATE_LIMIT,
    });
    if (error) {
      throw new ReminderDatabaseError("candidates", error.code);
    }
    const candidates = parseCandidateRows(data);
    if (candidates.length === 0) {
      log({ outcome: "none", cron, scheduledAt, candidates: 0, due: 0, sent: 0 });
      return { outcome: "none", sent: 0 };
    }

    const catalog = await getActiveRuleCatalog(supabase);
    const { items } = collectClaimItems(candidates, catalog, now, budget);
    if (items.length === 0) {
      log({ outcome: "none", cron, scheduledAt, candidates: candidates.length, due: 0, sent: 0 });
      return { outcome: "none", sent: 0 };
    }

    const { data: claimed, error: claimError } = await supabase.rpc("claim_due_screening_reminders", {
      p_today: today,
      // Spread into plain objects: supabase-js types the argument as `Json`, which an interface does not satisfy.
      p_items: items.map((item) => ({ ...item })),
    });
    if (claimError) {
      throw new ReminderDatabaseError("claim", claimError.code);
    }
    if (claimed.length === 0) {
      log({ outcome: "none", cron, scheduledAt, candidates: candidates.length, due: 0, sent: 0 });
      return { outcome: "none", sent: 0 };
    }

    const ids = claimed.flatMap((row) => row.reminder_ids);
    const result = await sendEmailBatch({
      messages: claimed.map((row) => buildMessage(row)),
      idempotencyKey: await batchKey("dbam-due-screening-reminder", ids),
    });
    if ("dryRun" in result) {
      // Marks nothing, so local and CI runs never consume reminders.
      log({ outcome: "dry-run", cron, scheduledAt, candidates: candidates.length, due: claimed.length, sent: 0 });
      return { outcome: "dry-run", sent: 0 };
    }

    const marked = await supabase.rpc("mark_due_screening_reminders_sent", { p_ids: ids });
    if (marked.error) {
      throw new ReminderDatabaseError("mark", marked.error.code);
    }
    log({
      outcome: "sent",
      cron,
      scheduledAt,
      candidates: candidates.length,
      due: claimed.length,
      sent: result.ids.length,
    });
    return { outcome: "sent", sent: result.ids.length };
  } catch (error) {
    // The error name and the whitelisted details only (src/lib/observability.ts), never `message`.
    log({ outcome: "failed", cron, scheduledAt, error: errorName(error), ...errorDetails(error) });
    throw error;
  }
}

/** Only a count, a dashboard link and an opt-out link: never an exam name. */
function buildMessage(row: ClaimedReminder): BatchEmailMessage {
  const t = createT(resolveLocale(row.locale));
  const site = import.meta.env.SITE;
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

function log(fields: Record<string, string | number>): void {
  console.log(JSON.stringify({ event: "due-screening-reminder", ...fields }));
}
