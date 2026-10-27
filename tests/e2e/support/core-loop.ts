import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

// Shared UI steps and the oracle of the core-loop specs. Steps drive the rendered UI only (no HTTP posts, no Supabase
// client), and nothing here imports production code: expected values come from catalog JSON and the test's own
// date arithmetic, so a bug in `src/lib` cannot also move the expectation.

const PASSWORD = "E2e-Passw0rd-loop!";

/** Island forms drop input typed before they hydrate, so wait for every `astro-island` to finish. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector("astro-island[ssr]"));
}

/** Sign up a fresh user through the form; local sign-up starts a session and lands on the consent step. */
export async function signUp(page: Page): Promise<void> {
  await page.goto("/auth/signup");
  await waitForHydration(page);
  const email = `e2e-${crypto.randomUUID()}@example.com`;
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Powtórz hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Utwórz konto" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
}

/** Tick the health-data consent and continue to the profile form. */
export async function grantConsent(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Zgoda na przechowywanie danych o zdrowiu" })).toBeVisible();
  await page.getByRole("checkbox", { name: /Wyrażam wyraźną zgodę/ }).check();
  await page.getByRole("button", { name: "Wyrażam zgodę i przechodzę dalej" }).click();
  await expect(page.getByRole("heading", { name: "Kilka pytań o Ciebie" })).toBeVisible();
}

/** Fill the onboarding profile (female, never smoked) and submit; a complete profile lands on the dashboard. */
export async function completeProfile(page: Page, { birthYear }: { birthYear: number }): Promise<void> {
  await waitForHydration(page);
  await page.getByLabel("Rok urodzenia").fill(String(birthYear));
  await page.getByLabel("Kobieta").check();
  await page.getByLabel("Nie, nigdy").check();
  await page.getByRole("button", { name: "Zapisz i przejdź do panelu" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Panel" })).toBeVisible();
}

/** Today's calendar date in Warsaw as `YYYY-MM-DD`. A run that crosses Warsaw midnight between plan and confirm can flake. */
export function warsawToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

/** A birth year that keeps a woman eligible for mammography (45–74): 50 now, `offset` years older. */
export function eligibleBirthYear(offset: number): number {
  return Number(warsawToday().slice(0, 4)) - 50 - offset;
}

interface CatalogEntry {
  name_pl: string;
  interval_kind: string;
  interval_months: number;
  interval_overrides: unknown[];
}

function readEntry(slug: string): CatalogEntry {
  const file = path.join(import.meta.dirname, "../../../catalog/entries", `${slug}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as CatalogEntry;
}

/** The Polish name of a catalog entry, as the dashboard shows it. */
export function examName(slug: string): string {
  return readEntry(slug).name_pl;
}

export const MAMMOGRAPHY = "mammography-nfz-program";
export const COLONOSCOPY = "colonoscopy-nfz-program";

/**
 * What the dashboard must show for a mammography confirmed on `doneDay` (`YYYY-MM-DD`): the next due month is the
 * appointment month plus the catalog interval, computed by hand, and the display strings come from `Intl` here in Node.
 */
export function mammographyOracle(doneDay: string) {
  const entry = readEntry(MAMMOGRAPHY);
  // The month arithmetic below is only valid for a plain fixed interval.
  expect(entry.interval_kind).toBe("fixed");
  expect(entry.interval_overrides).toHaveLength(0);

  const [year, month] = doneDay.split("-").map(Number);
  const dueIndex = year * 12 + (month - 1) + entry.interval_months;
  const dueYear = Math.floor(dueIndex / 12);
  const dueMonth = (dueIndex % 12) + 1;
  const nextDue = `${dueYear}-${String(dueMonth).padStart(2, "0")}`;

  return {
    name: entry.name_pl,
    nextDue,
    lastDoneText: `Ostatnio wykonane: ${longDay(doneDay)}`,
    nextDueText: `Następne badanie: ${longMonth(Date.UTC(dueYear, dueMonth - 1, 1))}`,
    confirmPrompt: `Czy badanie odbyło się ${longDay(doneDay)}?`,
  };
}

/** `2026-10-27` as "27 października 2026". */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat("pl", { dateStyle: "long", timeZone: "UTC" }).format(new Date(day));
}

function longMonth(utcMs: number): string {
  return new Intl.DateTimeFormat("pl", { month: "long", year: "numeric", timeZone: "UTC" }).format(utcMs);
}

/** A dashboard section by its heading. */
export function section(page: Page, heading: string): Locator {
  return page.getByRole("region", { name: heading, exact: true });
}

/** The row of an exam anywhere on the dashboard. */
export function row(page: Page, slug: string): Locator {
  return page.locator(`#screening-${slug}`);
}

/** Open the exam's tier row panel, set the appointment date and add it to the plans. */
export async function planExam(page: Page, slug: string, day: string | null): Promise<void> {
  const tierRow = row(page, slug);
  await tierRow.getByText("Zaplanuj lub oznacz jako wykonane").click();
  if (day !== null) await tierRow.getByLabel("Termin wizyty").fill(day);
  await tierRow.getByRole("button", { name: "Dodaj do planów" }).click();
  await expect(section(page, "Twoje plany").locator(`#screening-${slug}`)).toBeVisible();
}

/** Confirm a plan whose appointment day has come; the exam moves to "Wykonane". */
export async function confirmExam(page: Page, slug: string): Promise<void> {
  await section(page, "Twoje plany")
    .locator(`#screening-${slug}`)
    .getByRole("button", { name: "Tak, potwierdzam" })
    .click();
  await expect(section(page, "Wykonane").locator(`#screening-${slug}`)).toBeVisible();
}
