import type { APIRoute } from "astro";
import { HEALTH_DATA_CONSENT_VERSION } from "@/lib/consent";
import { createClient } from "@/lib/supabase";
import { readForm } from "@/lib/forms";

// Records explicit health-data consent (GDPR Art. 9). The checkbox is never pre-ticked, so a missing value means no
// consent. Granting twice is harmless: the one-active-consent index rejects the duplicate and we treat it as success.
export const POST: APIRoute = async (context) => {
  const form = await readForm(context.request);
  if (!form) {
    return context.redirect("/onboarding?error=invalid_request");
  }
  if (form.get("consent") !== "yes") {
    return context.redirect("/onboarding?error=consent_required");
  }
  // The form carries the version of the text it rendered. A page opened before the text changed must be re-read,
  // so the stored version is always the one the user actually saw.
  if (form.get("version") !== HEALTH_DATA_CONSENT_VERSION) {
    return context.redirect("/onboarding?error=consent_outdated");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase || !context.locals.user) {
    return context.redirect("/auth/signin");
  }

  const { error } = await supabase
    .from("health_data_consents")
    .insert({ consent_version: HEALTH_DATA_CONSENT_VERSION, locale: context.locals.locale });

  if (error && error.code !== "23505") {
    return context.redirect("/onboarding?error=save_failed");
  }

  return context.redirect("/onboarding");
};
