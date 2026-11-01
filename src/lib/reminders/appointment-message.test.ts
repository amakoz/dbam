import { describe, expect, it } from "vitest";

import { createT } from "@/i18n";
import { buildAppointmentMessage, type AppointmentRow } from "@/lib/reminders/appointment-message";

const SITE = "https://dbam.example.com";

function row(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    email: "jan@example.com",
    locale: "pl",
    appointment_dates: ["2026-11-03"],
    reminder_ids: [1],
    ...overrides,
  };
}

describe("buildAppointmentMessage", () => {
  it("writes the Polish copy for one appointment", () => {
    const { subject, text } = buildAppointmentMessage(row(), SITE);
    expect(subject).toBe("Dbam: przypomnienie o wizycie");
    expect(text).toBe(
      [
        "Dzień dobry,",
        "",
        "Masz zaplanowaną wizytę w najbliższych dniach: 3 listopada 2026.",
        "",
        "Szczegóły znajdziesz w swoim panelu Dbam: https://dbam.example.com/dashboard",
        "",
        "Nie chcesz dostawać przypomnień? Wyłącz je w swoim profilu: https://dbam.example.com/profile#reminders",
        "",
      ].join("\n"),
    );
  });

  it("writes the English copy for one appointment", () => {
    const { subject, text } = buildAppointmentMessage(row({ locale: "en" }), SITE);
    expect(subject).toBe("Dbam: appointment reminder");
    expect(text).toBe(
      [
        "Hello,",
        "",
        "You have an appointment coming up: November 3, 2026.",
        "",
        "See the details in your Dbam dashboard: https://dbam.example.com/dashboard",
        "",
        "Don't want these reminders? Turn them off in your profile: https://dbam.example.com/profile#reminders",
        "",
      ].join("\n"),
    );
  });

  it.each([
    [1, "Masz zaplanowaną wizytę w najbliższych dniach"],
    [2, "Masz 2 zaplanowane wizyty w najbliższych dniach"],
    [5, "Masz 5 zaplanowanych wizyt w najbliższych dniach"],
  ])("uses the Polish plural form for %i reminders", (count, expected) => {
    const ids = Array.from({ length: count }, (_, i) => i + 1);
    expect(buildAppointmentMessage(row({ reminder_ids: ids }), SITE).text).toContain(expected);
  });

  it.each([
    [1, "You have an appointment coming up"],
    [3, "You have 3 appointments coming up"],
  ])("uses the English plural form for %i reminders", (count, expected) => {
    const ids = Array.from({ length: count }, (_, i) => i + 1);
    expect(buildAppointmentMessage(row({ reminder_ids: ids, locale: "en" }), SITE).text).toContain(expected);
  });

  it("lists every appointment date as a conjunction in the user's locale", () => {
    const dates = ["2026-11-03", "2026-11-04", "2026-11-05"];
    const pl = buildAppointmentMessage(row({ appointment_dates: dates, reminder_ids: [1, 2, 3] }), SITE).text;
    const en = buildAppointmentMessage(
      row({ appointment_dates: dates, reminder_ids: [1, 2, 3], locale: "en" }),
      SITE,
    ).text;
    expect(pl).toContain("3 listopada 2026, 4 listopada 2026 i 5 listopada 2026.");
    expect(en).toContain("November 3, 2026, November 4, 2026, and November 5, 2026.");
  });

  it("links to the dashboard and the profile opt-out on the site", () => {
    const { text } = buildAppointmentMessage(row(), "https://other.example");
    expect(text).toContain("https://other.example/dashboard");
    expect(text).toContain("https://other.example/profile#reminders");
  });

  it("addresses the account email and uses one fixed subject per locale", () => {
    const pl = buildAppointmentMessage(row(), SITE);
    const en = buildAppointmentMessage(row({ locale: "en" }), SITE);
    expect(pl.to).toBe("jan@example.com");
    expect(pl.subject).toBe(createT("pl")("email.appointmentReminder.subject"));
    expect(en.subject).toBe(createT("en")("email.appointmentReminder.subject"));
    expect(buildAppointmentMessage(row({ reminder_ids: [1, 2, 3] }), SITE).subject).toBe(pl.subject);
  });

  it("falls back to Polish for an unknown locale", () => {
    const { subject, text } = buildAppointmentMessage(row({ locale: "de" }), SITE);
    expect(subject).toBe(createT("pl")("email.appointmentReminder.subject"));
    expect(text).toContain("3 listopada 2026");
  });

  it("names no exam: a slug or name on the claimed row never reaches the email", () => {
    const leaky = { ...row(), catalog_slug: "mammografia", name: "Mammografia", user_id: "u-1" };
    const { subject, text } = buildAppointmentMessage(leaky, SITE);
    expect(`${subject}\n${text}`).not.toMatch(/mammografia/i);
    expect(`${subject}\n${text}`).not.toContain("catalog_slug");
    expect(`${subject}\n${text}`).not.toContain("u-1");
  });
});
