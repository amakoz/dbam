import { handle } from "@astrojs/cloudflare/handler";
import { runHeartbeat } from "@/lib/heartbeat";
import { runAppointmentReminders } from "@/lib/reminders/appointment";

// Worker entry (`main` in wrangler.jsonc). HTTP goes to the Astro adapter unchanged; Cron Triggers run the heartbeat
// and the appointment reminder job. The static `@astrojs/cloudflare/handler` import also initialises `astro:env` from
// the Worker env at module load, which is what makes the secrets readable inside `scheduled()`: keep it a static
// top-level import.
export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  // Both jobs run independently: a failing reminder job still lets the heartbeat send, and vice versa. The first
  // failure is rethrown afterwards so Cloudflare marks the run as failed (Trigger Events, Workers Logs).
  async scheduled(controller) {
    const run = { cron: controller.cron, scheduledTime: controller.scheduledTime };
    const results = await Promise.allSettled([runHeartbeat(run), runAppointmentReminders(run)]);
    const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
      throw failure.reason;
    }
  },
} satisfies ExportedHandler<Env>;
