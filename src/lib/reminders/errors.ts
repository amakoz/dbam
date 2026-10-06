// Errors shared by the reminder jobs. Pure: no `astro:*` imports, so Vitest can build them.

/** A reminder database call failed. Carries the SQLSTATE only, never Postgres' message (it can quote row values). */
export class ReminderDatabaseError extends Error {
  override name = "ReminderDatabaseError";

  constructor(
    readonly step: "candidates" | "claim" | "mark",
    readonly code: string,
  ) {
    super(`Reminder ${step} failed (${code})`);
  }
}
