import React, { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { FormField } from "@/components/forms/FormField";
import { PasswordToggle } from "@/components/forms/PasswordToggle";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ServerError } from "@/components/forms/ServerError";
import { createT, type Locale } from "@/i18n";

interface Props {
  locale: Locale;
  serverError?: string | null;
}

export default function SignInForm({ locale, serverError }: Props) {
  const t = createT(locale);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
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
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
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
        placeholder={t("auth.form.passwordPlaceholder")}
        error={errors.password}
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

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText={t("auth.signin.pending")} icon={<LogIn aria-hidden="true" />}>
        {t("auth.signin.submit")}
      </SubmitButton>
    </form>
  );
}
