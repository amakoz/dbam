import { EMAIL_DRY_RUN, RESEND_API_KEY } from "astro:env/server";

// Transactional email from the Worker over Resend's REST API (one `fetch`, no SDK). With EMAIL_DRY_RUN=true it only
// logs, so local dev and CI never send and need no key. Logs never contain the API key or the recipient address.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Resend's shared test sender: without a verified domain it delivers only to the Resend account owner's address.
// Replace once Dbam has its own domain.
const FROM = "Dbam <onboarding@resend.dev>";
const SEND_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Sent as Resend's `Idempotency-Key`, so a retried call with the same key sends at most once. */
  idempotencyKey: string;
}

export type SendEmailResult = { id: string } | { dryRun: true };

/** A required email secret is missing on the Worker. */
export class EmailConfigError extends Error {
  override name = "EmailConfigError";
}

/** Resend rejected the send. Carries the HTTP status and Resend's error name, never its message (it can quote addresses). */
export class EmailSendError extends Error {
  override name = "EmailSendError";

  constructor(
    readonly status: number,
    readonly resendError: string,
  ) {
    super(`Resend responded ${status} (${resendError})`);
  }
}

export async function sendEmail({ to, subject, text, idempotencyKey }: EmailMessage): Promise<SendEmailResult> {
  if (EMAIL_DRY_RUN) {
    // No subject: reminder subjects may name a screening (health data), which must not reach Workers Logs.
    console.log(JSON.stringify({ event: "email", outcome: "dry-run", idempotencyKey }));
    return { dryRun: true };
  }
  if (!RESEND_API_KEY) {
    throw new EmailConfigError("RESEND_API_KEY is not set");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    // A hung Resend call would otherwise hold the cron run open until the platform's wall-time limit.
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new EmailSendError(response.status, typeof body?.name === "string" ? body.name : "unknown_error");
  }
  if (typeof body?.id !== "string") {
    throw new EmailSendError(response.status, "missing_id");
  }
  return { id: body.id };
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
