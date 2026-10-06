import { describe, expect, it, vi } from "vitest";

import { DatabaseError } from "@/lib/database-error";
import {
  buildCronErrorEvent,
  buildReminderFailureEmail,
  buildSsrErrorEvent,
  isRedacted,
  logErrorEvent,
  redactError,
  requestIdFrom,
  type ReminderJob,
} from "@/lib/observability";

const SCHEDULED_TIME = 1790841600000;
const CRON = "0 8,9 * * *";
const ADDRESS = "jan.kowalski@example.com";
const JOBS: ReminderJob[] = ["appointment-reminder", "due-screening-reminder", "follow-up-nudge"];
const SQL = 'insert into profiles (email) values ("jan.kowalski@example.com")';

/** Same shape as `ReminderDatabaseError` in src/lib/reminders/errors.ts, which this module must not import. */
class StepError extends Error {
  override name = "ReminderDatabaseError";

  constructor(
    readonly step: string,
    readonly code: string,
  ) {
    super(`Reminder ${step} failed (${code})`);
  }
}

function leakyError(): Error {
  return new Error(`duplicate key value violates unique constraint for ${ADDRESS}: ${SQL}`);
}

describe("DatabaseError", () => {
  it("holds the operation and the code, never a message", () => {
    const dbError = new DatabaseError("read-consent", "PGRST301");
    expect(dbError.name).toBe("DatabaseError");
    expect(dbError.operation).toBe("read-consent");
    expect(dbError.code).toBe("PGRST301");
    expect(dbError.message).toBe("Database read-consent failed (PGRST301)");
  });

  it("falls back to unknown for an empty or missing code", () => {
    expect(new DatabaseError("read-profile", "").code).toBe("unknown");
    expect(new DatabaseError("read-profile", undefined).message).toBe("Database read-profile failed (unknown)");
  });
});

describe("error events never carry the message", () => {
  const error = leakyError();
  const secrets = [ADDRESS, "duplicate key", "insert into"];

  it("SSR event", () => {
    const json = JSON.stringify(buildSsrErrorEvent({ error, routePattern: "/dashboard", requestId: "abc" }));
    for (const secret of secrets) expect(json).not.toContain(secret);
  });

  it.each(JOBS)("cron event of the %s job", (job) => {
    const json = JSON.stringify(buildCronErrorEvent({ error, job, cron: CRON, scheduledTime: SCHEDULED_TIME }));
    for (const secret of secrets) expect(json).not.toContain(secret);
  });

  it("redacted error", () => {
    const redacted = redactError(error);
    for (const secret of secrets) {
      expect(redacted.message).not.toContain(secret);
      expect(redacted.stack).not.toContain(secret);
    }
  });

  it.each(JOBS)("failure email of the %s job", (job) => {
    const email = buildReminderFailureEmail({ job, error, cron: CRON, scheduledTime: SCHEDULED_TIME });
    for (const secret of secrets) {
      expect(email.subject).not.toContain(secret);
      expect(email.text).not.toContain(secret);
      expect(email.idempotencyKey).not.toContain(secret);
    }
  });

  it("failure email of the due job, for a candidates-step database error carrying the same leaky text", () => {
    const leaking = Object.assign(new StepError("candidates", "XX000"), { message: `${ADDRESS}: ${SQL}` });
    const email = buildReminderFailureEmail({
      job: "due-screening-reminder",
      error: leaking,
      cron: CRON,
      scheduledTime: SCHEDULED_TIME,
    });
    const event = JSON.stringify(
      buildCronErrorEvent({
        error: leaking,
        job: "due-screening-reminder",
        cron: CRON,
        scheduledTime: SCHEDULED_TIME,
      }),
    );
    for (const secret of secrets) {
      expect(email.text).not.toContain(secret);
      expect(event).not.toContain(secret);
    }
    expect(email.text).toContain("step: candidates");
    expect(event).toContain('"step":"candidates"');
  });
});

