// @ts-check
import { defineConfig, envField, fontProviders } from "astro/config";

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
  // Theme A fonts (context/changes/ui-refactor/directions.md §A), downloaded at build time and self-hosted: no CDN at runtime.
  // `latin-ext` carries the Polish diacritics (ą ć ę ł ń ś ź ż); the default `latin` subset lacks them.
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: "Fraunces",
      cssVariable: "--font-fraunces",
      weights: ["100 900"],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["serif"],
    },
    {
      provider: fontProviders.fontsource(),
      name: "Figtree",
      cssVariable: "--font-figtree",
      weights: ["300 900"],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["sans-serif"],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Baseline 2024, so the CSS minifier keeps native light-dark() (src/styles/global.css) instead of polyfilling it.
      // The polyfill resolves the tokens once on :root, so `color-scheme` on an element could no longer force its subtree.
      cssTarget: ["chrome123", "edge123", "firefox120", "safari17.5", "ios17.5"],
    },
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
