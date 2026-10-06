// One bounded retry for Resend's per-second rate limit. Pure on purpose (no `astro:*` imports), so Vitest covers it.
// The heartbeat, both reminder batches and the failure alerts can reach Resend within about a second on a daily run;
// waiting costs wall time, not Worker CPU.

/** The longest wait before the retry, in milliseconds. */
export const MAX_RETRY_WAIT_MS = 2000;
/** The wait when `Retry-After` is missing or not a number of seconds. */
const DEFAULT_RETRY_WAIT_MS = 1000;

function waitFor(response: Response): number {
  const header = response.headers.get("retry-after")?.trim() ?? "";
  if (!/^\d+(\.\d+)?$/.test(header)) return DEFAULT_RETRY_WAIT_MS;
  return Math.min(Number(header) * 1000, MAX_RETRY_WAIT_MS);
}

/**
 * Calls `send`; on a 429 waits the `Retry-After` seconds (at most 2 s, 1 s when absent or invalid) and calls it once
 * more, returning that response whatever its status. Any other status is returned at once. `send` must be safe to
 * repeat: the Resend callers re-send the same body and `Idempotency-Key`.
 */
export async function withRateLimitRetry(
  send: () => Promise<Response>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Response> {
  const first = await send();
  if (first.status !== 429) return first;

  const wait = waitFor(first);
  await first.body?.cancel();
  await sleep(wait);
  return send();
}
