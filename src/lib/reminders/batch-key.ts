/** Resend `Idempotency-Key` for this set of reminders: the same claim retried gives the same key. */
export async function batchKey(prefix: string, ids: number[]): Promise<string> {
  const sorted = [...ids].sort((a, b) => a - b).join(",");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sorted));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}:${hex}`;
}
