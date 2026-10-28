import { describe, expect, it } from "vitest";

import { HEALTH_DATA_CONSENT_VERSION } from "@/lib/consent";
import { isIsoDate } from "@/lib/screenings/rules";

// The database refuses a consent row whose version is not in this format (check health_data_consents_version_format,
// supabase/migrations/20261028131057_app_rule_checks.sql). A bump outside it would fail every consent grant with
// `save_failed`, so it fails here first.
const DATABASE_FORMAT = /^\d{4}-\d{2}-\d{2}(\.\d+)?$/;

describe("HEALTH_DATA_CONSENT_VERSION", () => {
  it("matches the format the database accepts", () => {
    expect(HEALTH_DATA_CONSENT_VERSION).toMatch(DATABASE_FORMAT);
  });

  it("starts with a real calendar date (the day the consent text changed)", () => {
    expect(isIsoDate(HEALTH_DATA_CONSENT_VERSION.slice(0, 10))).toBe(true);
  });
});
