import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

// Withdraws health-data consent (GDPR Art. 7(3)). The database function deletes the caller's profile and stamps
// `withdrawn_at` on their active consent in one transaction; the consent row itself stays as proof it was given.
// Deleting data is irreversible, so the form must carry an explicit confirmation.
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  if (form.get("confirm") !== "yes") {
    return context.redirect("/profile?error=withdraw_confirm_required");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase || !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const { error } = await supabase.rpc("withdraw_health_data_consent");
  if (error) {
    return context.redirect("/profile?error=withdraw_failed");
  }

  return context.redirect("/onboarding?withdrawn=1");
};