describe("detail whitelist", () => {
  it("drops extra own properties", () => {
    const error = Object.assign(new Error("boom"), { email: "a", details: "b", hint: "c", code: "42501" });
    const event = buildSsrErrorEvent({ error, routePattern: "/", requestId: "abc" });
    expect(event).toEqual({
      event: "error",
      source: "ssr",
      route: "/",
      requestId: "abc",
      error: "Error",
      code: "42501",
    });
  });

  it("drops a whitelisted key whose value is not a token", () => {
    const error = Object.assign(new Error("boom"), { code: "a b@c", step: "mark" });
    const event = buildSsrErrorEvent({ error, routePattern: "/", requestId: "abc" });
    expect(event).not.toHaveProperty("code");
    expect(event.step).toBe("mark");
  });

  it("stringifies a numeric status", () => {
    const error = Object.assign(new Error("boom"), { status: 403 });
    expect(buildSsrErrorEvent({ error, routePattern: "/", requestId: "abc" }).status).toBe("403");
  });

  it("ignores an inherited property", () => {
    const error = Object.create(Object.assign(new Error("boom"), { code: "42501" })) as Error;
    expect(buildSsrErrorEvent({ error, routePattern: "/", requestId: "abc" })).not.toHaveProperty("code");
  });

  it("carries the operation and code of a DatabaseError", () => {
    const event = buildSsrErrorEvent({
      error: new DatabaseError("read-consent", "PGRST301"),
      routePattern: "/dashboard",
      requestId: "8a1b2c3d4e5f6a7b-WAW",
    });
    expect(event).toEqual({
      event: "error",
      source: "ssr",
      route: "/dashboard",
      requestId: "8a1b2c3d4e5f6a7b-WAW",
      error: "DatabaseError",
      operation: "read-consent",
      code: "PGRST301",
    });
  });
});

describe("cron event", () => {
  it("has a run id, an ISO time and the step and code of the error", () => {
    const event = buildCronErrorEvent({
      error: new StepError("mark", "42501"),
      job: "appointment-reminder",
      cron: CRON,
      scheduledTime: SCHEDULED_TIME,
    });
    expect(event).toEqual({
      event: "error",
      source: "cron",
      job: "appointment-reminder",
      requestId: "cron-1790841600000",
      cron: CRON,
      scheduledAt: "2026-10-01T08:00:00.000Z",
      error: "ReminderDatabaseError",
      step: "mark",
      code: "42501",
    });
  });
});

describe("requestIdFrom", () => {
  it("returns a valid cf-ray value", () => {
    expect(requestIdFrom(new Headers({ "cf-ray": "8a1b2c3d4e5f6a7b-WAW" }))).toBe("8a1b2c3d4e5f6a7b-WAW");
  });

  it("falls back to a UUID when the header is missing or invalid", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    expect(requestIdFrom(new Headers())).toMatch(uuid);
    expect(requestIdFrom(new Headers({ "cf-ray": "not a ray" }))).toMatch(uuid);
  });
});

