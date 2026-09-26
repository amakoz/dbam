import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

// Target of the sign-up confirmation email (`emailRedirectTo` in signup.ts). Supabase has already confirmed the
// email when it redirects here with a PKCE `code`; exchanging it signs the user in.
export const GET: APIRoute = async (context) => {
  const params = context.url.searchParams;
  const code = params.get("code");
  const linkError = params.get("error_description") ?? params.get("error");

  if (linkError || !code) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(linkError ?? "Missing confirmation code")}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent("Supabase is not configured")}`);
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // The link was opened in a browser without the PKCE code-verifier cookie from sign-up (another device or
    // browser). The email is confirmed anyway, so ask the user to sign in instead of showing an error.
    return context.redirect("/auth/signin?confirmed=1");
  }

  return context.redirect("/");
};
