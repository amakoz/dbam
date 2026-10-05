import React, { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { PasswordRules } from "@/components/forms/PasswordRules";
import { PasswordToggle } from "@/components/forms/PasswordToggle";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ServerError } from "@/components/forms/ServerError";
import { createT, type Locale } from "@/i18n";
import { PASSWORD_MIN_LENGTH, passwordIssues } from "@/lib/password";

interface Props {
  locale: Locale;
  serverError?: string | null;
}

export default function SignUpForm({ locale, serverError }: Props) {
  const t = createT(locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  // Back/Forward restores the page from bfcache with React state intact; re-enable the button.
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = t("auth.form.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t("auth.form.emailInvalid");
    }

    const issues = passwordIssues(password);
    if (!password) {
      next.password = t("auth.form.passwordRequired");
    } else if (issues.includes("too_short")) {
      next.password = t.plural("auth.form.passwordTooShort", PASSWORD_MIN_LENGTH);
    } else if (issues.includes("needs_letter_and_digit")) {
      next.password = t("auth.form.passwordNeedsLetterAndDigit");
    }

    if (!confirmPassword) {
      next.confirmPassword = t("auth.form.confirmPasswordRequired");
    } else if (password !== confirmPassword) {
      next.confirmPassword = t("auth.form.passwordMismatch");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label={t("auth.form.email")}
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder={t("auth.form.emailPlaceholder")}
        error={errors.email}
      />

      <FormField
        id="password"
        label={t("auth.form.password")}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={t.plural("auth.form.passwordMinPlaceholder", PASSWORD_MIN_LENGTH)}
        error={errors.password}
        hint={<PasswordRules password={password} t={t} />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
            t={t}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label={t("auth.form.confirmPassword")}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder={t("auth.form.confirmPasswordPlaceholder")}
        error={errors.confirmPassword}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
            t={t}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText={t("auth.signup.pending")} icon={<UserPlus aria-hidden="true" />}>
        {t("auth.signup.submit")}
      </SubmitButton>
    </form>
  );
}
