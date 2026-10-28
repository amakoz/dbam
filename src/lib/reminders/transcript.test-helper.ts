import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, vi } from "vitest";

import type { Database } from "@/lib/database.types";
import type { CandidateRow } from "@/lib/reminders/candidates";
import type { RuleEntry } from "@/lib/catalog/schema";

// The recorder shared by the three reminder job tests (appointment.test.ts, due-screening.test.ts,
// follow-up-nudge.test.ts). A job runs exactly as `worker.ts` calls it against a fake Supabase client and a stubbed
// `fetch`; `record` returns everything it did, in order: result or error, log lines, RPC calls and Resend requests.
// Not matched by Vitest's `src/**/*.test.ts` include: it is imported, never run.

/** The run time the tests use: 2026-10-01 08:00 UTC, which is 10:00 in Warsaw on the daily cron (as in chain.test.ts). */
export const DAILY_RUN = { cron: "0 8,9 * * *", scheduledTime: 1790841600000 };
/** `warsawToday` of `DAILY_RUN`. */
export const RUN_DAY = "2026-10-01";
export const SITE = "https://dbam.example";
/** Where the heartbeat and the failure alert go. A reminder must never be sent here. */
export const HEARTBEAT_TO = "heartbeat.sentinel@example.test";

/** An address inside an error message the tests feed in: it must never reach a log line. */
export const LEAKED_ADDRESS = "leaked.person@example.com";
/** A completion slug the due job reads: it must reach neither a log line nor an email. */
export const CANARY_SLUG = "canary-screening-zz9";

// `astro:env/server` only exists inside the Astro build. The job tests mock it with `astroEnvModule()` and flip the
// dry-run switch per scenario through `emailEnv`.
export const emailEnv = { dryRun: false };

export function astroEnvModule() {
  return {
    get EMAIL_DRY_RUN() {
      return emailEnv.dryRun;
    },
    EMAIL_FROM: "Dbam <reminders@example.com>",
    RESEND_API_KEY: "re_test_key",
    REMINDER_TEST_TO: HEARTBEAT_TO,
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_SECRET_KEY: "sb_secret_test",
  };
}

export interface Rpc {
  kind: "rpc";
  name: string;
  args: unknown;
}
export interface FromSelect {
  kind: "from";
  table: string;
  columns: string;
  filter: [string, unknown];
}
export type Call = Rpc | FromSelect;

export interface Reply {
  data?: unknown;
  error?: { code: string; message: string };
}

/**
 * Answers `.rpc(name, args)` and `.from(table).select(cols).eq(col, val)` from `replies`, keyed by RPC name or
 * `from:<table>`, and appends each call to `calls`. A call with no reply fails the test.
 */
export function fakeClient(replies: Record<string, Reply>, calls: Call[]): SupabaseClient<Database> {
  const answer = (key: string): Promise<{ data: unknown; error: Reply["error"] | null }> => {
    const reply = replies[key] as Reply | undefined;
    if (!reply) throw new Error(`unexpected call: ${key}`);
    return Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null });
  };
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push({ kind: "rpc", name, args });
      return answer(name);
    },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: unknown) => {
          calls.push({ kind: "from", table, columns, filter: [column, value] });
          return answer(`from:${table}`);
        },
      }),
    }),
  };
  return client as unknown as SupabaseClient<Database>;
}

export interface Fetched {
  url: string;
  key: string | null;
  body: unknown;
}

/**
 * Stubs `fetch` as Resend: `"ok"` answers one id per message, `500` a failure whose message quotes an address,
 * `"missing-id"` a 200 without the ids. Returns the requests it received. Undo with `vi.unstubAllGlobals()`.
 */
export function stubResend(mode: "ok" | 500 | "missing-id"): Fetched[] {
  const fetched: Fetched[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      fetched.push({
        url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
        key: new Headers(init?.headers).get("idempotency-key"),
        body,
      });
      if (mode === 500) {
        const failure = { name: "internal_server_error", message: `Could not deliver to ${LEAKED_ADDRESS}` };
        return Promise.resolve(new Response(JSON.stringify(failure), { status: 500 }));
      }
      const count = Array.isArray(body) ? body.length : 0;
      const data = mode === "ok" ? Array.from({ length: count }, (_, index) => ({ id: `resend-${index + 1}` })) : [];
      return Promise.resolve(new Response(JSON.stringify({ data }), { status: 200 }));
    }),
  );
  return fetched;
}

/** A parsed JSON log line, or the raw string when the line is not JSON (e.g. the catalog's `console.error`). */
export type LogLine = Record<string, unknown> | string;

export interface ErrorSummary {
  name: string;
  step: unknown;
  code: unknown;
  operation: unknown;
  status: unknown;
  resendError: unknown;
}

