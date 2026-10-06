import { afterEach, describe, expect, it, vi } from "vitest";

// `astro:env/server` only exists inside the Astro build, so the secrets are stubbed here.
vi.mock("astro:env/server", () => ({
  EMAIL_DRY_RUN: false,
  EMAIL_FROM: "Dbam <reminders@example.com>",
  RESEND_API_KEY: "re_test_key",
}));

const { sendEmail, sendEmailBatch, EmailSendError } = await import("@/lib/email");

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fetch that answers with the given responses in turn, recording each call's headers and body. */
function stubFetch(...responses: Response[]) {
  const calls: { headers: Headers; body: string }[] = [];
  const fetchStub = vi.fn((_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : "" });
    const response = responses.shift();
    if (!response) throw new Error("unexpected extra fetch call");
    return Promise.resolve(response);
  });
  vi.stubGlobal("fetch", fetchStub);
  return { fetchStub, calls };
}

// `retry-after: 0` keeps the retry's wait at 0 ms.
const rateLimited = () =>
  new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status: 429, headers: { "retry-after": "0" } });
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("sendEmailBatch", () => {
  const messages = [
    { to: "a@example.com", subject: "Subject", text: "Text a" },
    { to: "b@example.com", subject: "Subject", text: "Text b" },
  ];

  it("retries a 429 once with the identical Idempotency-Key and body", async () => {
    const { fetchStub, calls } = stubFetch(rateLimited(), ok({ data: [{ id: "id-1" }, { id: "id-2" }] }));

    const result = await sendEmailBatch({ messages, idempotencyKey: "dbam-test:batch" });

    expect(result).toEqual({ ids: ["id-1", "id-2"] });
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(calls[0].headers.get("idempotency-key")).toBe("dbam-test:batch");
    expect(calls[1].headers.get("idempotency-key")).toBe("dbam-test:batch");
    expect(calls[1].body).toBe(calls[0].body);
    expect(JSON.parse(calls[1].body)).toHaveLength(2);
    expect(calls[1].headers.get("authorization")).toBe("Bearer re_test_key");
  });

  it("fails with the status and Resend's error name when the retry is also rate limited", async () => {
    const { fetchStub } = stubFetch(rateLimited(), rateLimited());

    await expect(sendEmailBatch({ messages, idempotencyKey: "dbam-test:batch" })).rejects.toMatchObject({
      name: "EmailSendError",
      status: 429,
      resendError: "rate_limit_exceeded",
    });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 500", async () => {
    const { fetchStub } = stubFetch(new Response("{}", { status: 500 }));
    await expect(sendEmailBatch({ messages, idempotencyKey: "dbam-test:batch" })).rejects.toBeInstanceOf(
      EmailSendError,
    );
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

describe("sendEmail", () => {
  it("retries a 429 once with the identical Idempotency-Key and body", async () => {
    const { fetchStub, calls } = stubFetch(rateLimited(), ok({ id: "id-1" }));

    const result = await sendEmail({
      to: "a@example.com",
      subject: "Subject",
      text: "Text",
      idempotencyKey: "dbam-test:single",
    });

    expect(result).toEqual({ id: "id-1" });
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(calls[0].headers.get("idempotency-key")).toBe("dbam-test:single");
    expect(calls[1].headers.get("idempotency-key")).toBe("dbam-test:single");
    expect(calls[1].body).toBe(calls[0].body);
  });
});
