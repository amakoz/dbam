// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  // Production URL; @astrojs/sitemap is skipped without it.
  site: "https://dbam.amadeuszkozlowski.workers.dev",
  // Sessions and the Images binding are unused; disabling them keeps wrangler from auto-provisioning a KV namespace.
  session: false,
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare({ imageService: "passthrough" }),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Reminder email transport (src/lib/email.ts). REMINDER_TEST_TO is the heartbeat recipient; EMAIL_DRY_RUN=true
      // logs instead of calling Resend, so local dev and CI never send.
      RESEND_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      REMINDER_TEST_TO: envField.string({ context: "server", access: "secret", optional: true }),
      EMAIL_DRY_RUN: envField.boolean({ context: "server", access: "secret", optional: true, default: false }),
    },
  },
});
