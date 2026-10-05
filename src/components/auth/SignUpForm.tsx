import React, { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { PasswordToggle } from "@/components/forms/PasswordToggle";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ServerError } from "@/components/forms/ServerError";
import { createT, type Locale } from "@/i18n";

const MIN_PASSWORD_LENGTH = 6;

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

    if (!password) {
      next.password = t("auth.form.passwordRequired");
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = t.plural("auth.form.passwordTooShort", MIN_PASSWORD_LENGTH);
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

  const passwordHint =
    !errors.password && password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? (
      <p>{t.plural("auth.form.passwordRemaining", MIN_PASSWORD_LENGTH - password.length)}</p>
    ) : undefined;

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
        placeholder={t.plural("auth.form.passwordMinPlaceholder", MIN_PASSWORD_LENGTH)}
        error={errors.password}
        hint={passwordHint}
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
