import { isMessageKey, type MessageKey } from "@/i18n";

// Auth endpoints redirect with `?error=<code>` and pages translate the code via `errors.auth.<code>`. Local codes:
// `not_configured`, `missing_code`, `link_invalid`. Supabase codes are passed through only when translated.

/** The Supabase error `code` when a translation exists for it, otherwise `"unknown"`. */
export function authErrorCode(error: { code?: string }): string {
  return error.code && isMessageKey(`errors.auth.${error.code}`) ? error.code : "unknown";
}

/** Message key for a `?error=` value; unknown codes and free text map to the generic message. */
export function authErrorMessageKey(code: string): MessageKey {
  const key = `errors.auth.${code}`;
  return isMessageKey(key) ? key : "errors.auth.unknown";
}
