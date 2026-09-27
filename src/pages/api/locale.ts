import type { APIRoute } from "astro";
import { LOCALE_COOKIE, isLocale } from "@/i18n";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

// Only same-origin paths. Resolve the way a browser would (it strips tabs/newlines, so `/\t/host` means `//host`)
// instead of checking string prefixes, which such variants slip past into an open redirect.
function safeNext(next: FormDataEntryValue | null, base: URL): string {
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  const url = new URL(next, base);
  return url.origin === base.origin ? url.pathname + url.search + url.hash : "/";
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = form.get("lang");

  // A missing or unknown `lang` keeps the current preference instead of resetting it to the default.
  if (typeof lang === "string" && isLocale(lang)) {
    context.cookies.set(LOCALE_COOKIE, lang, { path: "/", maxAge: ONE_YEAR_IN_SECONDS, sameSite: "lax" });
  }

  return context.redirect(safeNext(form.get("next"), context.url));
};
