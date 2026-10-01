import type { APIRoute } from "astro";
import { readForm } from "@/lib/forms";
import { createClient } from "@/lib/supabase";

// Turns appointment reminders on or off for the signed-in user (`enabled` = `on` | `off`). The opt-in lives on the
// profile, so it needs an active consent and a profile (RLS) and is deleted with them on withdrawal. The database
// stamps `reminders_enabled_at` itself.
export const POST: APIRoute = async (context) => {
  const form = await readForm(context.request);
  if (!form) {
    return context.redirect("/profile?error=invalid_request");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const user = context.locals.user;
  if (!supabase || !user) {
    return context.redirect("/auth/signin");
  }

  const value = form.get("enabled");
  if (value !== "on" && value !== "off") {
    return context.redirect("/profile?error=invalid_request");
  }
  const enabled = value === "on";

  // Emails go out in the language the user saw when turning reminders on.
  const { data, error } = await supabase
    .from("profiles")
    .update(
      enabled ? { reminders_enabled: true, reminders_locale: context.locals.locale } : { reminders_enabled: false },
    )
    .eq("user_id", user.id)
    .select("user_id");
  if (error) {
    return context.redirect("/profile?error=reminders_failed#reminders");
  }
  // No row updated: there is no profile, or RLS hid it because the consent is not active. Onboarding sorts out which.
  if (data.length === 0) {
    return context.redirect("/onboarding");
  }

  return context.redirect(`/profile?reminders=${value}#reminders`);
};
