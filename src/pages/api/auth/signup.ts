import type { APIRoute } from "astro";
import { authErrorCode } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";
import { readForm } from "@/lib/forms";
import { passwordIssues } from "@/lib/password";

export const POST: APIRoute = async (context) => {
  const form = await readForm(context.request);
  if (!form) {
    return context.redirect("/auth/signup?error=validation_failed");
  }
  const email = form.get("email") as string;
  const password = form.get("password");
  // The policy Supabase enforces, checked first so a bypassed client check gets the same translated error.
  if (typeof password !== "string" || passwordIssues(password).length > 0) {
    return context.redirect("/auth/signup?error=weak_password");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signup?error=not_configured");
  }
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${context.url.origin}/api/auth/callback` },
  });

  if (error) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(authErrorCode(error))}`);
  }

  return context.redirect("/auth/confirm-email");
};
