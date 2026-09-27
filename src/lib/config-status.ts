import { SUPABASE_URL, SUPABASE_KEY } from "astro:env/server";

// Operator-only signal read by `GET /api/health`. Server-only: never render it, and never expose the values themselves.

/** Whether the Supabase secrets are set on the server. */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
