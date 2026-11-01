import { describe, expect, it } from "vitest";

import { createT } from "@/i18n";
import { buildDueScreeningMessage, type DueScreeningRow } from "@/lib/reminders/due-screening-message";

const SITE = "https://dbam.example.com";

function row(overrides: Partial<DueScreeningRow> = {}): DueScreeningRow {
  return { email: "jan@example.com", locale: "pl", reminder_ids: [1], ...overrides };
}

function ids(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

describe("buildDueScreeningMessage", () => {
  it("writes the Polish copy for one due exam", () => {
    const { subject, text } = buildDueScreeningMessage(row(), SITE);
    expect(subject).toBe("Dbam: czas na badanie profilaktyczne");
    expect(text).toBe(
      [
        "Dzień dobry,",
        "",
        "Minął zalecany odstęp od jednego z Twoich badań profilaktycznych. Czas je powtórzyć.",
        "",
        "Zobacz, których badań to dotyczy, w swoim panelu Dbam: https://dbam.example.com/dashboard",
        "",
        "Nie chcesz dostawać przypomnień? Wyłącz je w swoim profilu: https://dbam.example.com/profile#reminders",
        "",
      ].join("\n"),
    );
  });

  it("writes the English copy for one due exam", () => {
    const { subject, text } = buildDueScreeningMessage(row({ locale: "en" }), SITE);
    expect(subject).toBe("Dbam: time to repeat a preventive exam");
    expect(text).toBe(
      [
        "Hello,",
        "",
        "The recommended interval since one of your preventive exams has passed. It's time to repeat it.",
        "",
        "See which ones in your Dbam dashboard: https://dbam.example.com/dashboard",
        "",
        "Don't want these reminders? Turn them off in your profile: https://dbam.example.com/profile#reminders",
        "",
      ].join("\n"),
    );
  });

  it.each([
    [1, "Minął zalecany odstęp od jednego z Twoich badań profilaktycznych"],
    [2, "Minął zalecany odstęp od 2 Twoich badań profilaktycznych"],
    [5, "Minął zalecany odstęp od 5 Twoich badań profilaktycznych"],
  ])("uses the Polish plural form for %i reminders", (count, expected) => {
    expect(buildDueScreeningMessage(row({ reminder_ids: ids(count) }), SITE).text).toContain(expected);
  });

  it.each([
    [1, "The recommended interval since one of your preventive exams has passed"],
    [3, "The recommended interval since 3 of your preventive exams has passed"],
  ])("uses the English plural form for %i reminders", (count, expected) => {
    expect(buildDueScreeningMessage(row({ reminder_ids: ids(count), locale: "en" }), SITE).text).toContain(expected);
  });

  it("links to the dashboard and the profile opt-out on the site", () => {
    const { text } = buildDueScreeningMessage(row(), "https://other.example");
    expect(text).toContain("https://other.example/dashboard");
    expect(text).toContain("https://other.example/profile#reminders");
  });

  it("addresses the account email and uses one fixed subject per locale", () => {
    const pl = buildDueScreeningMessage(row(), SITE);
    const en = buildDueScreeningMessage(row({ locale: "en" }), SITE);
    expect(pl.to).toBe("jan@example.com");
    expect(pl.subject).toBe(createT("pl")("email.dueScreeningReminder.subject"));
    expect(en.subject).toBe(createT("en")("email.dueScreeningReminder.subject"));
    expect(buildDueScreeningMessage(row({ reminder_ids: ids(4) }), SITE).subject).toBe(pl.subject);
  });

  it("falls back to Polish for an unknown locale", () => {
    const { subject } = buildDueScreeningMessage(row({ locale: "de" }), SITE);
    expect(subject).toBe(createT("pl")("email.dueScreeningReminder.subject"));
  });

  it("names no exam: a slug or name on the claimed row never reaches the email", () => {
    const leaky = { ...row(), catalog_slug: "mammografia", name: "Mammografia", due_month: "2026-10-01" };
    const { subject, text } = buildDueScreeningMessage(leaky, SITE);
    expect(`${subject}\n${text}`).not.toMatch(/mammografia/i);
    expect(`${subject}\n${text}`).not.toContain("catalog_slug");
    expect(`${subject}\n${text}`).not.toContain("2026-10");
  });
});
