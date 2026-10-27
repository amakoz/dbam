import { defineConfig, devices } from "@playwright/test";
import { assertLocalOnly } from "./tests/e2e/support/local-only";

// E2E_PORT overrides DBAM_PORT (worker sessions); 4321 is Astro's default for a human's run.
const PORT = Number(process.env.E2E_PORT ?? process.env.DBAM_PORT ?? 4321);
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

assertLocalOnly(baseURL, import.meta.dirname);

export default defineConfig({
  testDir: "tests/e2e",
  // The specs are whole user journeys (sign-up to confirm, two users); the 30 s default is tight on a loaded machine.
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // BASE_URL means the server is already running (CI, or one started by hand); otherwise build and preview locally.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        // Production-like build + preview. Astro 7 daemonizes `astro preview` when it detects an agent;
        // ASTRO_PREVIEW_BACKGROUND keeps it in the foreground so Playwright owns the process.
        command: `npm run build && npm run preview -- --port ${PORT} --host 127.0.0.1`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: { ASTRO_PREVIEW_BACKGROUND: "1" },
      },
});
