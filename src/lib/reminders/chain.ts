import { REMINDER_EMAIL_DAILY_BUDGET } from "@/lib/email-budget";
import { buildCronErrorEvent, logErrorEvent, redactError, type ReminderJob } from "@/lib/observability";

// The daily reminder jobs in order, with the shared email budget and the failure rules (`scheduled()` in
// src/worker.ts runs it next to the heartbeat). The jobs and the alert are injected, so this module imports nothing
// from `astro:*` or the admin client and Vitest covers its rules.

export interface ReminderRun {
  cron: string;
  scheduledTime: number;
}

export interface ReminderChainDeps {
  /** Resolves to the number of emails the appointment job sent. */
  appointment: (run: ReminderRun) => Promise<{ sent: number }>;
  /** The due-screening job, which may send at most `budget` emails and resolves to how many it sent. */
  due: (run: ReminderRun, options: { budget: number }) => Promise<{ sent: number }>;
  /** The follow-up nudge job, which may send at most `budget` emails. */
  nudge: (run: ReminderRun, options: { budget: number }) => Promise<{ sent: number }>;
  alert: (run: ReminderRun, job: ReminderJob, error: unknown) => Promise<void>;
}

/**
 * Runs the appointment job, then the due-screening job on what is left of REMINDER_EMAIL_DAILY_BUDGET, then the
 * follow-up nudge job on what is left after both. When a job fails its quota use is unknown, so every later job gets a
 * budget of 0 (it logs `skipped` and its users roll to the next day). Each failed job logs one cron error event and
 * sends one alert; the first failure is then rethrown, redacted, so the run shows as failed without recording a raw
 * message.
 */
export async function runReminderChain(
  run: ReminderRun,
  { appointment, due, nudge, alert }: ReminderChainDeps,
): Promise<void> {
  const failures: { job: ReminderJob; error: unknown }[] = [];

  let dueBudget = 0;
  try {
    const { sent } = await appointment(run);
    dueBudget = Math.max(0, REMINDER_EMAIL_DAILY_BUDGET - sent);
  } catch (error) {
    failures.push({ job: "appointment-reminder", error });
  }

  let nudgeBudget = 0;
  try {
    const { sent } = await due(run, { budget: dueBudget });
    nudgeBudget = Math.max(0, dueBudget - sent);
  } catch (error) {
    failures.push({ job: "due-screening-reminder", error });
  }

  try {
    await nudge(run, { budget: nudgeBudget });
  } catch (error) {
    failures.push({ job: "follow-up-nudge", error });
  }

  for (const { job, error } of failures) {
    try {
      logErrorEvent(buildCronErrorEvent({ error, job, ...run }));
    } catch {
      // Building the event read a throwing property: skip the line, but still send the alert and rethrow redacted.
    }
    await alert(run, job, error);
  }
  if (failures.length > 0) {
    // The rethrow replaces the error object, so anything that compares errors by identity sees a different one.
    throw redactError(failures[0].error);
  }
}
