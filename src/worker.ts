import { handle } from "@astrojs/cloudflare/handler";
import { runHeartbeat } from "@/lib/heartbeat";

// Worker entry (`main` in wrangler.jsonc). HTTP goes to the Astro adapter unchanged; Cron Triggers run the heartbeat.
// The static `@astrojs/cloudflare/handler` import also initialises `astro:env` from the Worker env at module load, which
// is what makes the secrets readable inside `scheduled()`: keep it a static top-level import.
export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
  // Awaited so a failure propagates and Cloudflare marks the run as failed (Trigger Events, Workers Logs).
  async scheduled(controller) {
    await runHeartbeat({ cron: controller.cron, scheduledTime: controller.scheduledTime });
  },
} satisfies ExportedHandler<Env>;