export interface Recording<T> {
  result?: T;
  error?: ErrorSummary;
  /** The caught object itself, for `toBe`. */
  thrown?: unknown;
  logs: LogLine[];
  calls: Call[];
  fetches: Fetched[];
}

/** Runs `invoke` and records what it logged and returned or threw, plus the `calls` and `fetches` collected so far. */
export async function record<T>(
  invoke: () => Promise<T>,
  rig: { calls: Call[]; fetches: Fetched[] } = { calls: [], fetches: [] },
): Promise<Recording<T>> {
  const logs: LogLine[] = [];
  const capture = (...args: unknown[]) => {
    const line = args.map(String).join(" ");
    try {
      logs.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      logs.push(line);
    }
  };
  const log = vi.spyOn(console, "log").mockImplementation(capture);
  const error = vi.spyOn(console, "error").mockImplementation(capture);
  try {
    const result = await invoke();
    return { result, logs, calls: rig.calls, fetches: rig.fetches };
  } catch (thrown) {
    return { error: summarize(thrown), thrown, logs, calls: rig.calls, fetches: rig.fetches };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
}

function summarize(thrown: unknown): ErrorSummary {
  const read = (key: string): unknown => (thrown instanceof Error ? Reflect.get(thrown, key) : undefined);
  return {
    name: thrown instanceof Error ? thrown.name : "NotAnError",
    step: read("step"),
    code: read("code"),
    operation: read("operation"),
    status: read("status"),
    resendError: read("resendError"),
  };
}

/** The log lines with the given `event`, parsed ones only. */
export function eventLines(logs: LogLine[], event: string): Record<string, unknown>[] {
  return logs.filter((line): line is Record<string, unknown> => typeof line !== "string" && line.event === event);
}

/**
 * Privacy (lessons.md "privacy tests are the guard"): no log line, parsed or raw, holds an address or a canary.
 * `forbidden` adds scenario-specific strings.
 */
export function expectNoLeak(logs: LogLine[], forbidden: string[] = []): void {
  for (const line of logs) {
    const text = typeof line === "string" ? line : JSON.stringify(line);
    expect(text).not.toContain("@");
    expect(text).not.toContain(CANARY_SLUG);
    for (const secret of forbidden) expect(text).not.toContain(secret);
  }
}

/** The `cron` and `scheduledAt` fields every job log line of `DAILY_RUN` carries. */
export function runFields(): { cron: string; scheduledAt: string } {
  return { cron: DAILY_RUN.cron, scheduledAt: new Date(DAILY_RUN.scheduledTime).toISOString() };
}

// Shared fixtures --------------------------------------------------------------------------------------------------

/** An RPC error whose message quotes an address (Postgres messages can quote row values). */
export const LEAKY_RPC_ERROR = { code: "23505", message: `duplicate key value for ${LEAKED_ADDRESS}` };

/** A catalog row the due job reads: every adult, repeat every 12 months. */
export function ruleRow(slug: string): RuleEntry {
  return {
    slug,
    status: "active",
    eligibility: [{ age_min: 18, requires: [] }],
    interval_kind: "fixed",
    interval_months: 12,
    interval_overrides: [],
    evidence_level: 3,
    reviewed_by: "owner (non-medical review)",
  };
}

/** A candidate with one completion anchored at `anchor` (due 12 months later for `ruleRow`). */
export function candidateRow(user: number, slug: string, anchor: string): CandidateRow {
  return {
    user_id: `00000000-0000-0000-0000-${String(user).padStart(12, "0")}`,
    birth_year: 1977,
    sex: "female",
    smoking_status: "never",
    pack_years: null,
    years_since_quitting: null,
    completions: [{ catalog_slug: slug, anchor_month: anchor }],
  };
}

/** Claimed appointment reminders: a Polish user with two dates and an English user with one, ids out of order. */
export const APPOINTMENT_CLAIM = [
  {
    user_id: "u-1",
    email: "ala@example.com",
    locale: "pl",
    appointment_dates: ["2026-10-02", "2026-10-03"],
    reminder_ids: [5, 3],
  },
  { user_id: "u-2", email: "bob@example.com", locale: "en", appointment_dates: ["2026-10-04"], reminder_ids: [4] },
];

/** Claimed due-screening reminders: one user per locale, one and two exams. */
export const DUE_CLAIM = [
  { user_id: "u-1", email: "ala@example.com", locale: "pl", reminder_ids: [7] },
  { user_id: "u-2", email: "bob@example.com", locale: "en", reminder_ids: [9, 8] },
];

/** Claimed nudges: a confirm-only Polish user and an English user with both kinds. */
export const NUDGE_CLAIM = [
  { user_id: "u-1", email: "ala@example.com", locale: "pl", confirm_count: 2, schedule_count: 0, nudge_ids: [12, 11] },
  { user_id: "u-2", email: "bob@example.com", locale: "en", confirm_count: 1, schedule_count: 3, nudge_ids: [13] },
];
