import { EMAIL_DRY_RUN, EMAIL_FROM, RESEND_API_KEY } from "astro:env/server";

// Transactional email from the Worker over Resend's REST API (one `fetch`, no SDK). With EMAIL_DRY_RUN=true it only
// logs, so local dev and CI never send and need no key. Logs never contain the API key or the recipient address.

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const RESEND_BATCH_ENDPOINT = "https://api.resend.com/emails/batch";
// Resend's shared test sender: without a verified domain it delivers only to the Resend account owner's address. Used
// until EMAIL_FROM names a sender on the verified sending domain.
const SANDBOX_FROM = "Dbam <onboarding@resend.dev>";
const SEND_TIMEOUT_MS = 10_000;
/** Resend accepts at most 100 emails per batch request. */
export const MAX_BATCH_SIZE = 100;

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Sent as Resend's `Idempotency-Key`, so a retried call with the same key sends at most once. */
  idempotencyKey: string;
}

export type SendEmailResult = { id: string } | { dryRun: true };

/** One email of a batch. The batch shares one `Idempotency-Key`. */
export type BatchEmailMessage = Omit<EmailMessage, "idempotencyKey">;

export type SendEmailBatchResult = { ids: string[] } | { dryRun: true };

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
  const { response, body } = await postToResend(
    RESEND_ENDPOINT,
    { from: sender(), to: [to], subject, text },
    idempotencyKey,
  );
  if (typeof body?.id !== "string") {
    throw new EmailSendError(response.status, "missing_id");
  }
  return { id: body.id };
}

/** Sends 1–100 emails in one Resend request (`POST /emails/batch`); one `idempotencyKey` covers the whole batch. */
export async function sendEmailBatch({
  messages,
  idempotencyKey,
}: {
  messages: BatchEmailMessage[];
  idempotencyKey: string;
}): Promise<SendEmailBatchResult> {
  if (messages.length === 0 || messages.length > MAX_BATCH_SIZE) {
    throw new RangeError(`A batch holds 1 to ${MAX_BATCH_SIZE} emails, got ${messages.length}`);
  }
  if (EMAIL_DRY_RUN) {
    // Count only: no recipients or subjects.
    console.log(JSON.stringify({ event: "email", outcome: "dry-run", idempotencyKey, count: messages.length }));
    return { dryRun: true };
  }

  const from = sender();
  const { response, body } = await postToResend(
    RESEND_BATCH_ENDPOINT,
    messages.map(({ to, subject, text }) => ({ from, to: [to], subject, text })),
    idempotencyKey,
  );
  // Success body: `{ data: [{ id }, ...] }`, one id per message.
  const data: unknown = body?.data;
  if (!Array.isArray(data) || data.length !== messages.length) {
    throw new EmailSendError(response.status, "missing_id");
  }
  const ids: string[] = [];
  for (const item of data as unknown[]) {
    const id = readId(item);
    if (id === null) {
      throw new EmailSendError(response.status, "missing_id");
    }
    ids.push(id);
  }
  return { ids };
}

function sender(): string {
  return EMAIL_FROM ?? SANDBOX_FROM;
}

/** POSTs a JSON payload to Resend and returns the parsed body of a 2xx response; throws EmailSendError otherwise. */
async function postToResend(
  endpoint: string,
  payload: unknown,
  idempotencyKey: string,
): Promise<{ response: Response; body: Record<string, unknown> | null }> {
  if (!RESEND_API_KEY) {
    throw new EmailConfigError("RESEND_API_KEY is not set");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
    // A hung Resend call would otherwise hold the cron run open until the platform's wall-time limit.
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new EmailSendError(response.status, typeof body?.name === "string" ? body.name : "unknown_error");
  }
  return { response, body };
}

function readId(item: unknown): string | null {
  if (typeof item !== "object" || item === null || !("id" in item)) {
    return null;
  }
  return typeof item.id === "string" ? item.id : null;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
