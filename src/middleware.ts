import { defineMiddleware } from "astro:middleware";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/onboarding", "/profile", "/api/profile", "/api/consent", "/api/screenings"];

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.locale = resolveLocale(context.cookies.get(LOCALE_COOKIE)?.value);

  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (!PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    return next();
  }
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  // Protected pages show health data: keep them out of shared caches and the back/forward cache, so signing out on a
  // shared device doesn't leave the data one Back press away.
  const response = await next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
});
