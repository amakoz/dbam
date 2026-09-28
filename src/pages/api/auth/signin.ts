import type { APIRoute } from "astro";
import { authErrorCode } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase";
import { readForm } from "@/lib/forms";

export const POST: APIRoute = async (context) => {
  const form = await readForm(context.request);
  if (!form) {
    return context.redirect("/auth/signin?error=validation_failed");
  }
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=not_configured");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(authErrorCode(error))}`);
  }

  return context.redirect("/dashboard");
};
