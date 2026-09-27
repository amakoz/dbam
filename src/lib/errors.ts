import { isMessageKey, type MessageKey } from "@/i18n";

// Endpoints redirect with `?error=<code>` and pages translate the code via `errors.<code>`. Unknown codes and free text
// map to the generic message, so raw query text is never rendered.

/** Message key for a `?error=` value. */
export function errorMessageKey(code: string): MessageKey {
  const key = `errors.${code}`;
  return isMessageKey(key) ? key : "errors.unknown";
}
