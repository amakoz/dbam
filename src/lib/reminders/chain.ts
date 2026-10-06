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
  /** The due-screening job, which may send at most `budget` emails. */
  due: (run: ReminderRun, options: { budget: number }) => Promise<unknown>;
  alert: (run: ReminderRun, job: ReminderJob, error: unknown) => Promise<void>;
}

/**
 * Runs the appointment job, then the due-screening job on what is left of REMINDER_EMAIL_DAILY_BUDGET. When the
 * appointment job fails its quota use is unknown, so the due job gets a budget of 0 (it logs `skipped` and its users
 * roll to the next day). Each failed job logs one cron error event and sends one alert; the first failure is then
 * rethrown, redacted, so the run shows as failed without recording a raw message.
 */
export async function runReminderChain(
  run: ReminderRun,
  { appointment, due, alert }: ReminderChainDeps,
): Promise<void> {
  const failures: { job: ReminderJob; error: unknown }[] = [];

  let budget = 0;
  try {
    const { sent } = await appointment(run);
    budget = Math.max(0, REMINDER_EMAIL_DAILY_BUDGET - sent);
  } catch (error) {
    failures.push({ job: "appointment-reminder", error });
  }

  try {
    await due(run, { budget });
  } catch (error) {
    failures.push({ job: "due-screening-reminder", error });
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