describe("redactError", () => {
  it("keeps the name and the frames, drops a multi-line message", () => {
    const redacted = redactError(new TypeError("line one\nline two\nline three"));
    expect(redacted.name).toBe("TypeError");
    expect(redacted.message).toBe("[redacted]");
    const [header, ...frames] = (redacted.stack ?? "").split("\n");
    expect(header).toBe("TypeError: [redacted]");
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) expect(frame).toMatch(/^\s+at /);
    expect(redacted.stack).not.toContain("line");
  });

  it("drops a message line that looks like a frame", () => {
    const redacted = redactError(new Error(`boom\n    at ${ADDRESS}`));
    expect(redacted.stack).not.toContain(ADDRESS);
    expect(redacted.stack).not.toContain("boom");
    expect(redacted.stack?.split("\n").length).toBeGreaterThan(1);
  });

  it("emits the header alone when the stack does not start with the name and message", () => {
    const error = new Error("boom");
    error.stack = `Something else entirely ${ADDRESS}\n    at somewhere (file.ts:1:1)`;
    expect(redactError(error).stack).toBe("Error: [redacted]");
  });

  it("keeps the frames of an error with an empty message", () => {
    const redacted = redactError(new TypeError());
    const [header, ...frames] = (redacted.stack ?? "").split("\n");
    expect(header).toBe("TypeError: [redacted]");
    expect(frames.length).toBeGreaterThan(0);

    // V8 itself prints the name alone; Vitest's source-map rewrite prints `TypeError: `.
    const plain = new TypeError();
    plain.stack = "TypeError\n    at handler (worker.js:1:1)";
    expect(redactError(plain).stack).toBe("TypeError: [redacted]\n    at handler (worker.js:1:1)");
  });

  it("trusts no frame when the message was shortened after the stack was captured", () => {
    const error = new Error(`boom ${ADDRESS}\n    at ${ADDRESS}`);
    expect(error.stack).toContain(ADDRESS);
    error.message = "boom";
    expect(redactError(error).stack).toBe("Error: [redacted]");
  });

  it("stops at an appended cause chain", () => {
    const error = new Error("boom");
    const cause = new Error(`cause\n    at ${ADDRESS}`);
    error.stack = `${error.stack ?? ""}\nCaused by: ${cause.stack ?? ""}`;
    const redacted = redactError(error);
    expect(redacted.stack).not.toContain(ADDRESS);
    expect(redacted.stack).not.toContain("Caused by");
    expect(redacted.stack?.split("\n").length).toBeGreaterThan(1);
  });

  it("drops a frame whose function is named after a user value", () => {
    const thrower = {
      [ADDRESS]: () => {
        throw new Error("boom");
      },
    };
    let error: unknown;
    try {
      thrower[ADDRESS]();
    } catch (caught) {
      error = caught;
    }
    expect((error as Error).stack).toContain(ADDRESS);
    const redacted = redactError(error);
    expect(redacted.stack).not.toContain(ADDRESS);
    expect(redacted.stack?.split("\n").length).toBeGreaterThan(1);
  });

  it("returns an already redacted error as-is", () => {
    const redacted = redactError(leakyError());
    expect(isRedacted(redacted)).toBe(true);
    expect(redactError(redacted)).toBe(redacted);
    expect(isRedacted(leakyError())).toBe(false);
  });

  it("returns an UnknownError when reading the error throws", () => {
    const error = new Error(`boom ${ADDRESS}`);
    Object.defineProperty(error, "stack", {
      get() {
        throw new Error(ADDRESS);
      },
    });
    const redacted = redactError(error);
    expect(redacted.stack).toBe("UnknownError: [redacted]");
    expect(isRedacted(redacted)).toBe(true);
  });

  it("returns an UnknownError for a non-Error value", () => {
    for (const value of ["jan.kowalski@example.com", { message: ADDRESS }, null, undefined, 42]) {
      const redacted = redactError(value);
      expect(redacted).toBeInstanceOf(Error);
      expect(redacted.name).toBe("UnknownError");
      expect(redacted.message).toBe("[redacted]");
      expect(redacted.stack).toBe("UnknownError: [redacted]");
    }
  });
});

describe("name token rule", () => {
  it("replaces a free-text name in the event and the redacted error", () => {
    const error = leakyError();
    error.name = `Failed for ${ADDRESS}`;
    const event = buildSsrErrorEvent({ error, routePattern: "/", requestId: "abc" });
    expect(event.error).toBe("UnknownError");
    expect(JSON.stringify(event)).not.toContain(ADDRESS);

    const redacted = redactError(error);
    expect(redacted.name).toBe("UnknownError");
    expect(redacted.stack).not.toContain(ADDRESS);
  });
});

