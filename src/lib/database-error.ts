/**
 * An SSR-side Supabase read failed. Carries the operation and the PostgREST/SQLSTATE code only, never PostgREST's
 * message (it can quote row values), because Astro logs the thrown error's stack, message included.
 */
export class DatabaseError extends Error {
  override name = "DatabaseError";
  readonly code: string;

  constructor(
    readonly operation: string,
    code: string | null | undefined,
  ) {
    const resolved = code === null || code === undefined || code === "" ? "unknown" : code;
    super(`Database ${operation} failed (${resolved})`);
    this.code = resolved;
  }
}
