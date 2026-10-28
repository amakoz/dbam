import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PASSWORD_MIN_LENGTH, passwordIssues, type PasswordIssue } from "@/lib/password";

const EMOJI = "😀";

describe("passwordIssues", () => {
  it.each<{ password: string; expected: PasswordIssue[]; note: string }>([
    { password: "", expected: ["too_short", "needs_letter_and_digit"], note: "both rules, in display order" },
    { password: "abcdefghij1", expected: ["too_short"], note: "11 characters" },
    { password: "abcdefghijk1", expected: [], note: "12 characters (inclusive)" },
    { password: "abcdefghijkl", expected: ["needs_letter_and_digit"], note: "letters only" },
    { password: "123456789012", expected: ["needs_letter_and_digit"], note: "digits only" },
    { password: "ABCDEFGHIJK1", expected: [], note: "upper case counts as a letter" },
    { password: "ąęśćżźółńąęś1", expected: ["needs_letter_and_digit"], note: "Polish letters are not ASCII letters" },
    {
      password: `${EMOJI.repeat(5)}abcde1`,
      expected: ["too_short"],
      note: "11 code points, 16 UTF-16 units: length counts code points",
    },
    { password: `${EMOJI.repeat(11)}a1`, expected: [], note: "13 code points" },
  ])("$password → $expected ($note)", ({ password, expected }) => {
    expect(passwordIssues(password)).toEqual(expected);
  });
});

// The policy must match Supabase Auth: locally `supabase/config.toml` (checked here) and in production the dashboard
// (Authentication → Sign In / Providers → Email), which no test can read. Change all three together (CLAUDE.md).
describe("parity with supabase/config.toml", () => {
  const config = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/config.toml"), "utf8");

  it("minimum_password_length equals PASSWORD_MIN_LENGTH", () => {
    const match = /^minimum_password_length\s*=\s*(\d+)\s*$/m.exec(config);
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(PASSWORD_MIN_LENGTH);
  });

  it('password_requirements is "letters_digits"', () => {
    const match = /^password_requirements\s*=\s*"([^"]+)"/m.exec(config);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("letters_digits");
  });
});
