import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { ScreeningCompletion, ScreeningPlan } from "@/lib/screenings/rules";

/**
 * The user's own plans and done records. RLS already scopes both reads to the user; the filters make it explicit.
 * Throws on a database error, so an outage renders the 500 page instead of an unhandled-looking dashboard.
 */
export async function getUserScreenings(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ plans: ScreeningPlan[]; completions: ScreeningCompletion[] }> {
  const [plans, completions] = await Promise.all([
    supabase.from("screening_plans").select("*").eq("user_id", userId),
    supabase.from("screening_completions").select("*").eq("user_id", userId).order("updated_at", { ascending: false }),
  ]);
  if (plans.error) throw new Error(`Failed to read screening plans: ${plans.error.message}`);
  if (completions.error) throw new Error(`Failed to read screening completions: ${completions.error.message}`);
  return { plans: plans.data, completions: completions.data };
}
