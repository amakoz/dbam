// The sign-up password policy, shared by the form and the endpoint. It must match Supabase Auth: `supabase/config.toml`
// (`minimum_password_length`, `password_requirements = "letters_digits"`) locally, and the production dashboard
// (Authentication → Email). Supabase's `letters_digits` counts only ASCII letters and digits, and so does this check,
// so the client never accepts a password the server rejects.

export const PASSWORD_MIN_LENGTH = 12;

export type PasswordIssue = "too_short" | "needs_letter_and_digit";

/** The rules `password` does not meet, in display order; empty when it is strong. */
export function passwordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  // Code points, not UTF-16 units: never more than Supabase counts, whether it counts runes or bytes.
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) issues.push("too_short");
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) issues.push("needs_letter_and_digit");
  return issues;
}
