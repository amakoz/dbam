# Test stack

## E2E

<!-- Written by /10x-e2e-setup. Re-run it to change this section; other skills only read it. -->

- runner: Playwright Test, @playwright/test 1.63.0
- config: playwright.config.ts
- single-spec command: npx playwright test tests/e2e/seed.spec.ts
- full-suite command: npm run test:e2e
- base URL: BASE_URL, else http://127.0.0.1:<port> (local only: the config refuses any other host and any non-local SUPABASE_URL)
- port: $E2E_PORT, else $DBAM_PORT, else 4321 (Astro preview default, `astro.config.mjs` sets none); 4321 is refused in worker sessions (DBAM_CHANGE set)
- web server command: npm run build && npm run preview -- --port $PORT --host 127.0.0.1; reuseExistingServer outside CI, no webServer when BASE_URL is set (CI starts the preview itself)
- auth setup project: none — each test signs up a fresh user through the UI
- storageState: none
- seed: tests/e2e/seed.spec.ts — protects risk #2 (sign-up reaches the consent step of onboarding)
- browser CLI: npx -y @playwright/cli (no agent wiring)
- updated: 2026-10-27
