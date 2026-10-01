import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from "astro:env/server";
import type { Database } from "@/lib/database.types";

// The only place the Supabase secret key is used. It is for the cron's reminder job alone: the database strips its
// role (service_role) of every privilege on user tables, so all it can do is execute the two reminder functions. An
// ESLint `no-restricted-imports` rule keeps pages, components, layouts and the middleware from importing this module.

/** A secret the reminder job needs is missing on the Worker. */
export class ReminderConfigError extends Error {
  override name = "ReminderConfigError";
}

export function createReminderClient(): SupabaseClient<Database> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new ReminderConfigError("SUPABASE_URL or SUPABASE_SECRET_KEY is not set");
  }
  // No user session: the client acts as the secret key's role only, and nothing is persisted between cron runs.
  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
