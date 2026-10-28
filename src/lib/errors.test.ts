import { describe, expect, it } from "vitest";

import { errorMessageKey } from "@/lib/errors";

describe("errorMessageKey", () => {
  it("maps a translated code to its key", () => {
    expect(errorMessageKey("invalid_request")).toBe("errors.invalid_request");
  });

  // Free-text fallbacks: whatever a `?error=` value holds, only a translated message is ever rendered.
  it.each(["no_such_code", "<b>raw text</b> from the query", "", "__proto__", "constructor"])(
    "%j → errors.unknown",
    (code) => {
      expect(errorMessageKey(code)).toBe("errors.unknown");
    },
  );
});
