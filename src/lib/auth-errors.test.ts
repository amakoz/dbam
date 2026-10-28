import { describe, expect, it } from "vitest";

import { authErrorCode, authErrorMessageKey } from "@/lib/auth-errors";

describe("authErrorCode", () => {
  it.each([
    { error: { code: "invalid_credentials" }, expected: "invalid_credentials", note: "a translated Supabase code" },
    { error: { code: "not_configured" }, expected: "not_configured", note: "a local code" },
    { error: {}, expected: "unknown", note: "no code" },
    { error: { code: "" }, expected: "unknown", note: "an empty code" },
    { error: { code: "bad_jwt" }, expected: "unknown", note: "an untranslated Supabase code" },
  ])("$error → $expected ($note)", ({ error, expected }) => {
    expect(authErrorCode(error)).toBe(expected);
  });
});

describe("authErrorMessageKey", () => {
  it("maps a translated code to its auth key", () => {
    expect(authErrorMessageKey("invalid_credentials")).toBe("errors.auth.invalid_credentials");
  });

  it.each(["unknown", "free text from the query"])("%j → errors.unknown", (code) => {
    expect(authErrorMessageKey(code)).toBe("errors.unknown");
  });
});
