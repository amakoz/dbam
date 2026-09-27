import type { APIRoute } from "astro";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

// Only same-site paths: `//host` and `/\host` are protocol-relative URLs in browsers, i.e. an open redirect.
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  return next;
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const lang = form.get("lang");
  const locale = resolveLocale(typeof lang === "string" ? lang : undefined);

  context.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: ONE_YEAR_IN_SECONDS, sameSite: "lax" });

  return context.redirect(safeNext(form.get("next")));
};
