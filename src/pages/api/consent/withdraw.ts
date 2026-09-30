import type { APIRoute } from "astro";
import { readForm } from "@/lib/forms";
import { createClient } from "@/lib/supabase";

// Pages that render the withdraw form; errors go back to the page the form was on.
const SOURCES = { profile: "/profile", onboarding: "/onboarding" } as const;

// Withdraws health-data consent (GDPR Art. 7(3)). The database function deletes the caller's plans, done records and
// profile (with it the reminder opt-in) and stamps `withdrawn_at` on their active consent in one transaction; the
// consent row itself stays as proof it was given.
// Deleting data is irreversible, so the form must carry an explicit confirmation.
export const POST: APIRoute = async (context) => {
  const form = await readForm(context.request);
  const page = SOURCES[form?.get("from") === "onboarding" ? "onboarding" : "profile"];
  if (!form) {
    return context.redirect(`${page}?error=invalid_request`);
  }
  if (form.get("confirm") !== "yes") {
    return context.redirect(`${page}?error=withdraw_confirm_required`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase || !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const { error } = await supabase.rpc("withdraw_health_data_consent");
  if (error) {
    return context.redirect(`${page}?error=withdraw_failed`);
  }

  return context.redirect("/onboarding?withdrawn=1");
};
