import { sendEmailBatch } from "@/lib/email";
import { createReminderClient } from "@/lib/reminders/admin-client";
import type { ReminderDeps } from "@/lib/reminders/runner";

// Binds the runner's collaborators to the real ones. Wiring, not pure: it reaches `astro:env/server` through the
// admin client and the sender. Each job calls it once per run, never at module load.

export function reminderDeps(): ReminderDeps {
  return { client: createReminderClient, send: sendEmailBatch, site: import.meta.env.SITE };
}
