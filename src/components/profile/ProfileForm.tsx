import React, { useState } from "react";
import { CalendarDays, Cigarette, Hourglass, Save, Timer } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
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
import { cn } from "@/lib/utils";

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

interface ChoiceGroupProps {
  name: ProfileField;
  legend: string;
  hint?: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function ChoiceGroup({ name, legend, hint, options, value, onChange, error }: ChoiceGroupProps) {
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={cn(hint && hintId, error && errorId) || undefined}>
      <legend className="mb-1 block text-sm text-blue-100/80">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-within:ring-2",
              value === option.value
                ? "border-purple-400 bg-purple-500/20 text-white"
                : "border-white/20 bg-white/10 text-blue-100/80 hover:bg-white/15",
              error ? "focus-within:ring-red-400" : "focus-within:ring-purple-400",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => {
                onChange(option.value);
              }}
              className="accent-purple-500"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-blue-100/50">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export default function ProfileForm({ locale, mode, initial, serverError }: Props) {
  const t = createT(locale);
  const [values, setValues] = useState<Values>(() => toValues(initial, locale));
  const [errors, setErrors] = useState<ProfileErrors>({});

  function set(field: ProfileField, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const result = parseProfileForm(new FormData(e.currentTarget), new Date().getFullYear());
    if (!result.ok) {
      e.preventDefault();
      setErrors(result.errors);
    }
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
        hint={<p className="mt-1 text-xs text-blue-100/50">{t("profile.form.birthYearHint")}</p>}
        icon={<CalendarDays className="size-4" />}
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
            hint={<p className="mt-1 text-xs text-blue-100/50">{t("profile.form.packsPerDayHint")}</p>}
            icon={<Cigarette className="size-4" />}
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
            icon={<Timer className="size-4" />}
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
          hint={<p className="mt-1 text-xs text-blue-100/50">{t("profile.form.yearsSinceQuittingHint")}</p>}
          icon={<Hourglass className="size-4" />}
        />
      )}

      {showPackYears && (
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm" aria-live="polite">
          <p className="font-medium text-white">
            {t("profile.form.packYears", { value: new Intl.NumberFormat(locale).format(packYears(packs, years)) })}
          </p>
          <p className="text-xs text-blue-100/50">{t("profile.form.packYearsHint")}</p>
        </div>
      )}

      <ServerError message={serverError} />

      <SubmitButton pendingText={t("profile.form.pending")} icon={<Save className="size-4" />}>
        {t(mode === "onboarding" ? "profile.form.submit.onboarding" : "profile.form.submit.profile")}
      </SubmitButton>
    </form>
  );
}
