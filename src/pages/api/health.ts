import type { APIRoute } from "astro";
import { isSupabaseConfigured } from "@/lib/config-status";

// Health check for the deploy job and operators: 503 when the Worker is missing its Supabase secrets. It reports only
// a status word, never which secret is missing or any value.
export const GET: APIRoute = () => {
  const configured = isSupabaseConfigured();
  return new Response(JSON.stringify({ status: configured ? "ok" : "misconfigured" }), {
    status: configured ? 200 : 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};
