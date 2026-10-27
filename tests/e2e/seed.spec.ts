import { expect, test } from "@playwright/test";

// Seed: the exemplar later specs copy. Protects risk #2 (test-plan.md): the core loop breaks in a real browser.
// This spec covers its first step: a fresh user signs up through the rendered form and lands on the consent step,
// which proves the redirect chain /api/auth/signup → /auth/confirm-email → /dashboard → /onboarding that no HTTP-level
// check follows. The user is unique per run and stays in the local database; there is no cleanup because nothing
// shared is changed.
test("sign-up with a fresh e-mail reaches the consent step of onboarding", async ({ page }) => {
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  const password = "E2e-Passw0rd-seed!";

  await page.goto("/auth/signup");
  // The form is a React island: input typed before it hydrates is lost, and the submit would not be validated.
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByLabel("Powtórz hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Utwórz konto" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Zgoda na przechowywanie danych o zdrowiu" })).toBeVisible();
});
