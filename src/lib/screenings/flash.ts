import type { AstroCookieSetOptions } from "astro";
import { SLUG_PATTERN } from "./rules";

// The slug of the exam a `/api/screenings` redirect is about is health data, and request URLs end up in Workers Logs,
// so it travels in a short-lived cookie instead of the query. The dashboard reads it and clears it. Pure: the callers
// hold the `AstroCookies`, so the cookie's attributes are defined here once and set and clear can't drift apart.

export const FLASH_COOKIE = "screening_flash";

/** Only the dashboard reads the cookie, and it is gone after one render or a minute, whichever comes first. */
export function flashCookieOptions(secure: boolean): AstroCookieSetOptions {
  return { path: "/dashboard", httpOnly: true, sameSite: "lax", secure, maxAge: 60 };
}

/** Same attributes with `Max-Age=0`: the browser only drops a cookie when the `Path` matches the one it was set with. */
export function clearedFlashCookieOptions(secure: boolean): AstroCookieSetOptions {
  return { ...flashCookieOptions(secure), maxAge: 0 };
}

/** The cookie's value as a slug, or `null` when it is missing or not shaped like one. Naming a row is the caller's check. */
export function readFlashSlug(value: string | undefined): string | null {
  return value !== undefined && SLUG_PATTERN.test(value) ? value : null;
}

/** The dashboard redirect location: the one-shot message code in the query, the slug only in the fragment (never sent to a server). */
export function dashboardLocation(feedback: { saved: string } | { error: string } | null, slug: string | null): string {
  const query = feedback === null ? "" : "saved" in feedback ? `?saved=${feedback.saved}` : `?error=${feedback.error}`;
  return `/dashboard${query}${slug ? `#screening-${slug}` : ""}`;
}
