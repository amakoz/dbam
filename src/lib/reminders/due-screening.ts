import { getActiveRuleCatalog } from "@/lib/catalog/read";
import type { Database } from "@/lib/database.types";
import { collectClaimItems, parseCandidateRows } from "@/lib/reminders/candidates";
import type { ReminderRun } from "@/lib/reminders/chain";
import { reminderDeps } from "@/lib/reminders/deps";
import { buildDueScreeningMessage } from "@/lib/reminders/due-screening-message";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import { runClaimSendMark, type ClaimSendMarkJob, type ReminderOutcome } from "@/lib/reminders/runner";
import { DUE_CANDIDATE_LIMIT } from "@/lib/screenings/due";
import { warsawToday } from "@/lib/screenings/rules";

// Due-screening reminder job (S-06), run by the Worker's Cron Trigger after the appointment job on the daily 10:00
// Warsaw run (`runReminderChain`, src/lib/reminders/chain.ts). It emails a user when a done or confirmed exam is due
// again because its repeat interval has elapsed. The database narrows the search to candidate users
// (`get_due_screening_candidates`: a superset of what is due, with the minimal rule inputs and the SQL anchor month);
// `dueScreeningItems` decides with the dashboard's own rules; `claim_due_screening_reminders` re-checks live data and
// records one ledger row per completion cycle. The shared runner (src/lib/reminders/runner.ts) sends one email per user in
// one Resend batch, then marks the rows sent. Emails and logs never name an exam, a due month or an address: logs carry
// counts and error names only.

export type DueScreeningOutcome = ReminderOutcome;

type ClaimedReminder = Database["public"]["Functions"]["claim_due_screening_reminders"]["Returns"][number];

const dueScreeningJob: ClaimSendMarkJob<ClaimedReminder> = {
  event: "due-screening-reminder",
  keyPrefix: "dbam-due-screening-reminder",
  select: async (client, { now, budget }) => {
    const today = warsawToday(now);
    const { data, error } = await client.rpc("get_due_screening_candidates", {
      p_today: today,
      p_limit: DUE_CANDIDATE_LIMIT,
    });
    if (error) {
      throw new ReminderDatabaseError("candidates", error.code);
    }
    const candidates = parseCandidateRows(data);
    if (candidates.length === 0) {
      return { rows: [], fields: { candidates: 0 } };
    }

    const catalog = await getActiveRuleCatalog(client);
    // The runner has already skipped a run without budget, so `budget` is a number here.
    const { items } = collectClaimItems(candidates, catalog, now, budget ?? 0);
    if (items.length === 0) {
      return { rows: [], fields: { candidates: candidates.length } };
    }

    const { data: claimed, error: claimError } = await client.rpc("claim_due_screening_reminders", {
      p_today: today,
      // Spread into plain objects: supabase-js types the argument as `Json`, which an interface does not satisfy.
      p_items: items.map((item) => ({ ...item })),
    });
    if (claimError) {
      throw new ReminderDatabaseError("claim", claimError.code);
    }
    return { rows: claimed, fields: { candidates: candidates.length } };
  },
  ids: (row) => row.reminder_ids,
  message: buildDueScreeningMessage,
  mark: "mark_due_screening_reminders_sent",
};

/** `budget` is how many emails this run may still send today; `sent` is how many Resend accepted. */
export function runDueScreeningReminders(
  run: ReminderRun,
  { budget }: { budget: number },
): Promise<{ outcome: DueScreeningOutcome; sent: number }> {
  return runClaimSendMark(dueScreeningJob, run, budget, reminderDeps());
}
