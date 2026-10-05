import { Circle, CircleCheck } from "lucide-react";
import type { Translate } from "@/i18n";
import { PASSWORD_MIN_LENGTH, passwordIssues, type PasswordIssue } from "@/lib/password";
import { cn } from "@/lib/utils";

interface PasswordRulesProps {
  password: string;
  t: Translate;
}

/** The sign-up password rules, each marked met or unmet for `password` by icon shape, colour and screen-reader text. */
export function PasswordRules({ password, t }: PasswordRulesProps) {
  const issues = passwordIssues(password);
  const rules: { issue: PasswordIssue; label: string }[] = [
    { issue: "too_short", label: t.plural("auth.form.passwordRuleLength", PASSWORD_MIN_LENGTH) },
    { issue: "needs_letter_and_digit", label: t("auth.form.passwordRuleLetterAndDigit") },
  ];

  return (
    <ul className="space-y-1">
      {rules.map(({ issue, label }) => {
        const met = !issues.includes(issue);
        const Icon = met ? CircleCheck : Circle;
        return (
          <li key={issue} className={cn("flex items-center gap-1", met ? "text-success" : "text-muted-foreground")}>
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span>
              {label}
              <span className="sr-only">
                {" "}
                ({met ? t("auth.form.passwordRuleMet") : t("auth.form.passwordRuleUnmet")})
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
