import type { APIRoute } from "astro";
import { hasActiveConsent } from "@/lib/consent";
import { parseProfileForm } from "@/lib/profile";
import { createClient } from "@/lib/supabase";

// Where each form lives, and where a successful save goes.
const MODES = {
  onboarding: { page: "/onboarding", success: "/dashboard" },
  profile: { page: "/profile", success: "/profile?saved=1" },
} as const;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const mode = MODES[form.get("mode") === "profile" ? "profile" : "onboarding"];

  const supabase = createClient(context.request.headers, context.cookies);
  const user = context.locals.user;
  if (!supabase || !user) {
    return context.redirect("/auth/signin");
  }

  // Without an active consent nothing may be stored; send the user back to the consent step. (RLS enforces this too.)
  try {
    if (!(await hasActiveConsent(supabase, user.id))) {
      return context.redirect("/onboarding");
    }
  } catch {
    return context.redirect(`${mode.page}?error=save_failed`);
  }

  const parsed = parseProfileForm(form, new Date().getFullYear());
  if (!parsed.ok) {
    return context.redirect(`${mode.page}?error=invalid_profile`);
  }

  // user_id is left to its `auth.uid()` default, so the row can only ever be the caller's own.
  const { error } = await supabase.from("profiles").upsert(parsed.value, { onConflict: "user_id" });
  if (error) {
    return context.redirect(`${mode.page}?error=save_failed`);
  }

  return context.redirect(mode.success);
};
