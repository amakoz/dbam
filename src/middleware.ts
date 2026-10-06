import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n";
import { buildSsrErrorEvent, isRedacted, logErrorEvent, redactError, requestIdFrom } from "@/lib/observability";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = [
  "/dashboard",
  "/onboarding",
  "/profile",
  "/api/profile",
  "/api/consent",
  "/api/screenings",
  "/api/reminders",
];

export const onRequest = defineMiddleware(async (context, next) => {
  // Every uncaught SSR error passes through here, from the middleware itself, the page or the endpoint (Astro throws it
  // out of `next()`). Astro logs the error's `stack` and then renders the 500 page through this middleware a second
  // time, so: always rethrow a redacted copy (Astro's own lines then carry no message), but log the event only on the
  // first pass, never on the `/500` re-render. An error that is already redacted was logged by an inner pass of this
  // middleware (an Astro rewrite re-runs it inside `next()`), so it is rethrown unlogged.
  try {
    return await handleRequest(context, next);
  } catch (error) {
    if (isRedacted(error)) throw error;
    if (context.routePattern !== "/500") {
      try {
        logErrorEvent(
          buildSsrErrorEvent({
            error,
            routePattern: context.routePattern,
            requestId: requestIdFrom(context.request.headers),
          }),
        );
      } catch {
        // Building the event read a throwing property: skip the line rather than let that error escape unredacted.
      }
    }
    // The rethrow replaces the error object, so a handler that compares errors by identity (Astro's `astro/fetch`
    // middleware fallback does `err === nextError`) would take another path: recheck this on a handler migration.
    throw redactError(error);
  }
});

async function handleRequest(context: APIContext, next: MiddlewareNext): Promise<Response> {
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
}
