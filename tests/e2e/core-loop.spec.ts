import { expect, test } from "@playwright/test";
import {
  MAMMOGRAPHY,
  completeProfile,
  confirmExam,
  eligibleBirthYear,
  grantConsent,
  mammographyOracle,
  planExam,
  row,
  section,
  signUp,
  warsawToday,
} from "./support/core-loop";

// Risk #2 (the core loop breaks in a real browser) and risk #4 (a confirmed exam is lost or gets a wrong next due
// date), test-plan.md. A fresh user clicks through sign-up → consent → profile → due list → plan for today → confirm.
// Every step asserts its business result; the done row must show the next due date the catalog implies. The plan date
// is Warsaw "today", computed once: a run that crosses Warsaw midnight between plan and confirm can flake, like smoke.
test("a new user plans today's mammography, confirms it, and the next due date follows the catalog", async ({
  page,
}) => {
  const today = warsawToday();
  const oracle = mammographyOracle(today);

  await signUp(page);
  await grantConsent(page);
  await completeProfile(page, { birthYear: eligibleBirthYear(0) });

  // The due list: mammography is tier 1 for this profile and nothing is planned yet.
  await expect(section(page, "Ważne – umów się teraz").locator(`#screening-${MAMMOGRAPHY}`)).toBeVisible();
  await expect(section(page, "Twoje plany").getByText("Nic jeszcze nie zaplanowano.")).toBeVisible();

  // Plan for today: the row moves from tier 1 to the plans and asks whether the exam took place.
  await planExam(page, MAMMOGRAPHY, today);
  const planned = section(page, "Twoje plany").locator(`#screening-${MAMMOGRAPHY}`);
  await expect(planned).toContainText("Zapisano w Twoich planach.");
  await expect(planned).toContainText(oracle.confirmPrompt);
  await expect(section(page, "Ważne – umów się teraz").locator(`#screening-${MAMMOGRAPHY}`)).toHaveCount(0);

  // Confirm: the exam lands in "Wykonane" on the appointment day with the catalog-implied next due month.
  await confirmExam(page, MAMMOGRAPHY);
  const done = section(page, "Wykonane").locator(`#screening-${MAMMOGRAPHY}`);
  await expect(done).toContainText("Potwierdzono badanie i oznaczono je jako wykonane.");
  await expectDoneRow();
  await expect(section(page, "Twoje plany").getByText("Nic jeszcze nie zaplanowano.")).toBeVisible();
  await expect(row(page, MAMMOGRAPHY)).toHaveCount(1);
  await expect(section(page, "Ważne – umów się teraz").locator(`#screening-${MAMMOGRAPHY}`)).toHaveCount(0);

  // The record is stored, not just rendered once: it survives a reload.
  await page.reload();
  await expectDoneRow();

  async function expectDoneRow() {
    const doneRow = section(page, "Wykonane").locator(`#screening-${MAMMOGRAPHY}`);
    await expect(doneRow).toContainText(oracle.name);
    await expect(doneRow).toContainText(oracle.lastDoneText);
    await expect(doneRow).toContainText(oracle.nextDueText);
    await expect(doneRow).toHaveAttribute("data-last-done-on", today);
    await expect(doneRow).toHaveAttribute("data-next-due", oracle.nextDue);
  }
});
