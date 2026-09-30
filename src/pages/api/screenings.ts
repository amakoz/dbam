import type { APIRoute } from "astro";
import type { MessageKey } from "@/i18n";
import { getActiveCatalog } from "@/lib/catalog/read";
import { recommend } from "@/lib/catalog/recommend";
import { getOnboardingState } from "@/lib/consent";
import { readForm } from "@/lib/forms";
import { parseDoneForm, parsePlanForm, SLUG_PATTERN, warsawMonth, warsawToday } from "@/lib/screenings/rules";
import { createClient } from "@/lib/supabase";

// Plans and done records for the dashboard's exam items: `plan` (optional appointment date), `unplan`, `done`
// (optional month of the last exam) and `undone`. Every outcome redirects back to the dashboard, to the item's anchor.

const INTENTS = ["plan", "unplan", "done", "undone"] as const;
type Intent = (typeof INTENTS)[number];

function isIntent(value: unknown): value is Intent {
  return INTENTS.some((intent) => intent === value);
}

/** `errors.<code>` → `<code>`, for the `?error=` redirect. */
function errorCode(key: MessageKey): string {
  return key.replace(/^errors\./, "");
}

export const POST: APIRoute = async (context) => {
  const form = await readForm(context.request);
  if (!form) {
    return context.redirect("/dashboard?error=invalid_request");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  const user = context.locals.user;
  if (!supabase || !user) {
    return context.redirect("/auth/signin");
  }

  // The slug goes into the URL only once it is known to be safe there.
  const rawSlug = form.get("slug");
  const slug = typeof rawSlug === "string" && SLUG_PATTERN.test(rawSlug.trim()) ? rawSlug.trim() : null;
  const fail = (code: string) =>
    context.redirect(slug ? `/dashboard?error=${code}&slug=${slug}#screening-${slug}` : `/dashboard?error=${code}`);

  const intent = form.get("intent");
  if (!isIntent(intent)) {
    return fail("invalid_request");
  }
  // The dashboard shows the confirmation on the saved exam's row (`slug`), where the browser scrolls.
  const succeed = (saved: string) => context.redirect(`/dashboard?saved=${intent}&slug=${saved}#screening-${saved}`);

  // Removing a record needs no consent or recommendation check: RLS limits the delete to the caller's own row.
  if (intent === "unplan" || intent === "undone") {
    if (!slug) return fail("invalid_request");
    const table = intent === "unplan" ? "screening_plans" : "screening_completions";
    const { error } = await supabase.from(table).delete().eq("user_id", user.id).eq("catalog_slug", slug);
    if (error) return fail("save_failed");
    return succeed(slug);
  }

  // Without an active consent and a profile nothing may be stored; send the user back to onboarding. (RLS enforces
  // the consent too.)
  let profile;
  try {
    const onboarding = await getOnboardingState(supabase, user.id);
    if (onboarding.state !== "complete" || !onboarding.profile) {
      return context.redirect("/onboarding");
    }
    profile = onboarding.profile;
  } catch {
    return fail("save_failed");
  }

  const now = new Date();
  const parsed =
    intent === "plan"
      ? parsePlanForm(form, warsawToday(now))
      : parseDoneForm(form, warsawMonth(now), profile.birth_year);
  if (!parsed.ok) {
    return fail(errorCode(parsed.error));
  }
  const target = parsed.value.slug;

  // Only exams in the user's current tiers can be planned or marked done (not "may apply", draft or retired entries).
  // The year matches the dashboard's, so the check sees the same list the user saw.
  let catalog;
  try {
    catalog = await getActiveCatalog(supabase);
  } catch {
    return fail("save_failed");
  }
  const { tiers } = recommend(catalog, profile, now.getFullYear(), context.locals.locale);
  if (!Object.values(tiers).some((items) => items.some(({ entry }) => entry.slug === target))) {
    return fail("screening_not_available");
  }

  // user_id is left to its `auth.uid()` default, so the row can only ever be the caller's own.
  // A plan (the parsed shape narrows on its field, which `intent` alone does not).
  if ("appointment_date" in parsed.value) {
    const { error } = await supabase
      .from("screening_plans")
      .upsert(
        { catalog_slug: target, appointment_date: parsed.value.appointment_date },
        { onConflict: "user_id,catalog_slug" },
      );
    if (error) return fail("save_failed");
    return succeed(target);
  }

  // Write the done record before deleting the plan: a failed write must never lose the plan.
  const { error } = await supabase
    .from("screening_completions")
    .upsert(
      { catalog_slug: target, last_done_month: parsed.value.last_done_month },
      { onConflict: "user_id,catalog_slug" },
    );
  if (error) return fail("save_failed");

  const { error: deleteError } = await supabase
    .from("screening_plans")
    .delete()
    .eq("user_id", user.id)
    .eq("catalog_slug", target);
  if (deleteError) return fail("save_failed");

  return succeed(target);
};
