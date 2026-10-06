import type { SupabaseClient } from "@supabase/supabase-js";
import { DatabaseError } from "@/lib/database-error";
import type { Database } from "@/lib/database.types";
import type { Profile } from "@/lib/profile";

// Bump whenever the consent text (`onboarding.consent.*` in src/i18n/pl.ts or en.ts) changes: every consent row
// records the version and the locale it was given under, as proof of what the user agreed to (GDPR Art. 7(1)).
// Format: the change date; add a `.N` suffix for a second change on the same day.
export const HEALTH_DATA_CONSENT_VERSION = "2026-09-30";

export type OnboardingState = "needs_consent" | "needs_profile" | "complete";

type Client = SupabaseClient<Database>;

/** Whether the user holds an active (not withdrawn) health-data consent. Throws on a database error. */
export async function hasActiveConsent(supabase: Client, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("health_data_consents")
    .select("id")
    .eq("user_id", userId)
    .is("withdrawn_at", null)
    .maybeSingle();
  if (error) throw new DatabaseError("read-consent", error.code);
  return data !== null;
}

/** Where the user is in onboarding. RLS already scopes both reads to the user; the filters make it explicit. */
export async function getOnboardingState(
  supabase: Client,
  userId: string,
): Promise<{ state: OnboardingState; profile: Profile | null }> {
  const [consented, profileResult] = await Promise.all([
    hasActiveConsent(supabase, userId),
    supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  if (profileResult.error) throw new DatabaseError("read-profile", profileResult.error.code);

  if (!consented) return { state: "needs_consent", profile: null };
  if (!profileResult.data) return { state: "needs_profile", profile: null };
  return { state: "complete", profile: profileResult.data };
}
