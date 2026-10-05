import React, { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { ChoiceGroup } from "@/components/forms/ChoiceGroup";
import { FormField } from "@/components/forms/FormField";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ServerError } from "@/components/forms/ServerError";
import { createT, type Locale } from "@/i18n";
import {
  SEX_LABEL_KEYS,
  SEX_VALUES,
  SMOKING_STATUS_LABEL_KEYS,
  SMOKING_STATUSES,
  packYears,
  parseProfileForm,
  type ProfileErrors,
  type ProfileField,
  type ProfileInput,
} from "@/lib/profile";

interface Props {
  locale: Locale;
  mode: "onboarding" | "profile";
  initial?: ProfileInput | null;
  serverError?: string | null;
}

type Values = Record<ProfileField, string>;

function toValues(initial: ProfileInput | null | undefined, locale: Locale): Values {
  const decimal = (n: number | null) => (n === null ? "" : new Intl.NumberFormat(locale).format(n));
  return {
    birth_year: initial ? String(initial.birth_year) : "",
    sex: initial?.sex ?? "",
    smoking_status: initial?.smoking_status ?? "",
    packs_per_day: decimal(initial?.packs_per_day ?? null),
    smoking_years: initial?.smoking_years == null ? "" : String(initial.smoking_years),
    years_since_quitting: initial?.years_since_quitting == null ? "" : String(initial.years_since_quitting),
  };
}

export default function ProfileForm({ locale, mode, initial, serverError }: Props) {
  const t = createT(locale);
  const [values, setValues] = useState<Values>(() => toValues(initial, locale));
  const [errors, setErrors] = useState<ProfileErrors>({});
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

  function set(field: ProfileField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = parseProfileForm(new FormData(e.currentTarget), new Date().getFullYear());
    if (!result.ok) {
      e.preventDefault();
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
  }

  const errorText = (field: ProfileField) => {
    const key = errors[field];
    return key ? t(key) : undefined;
  };

  const smokes = values.smoking_status === "current" || values.smoking_status === "former";
  const packs = Number(values.packs_per_day.replace(",", "."));
  const years = Number(values.smoking_years);
  const showPackYears = smokes && packs > 0 && Number.isInteger(years) && years > 0;

  return (
    <form method="POST" action="/api/profile" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="mode" value={mode} />

      <FormField
        id="birth_year"
        label={t("profile.form.birthYear")}
        type="text"
        value={values.birth_year}
        onChange={(v) => {
          set("birth_year", v);
        }}
        placeholder={t("profile.form.birthYearPlaceholder")}
        error={errorText("birth_year")}
        hint={<p>{t("profile.form.birthYearHint")}</p>}
      />

      <ChoiceGroup
        name="sex"
        legend={t("profile.form.sex")}
        hint={t("profile.form.sexHint")}
        options={SEX_VALUES.map((value) => ({ value, label: t(SEX_LABEL_KEYS[value]) }))}
        value={values.sex}
        onChange={(v) => {
          set("sex", v);
        }}
        error={errorText("sex")}
      />

      <ChoiceGroup
        name="smoking_status"
        legend={t("profile.form.smokingStatus")}
        options={SMOKING_STATUSES.map((value) => ({ value, label: t(SMOKING_STATUS_LABEL_KEYS[value]) }))}
        value={values.smoking_status}
        onChange={(v) => {
          set("smoking_status", v);
        }}
        error={errorText("smoking_status")}
      />

      {smokes && (
        <>
          <FormField
            id="packs_per_day"
            label={t("profile.form.packsPerDay")}
            type="text"
            value={values.packs_per_day}
            onChange={(v) => {
              set("packs_per_day", v);
            }}
            placeholder={t("profile.form.packsPerDayPlaceholder")}
            error={errorText("packs_per_day")}
            hint={<p>{t("profile.form.packsPerDayHint")}</p>}
          />
          <FormField
            id="smoking_years"
            label={t("profile.form.smokingYears")}
            type="text"
            value={values.smoking_years}
            onChange={(v) => {
              set("smoking_years", v);
            }}
            placeholder={t("profile.form.smokingYearsPlaceholder")}
            error={errorText("smoking_years")}
          />
        </>
      )}

      {values.smoking_status === "former" && (
        <FormField
          id="years_since_quitting"
          label={t("profile.form.yearsSinceQuitting")}
          type="text"
          value={values.years_since_quitting}
          onChange={(v) => {
            set("years_since_quitting", v);
          }}
          placeholder={t("profile.form.yearsSinceQuittingPlaceholder")}
          error={errorText("years_since_quitting")}
          hint={<p>{t("profile.form.yearsSinceQuittingHint")}</p>}
        />
      )}

      {showPackYears && (
        <div className="border-border bg-muted rounded-md border px-3 py-2 text-sm" aria-live="polite">
          <p className="text-foreground font-medium">
            {t("profile.form.packYears", { value: new Intl.NumberFormat(locale).format(packYears(packs, years)) })}
          </p>
          <p className="text-muted-foreground text-xs">{t("profile.form.packYearsHint")}</p>
        </div>
      )}

      <ServerError message={serverError} />

      <SubmitButton pending={submitting} pendingText={t("profile.form.pending")} icon={<Save aria-hidden="true" />}>
        {t(mode === "onboarding" ? "profile.form.submit.onboarding" : "profile.form.submit.profile")}
      </SubmitButton>
    </form>
  );
}
