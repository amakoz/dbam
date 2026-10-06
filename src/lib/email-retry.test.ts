import { describe, expect, it, vi } from "vitest";

import { withRateLimitRetry } from "@/lib/email-retry";

function respond(status: number, headers: Record<string, string> = {}): Response {
  return new Response("{}", { status, headers });
}

describe("withRateLimitRetry", () => {
  it("retries a 429 once after the Retry-After seconds, capped at 2 s", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(respond(429, { "retry-after": "30" }))
      .mockResolvedValueOnce(respond(200));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await withRateLimitRetry(send, sleep);

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("waits the header's seconds when they are under the cap", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(respond(429, { "retry-after": "0.5" }))
      .mockResolvedValueOnce(respond(200));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRateLimitRetry(send, sleep);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("waits 1 s when Retry-After is missing or invalid", async () => {
    const cases: Record<string, string>[] = [
      {},
      { "retry-after": "soon" },
      { "retry-after": "-3" },
      { "retry-after": "" },
    ];
    for (const headers of cases) {
      const send = vi.fn().mockResolvedValueOnce(respond(429, headers)).mockResolvedValueOnce(respond(200));
      const sleep = vi.fn().mockResolvedValue(undefined);
      await withRateLimitRetry(send, sleep);
      expect(sleep).toHaveBeenCalledWith(1000);
    }
  });

  it("returns the second 429 and does not call a third time", async () => {
    const send = vi.fn().mockResolvedValue(respond(429));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const response = await withRateLimitRetry(send, sleep);

    expect(response.status).toBe(429);
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry other statuses", async () => {
    for (const status of [200, 400, 409, 500]) {
      const send = vi.fn().mockResolvedValue(respond(status));
      const sleep = vi.fn().mockResolvedValue(undefined);
      const response = await withRateLimitRetry(send, sleep);
      expect(response.status).toBe(status);
      expect(send).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  });

  it("lets the caller re-send the same idempotency key", async () => {
    const keys: (string | null)[] = [];
    const send = vi.fn((): Promise<Response> => {
      const request = new Request("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Idempotency-Key": "dbam-test:abc" },
      });
      keys.push(request.headers.get("idempotency-key"));
      return Promise.resolve(keys.length === 1 ? respond(429) : respond(200));
    });

    await withRateLimitRetry(send, () => Promise.resolve());

    expect(keys).toEqual(["dbam-test:abc", "dbam-test:abc"]);
  });
});
