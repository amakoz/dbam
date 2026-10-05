import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import type { AstroCookies } from "astro";
import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";
import type { Database } from "@/lib/database.types";

// PostgREST allows 30 s of `iat` skew, yet on the first request after idle it can judge a fresh
// token against a stale clock and reject it (401, PGRST303 "JWT issued at future"); the same
// token passes a moment later (#68). Retry that one error once, after 1 s: one full tick of
// PostgREST's one-second clock, and short enough on a rare path. Not covered by smoke: the
// stale clock can't be triggered on demand.
const JWT_RETRY_DELAY_MS = 1000;

async function isJwtIssuedAtFuture(response: Response): Promise<boolean> {
  if (response.status !== 401) {
    return false;
  }
  try {
    const body = await response.clone().json<{ code?: string; message?: string }>();
    return body.code === "PGRST303" && body.message === "JWT issued at future";
  } catch {
    return false;
  }
}

const fetchWithJwtRetry: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (!(await isJwtIssuedAtFuture(response))) {
    return response;
  }
  // eslint-disable-next-line no-console
  console.warn(`PostgREST rejected a fresh JWT as issued in the future, retrying once in ${JWT_RETRY_DELAY_MS} ms`);
  await new Promise((resolve) => setTimeout(resolve, JWT_RETRY_DELAY_MS));
  return fetch(input, init);
};

export function createClient(requestHeaders: Headers, cookies: AstroCookies) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, options);
        });
      },
    },
    global: { fetch: fetchWithJwtRetry },
  });
}
