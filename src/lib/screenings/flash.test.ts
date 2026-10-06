import { describe, expect, it } from "vitest";

import { clearedFlashCookieOptions, dashboardLocation, flashCookieOptions, readFlashSlug } from "./flash";

const SLUGS = ["mammography-nfz-program", "cervical-cytology-nfz-program", "psa-shared-decision"];

// The privacy gate: the slug is health data and request URLs are logged, so it may only follow the `#`.
describe("dashboardLocation", () => {
  it.each(SLUGS)("keeps %s out of the path and query for saved and error feedback", (slug) => {
    for (const feedback of [{ saved: "plan" }, { error: "save_failed" }]) {
      const location = dashboardLocation(feedback, slug);
      const [beforeFragment, fragment] = location.split("#");
      expect(beforeFragment).not.toContain(slug);
      expect(beforeFragment).not.toContain("slug=");
      expect(fragment).toBe(`screening-${slug}`);
    }
  });

  it("builds the query from the feedback", () => {
    expect(dashboardLocation({ saved: "plan" }, "mammography-nfz-program")).toBe(
      "/dashboard?saved=plan#screening-mammography-nfz-program",
    );
    expect(dashboardLocation({ error: "invalid_request" }, null)).toBe("/dashboard?error=invalid_request");
  });

  it("has no fragment without a slug, and no query without feedback", () => {
    expect(dashboardLocation({ saved: "undone" }, null)).toBe("/dashboard?saved=undone");
    expect(dashboardLocation(null, null)).toBe("/dashboard");
    const location = dashboardLocation(null, "mammography-nfz-program");
    expect(location).toBe("/dashboard#screening-mammography-nfz-program");
    expect(location.split("#")[0]).toBe("/dashboard");
  });
});

describe("flash cookie options", () => {
  it.each([true, false])("is HttpOnly, Lax, scoped to /dashboard and short-lived (secure: %s)", (secure) => {
    expect(flashCookieOptions(secure)).toEqual({
      path: "/dashboard",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 60,
    });
  });

  it("clears with the same attributes and Max-Age 0", () => {
    for (const secure of [true, false]) {
      expect(clearedFlashCookieOptions(secure)).toEqual({ ...flashCookieOptions(secure), maxAge: 0 });
    }
  });
});

describe("readFlashSlug", () => {
  it("accepts a valid slug, including one that names no row (the dashboard checks that)", () => {
    expect(readFlashSlug("mammography-nfz-program")).toBe("mammography-nfz-program");
    expect(readFlashSlug("deleted")).toBe("deleted");
  });

  it.each([undefined, "", "Mammography", "../x", "a b", "a&b"])("rejects %j", (value) => {
    expect(readFlashSlug(value)).toBeNull();
  });
});
