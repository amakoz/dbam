import { expect, test } from "@playwright/test";
import {
  COLONOSCOPY,
  MAMMOGRAPHY,
  completeProfile,
  confirmExam,
  eligibleBirthYear,
  examName,
  grantConsent,
  mammographyOracle,
  planExam,
  row,
  section,
  signUp,
  warsawToday,
} from "./support/core-loop";

// Risk #1 at browser level (test-plan.md): a second user must not see another user's data. User A ends with a
// confirmed mammography and an open colonoscopy plan; user B, in a separate browser context, is eligible for both
// exams but sees neither as a plan or a done record, and sees only their own profile. The oracle for A's rows is the
// same catalog-derived one as in the core-loop spec.
test("a second user sees none of the first user's plans, done exams or profile", async ({ browser }) => {
  const today = warsawToday();
  const oracle = mammographyOracle(today);
  const birthYearA = eligibleBirthYear(0);
  const birthYearB = eligibleBirthYear(5);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const pageA = await contextA.newPage();
    await signUp(pageA);
    await grantConsent(pageA);
    await completeProfile(pageA, { birthYear: birthYearA });
    await planExam(pageA, MAMMOGRAPHY, today);
    await confirmExam(pageA, MAMMOGRAPHY);
    await planExam(pageA, COLONOSCOPY, null);

    const expectAHoldsBoth = async () => {
      await expect(section(pageA, "Wykonane").locator(`#screening-${MAMMOGRAPHY}`)).toContainText(oracle.lastDoneText);
      await expect(section(pageA, "Twoje plany").locator(`#screening-${COLONOSCOPY}`)).toBeVisible();
    };
    await expectAHoldsBoth();

    const pageB = await contextB.newPage();
    await signUp(pageB);
    await grantConsent(pageB);
    await completeProfile(pageB, { birthYear: birthYearB });

    // B is eligible for both of A's exams, so their absence from B's plans and done list is isolation, not eligibility.
    await expect(row(pageB, MAMMOGRAPHY).and(pageB.locator("[data-tier]"))).toBeVisible();
    await expect(row(pageB, COLONOSCOPY).and(pageB.locator("[data-tier]"))).toBeVisible();
    await expect(row(pageB, MAMMOGRAPHY)).toHaveCount(1);
    await expect(row(pageB, COLONOSCOPY)).toHaveCount(1);
    await expect(section(pageB, "Twoje plany").getByText("Nic jeszcze nie zaplanowano.")).toBeVisible();
    await expect(section(pageB, "Twoje plany").getByText(examName(COLONOSCOPY))).toHaveCount(0);
    await expect(pageB.getByRole("region", { name: "Wykonane", exact: true })).toHaveCount(0);
    await expect(pageB.getByText("Ostatnio wykonane")).toHaveCount(0);

    // Only B's own profile data shows, on the dashboard summary and in the profile form.
    const profileSummary = section(pageB, "Twój profil");
    await expect(profileSummary).toContainText(String(birthYearB));
    await expect(profileSummary).not.toContainText(String(birthYearA));
    await pageB.goto("/profile");
    await expect(pageB.getByLabel("Rok urodzenia")).toHaveValue(String(birthYearB));

    // B's activity did not disturb A: A's session, reloaded after B, still holds the done record and the plan.
    await pageA.reload();
    await expectAHoldsBoth();
    await expect(section(pageA, "Twój profil")).toContainText(String(birthYearA));
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
