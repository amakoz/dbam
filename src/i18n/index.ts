import { en } from "@/i18n/en";
import { pl } from "@/i18n/pl";

export const LOCALES = ["pl", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pl";
export const LOCALE_COOKIE = "lang";

export type MessageKey = keyof typeof pl;
/** Base keys of plural messages: `foo` when the dictionary has `foo_other`. */
export type PluralKey = { [K in MessageKey]: K extends `${infer Base}_other` ? Base : never }[MessageKey];
export type MessageParams = Record<string, string | number>;

export interface Translate {
  (key: MessageKey, params?: MessageParams): string;
  plural: (baseKey: PluralKey, count: number, params?: MessageParams) => string;
}

const dictionaries: Record<Locale, Record<MessageKey, string>> = { pl, en };

export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(pl, key);
}

function interpolate(message: string, params?: MessageParams): string {
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function createT(locale: Locale): Translate {
  const dictionary = dictionaries[locale];
  const pluralRules = new Intl.PluralRules(locale);

  const t = ((key, params) => interpolate(dictionary[key], params)) as Translate;
  t.plural = (baseKey, count, params) => {
    const key = `${baseKey}_${pluralRules.select(count)}`;
    // Categories the dictionary does not define (e.g. "zero", "two") fall back to "other".
    return t(isMessageKey(key) ? key : `${baseKey}_other`, { count, ...params });
  };
  return t;
}
