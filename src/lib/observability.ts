// Error events for Workers Logs, shared by the middleware (uncaught SSR errors), `scheduled()` (failed cron jobs) and
// the reminder failure email. Pure on purpose: no `astro:*` imports, so Vitest covers every builder.
//
// Privacy rule: an event holds names, short codes, route patterns and run ids only. Error messages are never copied
// (Postgres messages can quote row values, Resend's can quote addresses). Detail values must be static identifiers,
// never row or user values: the token rule below blocks free text and addresses, not a value like a screening slug.

/** A flat Workers Logs line. Not named `ErrorEvent`: that would shadow the Workers global. */
export interface ErrorLogEvent extends Record<string, string> {
  event: "error";
  source: "ssr" | "cron";
}

export interface ReminderFailureEmail {
  subject: string;
  text: string;
  idempotencyKey: string;
}

/** What a detail value or an error name may look like: one short identifier, no spaces, no `@`. */
const TOKEN = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Own properties of an error that may reach the logs and the email, in output order. */
const DETAIL_KEYS = ["operation", "step", "code", "status", "resendError"] as const;

const REMINDER_JOB = "appointment-reminder";

function isToken(value: string): boolean {
  return TOKEN.test(value);
}

function errorName(error: unknown): string {
  return error instanceof Error && isToken(error.name) ? error.name : "UnknownError";
}

function errorDetails(error: unknown): Record<string, string> {
  const details: Record<string, string> = {};
  if (!(error instanceof Error)) return details;
  for (const key of DETAIL_KEYS) {
    if (!Object.hasOwn(error, key)) continue;
    const value: unknown = Reflect.get(error, key);
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value);
    if (isToken(text)) details[key] = text;
  }
  return details;
}

function isoTime(time: number): string {
  return Number.isFinite(time) ? new Date(time).toISOString() : "unknown";
}

/** A request id for correlating an SSR event: Cloudflare's `cf-ray` (it is `$metadata.rayId` in Workers Logs). */
export function requestIdFrom(headers: Pick<Headers, "get">): string {
  const ray = headers.get("cf-ray");
  return ray !== null && isToken(ray) ? ray : crypto.randomUUID();
}

export function buildSsrErrorEvent({
  error,
  routePattern,
  requestId,
}: {
  error: unknown;
  routePattern: string;
  requestId: string;
}): ErrorLogEvent {
  return {
    event: "error",
    source: "ssr",
    route: routePattern,
    requestId,
    error: errorName(error),
    ...errorDetails(error),
  };
}

export function buildCronErrorEvent({
  error,
  job,
  cron,
  scheduledTime,
}: {
  error: unknown;
  job: string;
  cron: string;
  scheduledTime: number;
}): ErrorLogEvent {
  return {
    event: "error",
    source: "cron",
    job,
    requestId: `cron-${scheduledTime}`,
    cron,
    scheduledAt: isoTime(scheduledTime),
    error: errorName(error),
    ...errorDetails(error),
  };
}

/**
 * A copy of the error that is safe to rethrow into Astro's and Cloudflare's own logging, which print `stack` and
 * `message`. The name and the frame lines survive; the message does not, even when it spans lines or imitates a frame.
 */
export function redactError(error: unknown): Error {
  const name = errorName(error);
  const redacted = new Error("[redacted]");
  redacted.name = name;

  const frames: string[] = [];
  if (error instanceof Error && typeof error.stack === "string") {
    const { name: rawName, message, stack } = error;
    // Cut the exact `name: message` header, however many lines the message spans. Anything after it that looks like a
    // frame is then a real frame. If the stack does not start with that header, trust none of it.
    const header = `${rawName}: ${message}`;
    if (stack.startsWith(header)) {
      for (const line of stack.slice(header.length).split("\n")) {
        if (/^\s+at /.test(line)) frames.push(line);
      }
    }
  }
  redacted.stack = [`${name}: [redacted]`, ...frames].join("\n");
  return redacted;
}

/** The owner's email for a failed appointment reminder run. No addresses, no user data, no message text. */
export function buildReminderFailureEmail({
  error,
  cron,
  scheduledTime,
}: {
  error: unknown;
  cron: string;
  scheduledTime: number;
}): ReminderFailureEmail {
  const details = errorDetails(error);
  const lines = [
    "The Dbam appointment reminder job failed.",
    "",
    `Job: ${REMINDER_JOB}`,
    `Run: ${isoTime(scheduledTime)}`,
    `Cron: ${cron}`,
    `Error: ${errorName(error)}`,
    ...Object.entries(details).map(([key, value]) => `${key}: ${value}`),
    "",
  ];
  if (details.step === "mark") {
    lines.push("The reminder emails were sent but not marked; users may get a duplicate on the next run.", "");
  }
  lines.push('Details are in Workers Logs: see "Errors and alerts" in the README, saved query "Dbam cron errors".');

  return {
    subject: "Dbam: appointment reminder run failed",
    text: lines.join("\n"),
    idempotencyKey: `dbam-reminder-failure:${cron}:${scheduledTime}`,
  };
}

/** One structured line at error level, so Workers Logs files it under `error`. */
export function logErrorEvent(event: ErrorLogEvent): void {
  console.error(JSON.stringify(event));
}
