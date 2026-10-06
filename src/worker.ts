import { handle } from "@astrojs/cloudflare/handler";
import { sendReminderFailureAlert } from "@/lib/failure-alert";
import { runHeartbeat } from "@/lib/heartbeat";
import { buildCronErrorEvent, logErrorEvent, redactError } from "@/lib/observability";
import { runAppointmentReminders } from "@/lib/reminders/appointment";
import { runReminderChain } from "@/lib/reminders/chain";
import { runDueScreeningReminders } from "@/lib/reminders/due-screening";
import { runFollowUpNudges } from "@/lib/reminders/follow-up-nudge";

// Worker entry (`main` in wrangler.jsonc). HTTP goes to the Astro adapter unchanged; Cron Triggers run the heartbeat
// and the reminder chain (the appointment job, then the due-screening and follow-up nudge jobs on the rest of the daily
// email budget). The static `@astrojs/cloudflare/handler` import also initialises `astro:env` from the Worker env at
// module load, which is what makes the secrets readable inside `scheduled()`: keep it a static top-level import.
export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  // The heartbeat and the reminder chain run independently: a failing reminder job still lets the heartbeat send, and
  // vice versa. Each failed job logs one `event: "error"` line (src/lib/observability.ts), and a failed reminder job
  // also emails the owner (best-effort, src/lib/failure-alert.ts); the chain does both for its own jobs
  // (src/lib/reminders/chain.ts). The first failure is then rethrown, redacted, so Cloudflare marks the run as failed
  // (Trigger Events, Workers Logs) without recording a raw message.
  async scheduled(controller) {
    const run = { cron: controller.cron, scheduledTime: controller.scheduledTime };
    const [heartbeat, chain] = await Promise.allSettled([
      runHeartbeat(run),
      runReminderChain(run, {
        appointment: runAppointmentReminders,
        due: runDueScreeningReminders,
        nudge: runFollowUpNudges,
        alert: sendReminderFailureAlert,
      }),
    ]);

    if (heartbeat.status === "rejected") {
      try {
        logErrorEvent(buildCronErrorEvent({ error: heartbeat.reason, job: "heartbeat", ...run }));
      } catch {
        // Building the event read a throwing property: skip the line, but still rethrow redacted.
      }
    }
    const failure = heartbeat.status === "rejected" ? heartbeat : chain.status === "rejected" ? chain : null;
    if (failure) {
      // The rethrow replaces the error object, so anything that compares errors by identity sees a different one.
      throw redactError(failure.reason);
    }
  },
} satisfies ExportedHandler<Env>;
