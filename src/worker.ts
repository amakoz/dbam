import { handle } from "@astrojs/cloudflare/handler";
import { sendReminderFailureAlert } from "@/lib/failure-alert";
import { runHeartbeat } from "@/lib/heartbeat";
import { buildCronErrorEvent, logErrorEvent, redactError } from "@/lib/observability";
import { runAppointmentReminders } from "@/lib/reminders/appointment";

// Worker entry (`main` in wrangler.jsonc). HTTP goes to the Astro adapter unchanged; Cron Triggers run the heartbeat
// and the appointment reminder job. The static `@astrojs/cloudflare/handler` import also initialises `astro:env` from
// the Worker env at module load, which is what makes the secrets readable inside `scheduled()`: keep it a static
// top-level import.
export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  // Both jobs run independently: a failing reminder job still lets the heartbeat send, and vice versa. Each failed job
  // logs one `event: "error"` line (src/lib/observability.ts), and a failed appointment reminder job also emails the
  // owner (best-effort, src/lib/failure-alert.ts). The first failure is then rethrown, redacted, so Cloudflare marks
  // the run as failed (Trigger Events, Workers Logs) without recording a raw message.
  async scheduled(controller) {
    const run = { cron: controller.cron, scheduledTime: controller.scheduledTime };
    const jobs = [
      { job: "heartbeat", run: () => runHeartbeat(run) },
      { job: "appointment-reminder", run: () => runAppointmentReminders(run) },
    ];
    const results = await Promise.allSettled(jobs.map(({ run: runJob }) => runJob()));

    const failures = results.flatMap((result, index) =>
      result.status === "rejected" ? [{ job: jobs[index].job, error: result.reason as unknown }] : [],
    );
    for (const { job, error } of failures) {
      logErrorEvent(buildCronErrorEvent({ error, job, ...run }));
      if (job === "appointment-reminder") {
        await sendReminderFailureAlert(run, error);
      }
    }
    if (failures.length > 0) {
      throw redactError(failures[0].error);
    }
  },
} satisfies ExportedHandler<Env>;
