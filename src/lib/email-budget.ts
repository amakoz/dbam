// The daily email budget shared by the reminder jobs. Pure and in its own module (re-exported by `src/lib/email.ts`),
// so the reminder chain and its tests do not import `astro:env/server`.

/**
 * The most reminder emails (appointment, due-screening and follow-up nudge) one daily run sends, in that order.
 * Resend's free plan allows 100 emails a day and 3,000 a month: a month of 31 days at 92 reminders, 1 heartbeat and
 * up to 3 failure alerts a day is 31 × 96 = 2,976, under both.
 */
export const REMINDER_EMAIL_DAILY_BUDGET = 92;
