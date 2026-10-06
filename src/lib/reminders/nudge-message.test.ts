import { describe, expect, it } from "vitest";

import { createT } from "@/i18n";
import {
  buildNudgeMessage,
  CONFIRM_NUDGE_AFTER_DAYS,
  SCHEDULE_NUDGE_AFTER_DAYS,
  type NudgeRow,
} from "@/lib/reminders/nudge-message";

const SITE = "https://dbam.example.com";

function row(overrides: Partial<NudgeRow> = {}): NudgeRow {
  return { email: "jan@example.com", locale: "pl", schedule_count: 0, confirm_count: 0, ...overrides };
}

describe("buildNudgeMessage", () => {
  it("writes only the confirm line when only confirmations are due", () => {
    const { text } = buildNudgeMessage(row({ confirm_count: 1 }), SITE);
    const t = createT("pl");
    expect(text).toContain(t.plural("email.followUpNudge.confirm", 1));
    expect(text).not.toContain(t.plural("email.followUpNudge.schedule", 1));
  });

  it("writes only the schedule line when only missing dates are due", () => {
    const { text } = buildNudgeMessage(row({ schedule_count: 2 }), SITE);
    const t = createT("pl");
    expect(text).toContain(t.plural("email.followUpNudge.schedule", 2));
    expect(text).not.toContain(t.plural("email.followUpNudge.confirm", 2));
  });

  it("writes both lines, confirm first, in one email", () => {
    const { text } = buildNudgeMessage(row({ schedule_count: 3, confirm_count: 1, locale: "en" }), SITE);
    const t = createT("en");
    const confirm = text.indexOf(t.plural("email.followUpNudge.confirm", 1));
    const schedule = text.indexOf(t.plural("email.followUpNudge.schedule", 3));
    expect(confirm).toBeGreaterThan(0);
    expect(schedule).toBeGreaterThan(confirm);
  });

  it.each([
    [1, "Minął termin 1 wizyty"],
    [2, "Minęły terminy 2 wizyt"],
    [5, "Minęły terminy 5 wizyt"],
  ])("uses the Polish plural form for %i confirmations", (count, expected) => {
    expect(buildNudgeMessage(row({ confirm_count: count }), SITE).text).toContain(expected);
  });

  it.each([
    [1, "1 zaplanowane badanie nadal nie ma"],
    [2, "2 zaplanowane badania nadal nie mają"],
    [5, "5 zaplanowanych badań nadal nie ma"],
  ])("uses the Polish plural form for %i planned exams without a date", (count, expected) => {
    expect(buildNudgeMessage(row({ schedule_count: count }), SITE).text).toContain(expected);
  });

  it.each([
    [1, "1 planned exam still has no appointment date"],
    [2, "2 planned exams still have no appointment date"],
  ])("uses the English plural form for %i planned exams without a date", (count, expected) => {
    expect(buildNudgeMessage(row({ schedule_count: count, locale: "en" }), SITE).text).toContain(expected);
  });

  it("links to the dashboard and the profile opt-out on the site", () => {
    const { text } = buildNudgeMessage(row({ schedule_count: 1 }), SITE);
    expect(text).toContain("https://dbam.example.com/dashboard");
    expect(text).toContain("https://dbam.example.com/profile#reminders");
  });

  it("addresses the account email and uses one fixed subject per locale", () => {
    const pl = buildNudgeMessage(row({ confirm_count: 1 }), SITE);
    const en = buildNudgeMessage(row({ confirm_count: 4, schedule_count: 1, locale: "en" }), SITE);
    expect(pl.to).toBe("jan@example.com");
    expect(pl.subject).toBe(createT("pl")("email.followUpNudge.subject"));
    expect(en.subject).toBe(createT("en")("email.followUpNudge.subject"));
    expect(buildNudgeMessage(row({ schedule_count: 9 }), SITE).subject).toBe(pl.subject);
  });

  it("falls back to Polish for an unknown locale", () => {
    const { subject } = buildNudgeMessage(row({ confirm_count: 1, locale: "de" }), SITE);
    expect(subject).toBe(createT("pl")("email.followUpNudge.subject"));
  });

  it("names no exam: a slug or name on the claimed row never reaches the email", () => {
    const leaky = { ...row({ schedule_count: 1, confirm_count: 1 }), catalog_slug: "mammografia", name: "Mammografia" };
    const { subject, text } = buildNudgeMessage(leaky, SITE);
    expect(`${subject}\n${text}`).not.toMatch(/mammografia/i);
    expect(`${subject}\n${text}`).not.toContain("catalog_slug");
  });
});

describe("the profile disclosure", () => {
  it.each(["pl", "en"] as const)("states the nudge thresholds of the constants in %s", (locale) => {
    const disclosure = createT(locale)("profile.reminders.disclosure");
    expect(disclosure).toMatch(new RegExp(`\\b${SCHEDULE_NUDGE_AFTER_DAYS}\\b`));
    expect(disclosure).toMatch(new RegExp(`\\b${CONFIRM_NUDGE_AFTER_DAYS}\\b`));
  });

  it("pins the thresholds the plan decided", () => {
    expect(SCHEDULE_NUDGE_AFTER_DAYS).toBe(14);
    expect(CONFIRM_NUDGE_AFTER_DAYS).toBe(7);
  });
});