describe("buildReminderFailureEmail", () => {
  const job = "appointment-reminder";

  it("uses a stable idempotency key per job and run", () => {
    const a = buildReminderFailureEmail({ job, error: new Error("x"), cron: CRON, scheduledTime: SCHEDULED_TIME });
    const b = buildReminderFailureEmail({
      job,
      error: new StepError("claim", "1"),
      cron: CRON,
      scheduledTime: SCHEDULED_TIME,
    });
    const later = buildReminderFailureEmail({
      job,
      error: new Error("x"),
      cron: CRON,
      scheduledTime: SCHEDULED_TIME + 1,
    });
    expect(a.idempotencyKey).toBe(`dbam-reminder-failure:appointment-reminder:${CRON}:${SCHEDULED_TIME}`);
    expect(b.idempotencyKey).toBe(a.idempotencyKey);
    expect(later.idempotencyKey).not.toBe(a.idempotencyKey);
  });

  it("gives the jobs different keys for the same run, so every alert can be sent", () => {
    const [appointment, due] = JOBS.map((reminderJob) =>
      buildReminderFailureEmail({ job: reminderJob, error: new Error("x"), cron: CRON, scheduledTime: SCHEDULED_TIME }),
    );
    expect(due.idempotencyKey).toBe(`dbam-reminder-failure:due-screening-reminder:${CRON}:${SCHEDULED_TIME}`);
    expect(due.idempotencyKey).not.toBe(appointment.idempotencyKey);
    expect(due.subject).not.toBe(appointment.subject);
  });

  it("names the follow-up nudge job in its subject and body", () => {
    const email = buildReminderFailureEmail({
      job: "follow-up-nudge",
      error: new StepError("claim", "42501"),
      cron: CRON,
      scheduledTime: SCHEDULED_TIME,
    });
    expect(email.subject).toBe("Dbam: follow-up nudge reminder run failed");
    expect(email.text).toContain("The Dbam follow-up nudge reminder job failed.");
    expect(email.text).toContain("Job: follow-up-nudge");
    expect(email.idempotencyKey).toBe(`dbam-reminder-failure:follow-up-nudge:${CRON}:${SCHEDULED_TIME}`);
    expect(email.text).not.toContain("appointment");
  });

  it("names the due job in its subject and body", () => {
    const email = buildReminderFailureEmail({
      job: "due-screening-reminder",
      error: new StepError("claim", "42501"),
      cron: CRON,
      scheduledTime: SCHEDULED_TIME,
    });
    expect(email.subject).toBe("Dbam: due-screening reminder run failed");
    expect(email.text).toContain("The Dbam due-screening reminder job failed.");
    expect(email.text).toContain("Job: due-screening-reminder");
    expect(email.text).not.toContain("appointment");
  });

  it("names the run and lists the details", () => {
    const email = buildReminderFailureEmail({
      job,
      error: new StepError("claim", "42501"),
      cron: CRON,
      scheduledTime: SCHEDULED_TIME,
    });
    expect(email.subject).toBe("Dbam: appointment reminder run failed");
    expect(email.text).toContain("Job: appointment-reminder");
    expect(email.text).toContain("Run: 2026-10-01T08:00:00.000Z");
    expect(email.text).toContain(`Cron: ${CRON}`);
    expect(email.text).toContain("Error: ReminderDatabaseError");
    expect(email.text).toContain("step: claim");
    expect(email.text).toContain("code: 42501");
    expect(email.text).toContain("Workers Logs");
  });

  it.each(JOBS)("warns about duplicates only for the mark step of the %s job", (reminderJob) => {
    const sentence = "The reminder emails were sent but not marked; users may get a duplicate on the next run.";
    const email = (error: unknown) =>
      buildReminderFailureEmail({ job: reminderJob, error, cron: CRON, scheduledTime: 1 });
    expect(email(new StepError("mark", "42501")).text).toContain(sentence);
    expect(email(new StepError("claim", "42501")).text).not.toContain(sentence);
    expect(email(new Error("x")).text).not.toContain(sentence);
  });
});

describe("logErrorEvent", () => {
  it("writes one JSON line at error level", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const event = buildSsrErrorEvent({
        error: new DatabaseError("read-catalog", "08006"),
        routePattern: "/",
        requestId: "abc",
      });
      logErrorEvent(event);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(JSON.parse(spy.mock.calls[0]?.[0] as string)).toEqual(event);
    } finally {
      spy.mockRestore();
    }
  });
});
