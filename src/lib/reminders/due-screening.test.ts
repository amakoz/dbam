import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReminderClient, ReminderConfigError } from "@/lib/reminders/admin-client";
import { runDueScreeningReminders } from "@/lib/reminders/due-screening";
import {
  candidateRow,
  CANARY_SLUG,
  DAILY_RUN,
  DUE_CLAIM,
  emailEnv,
  expectNoLeak,
  fakeClient,
  HEARTBEAT_TO,
  LEAKED_ADDRESS,
  LEAKY_RPC_ERROR,
  record,
  RUN_DAY,
  ruleRow,
  runFields,
  SITE,
  stubResend,
  type Call,
  type Reply,
} from "@/lib/reminders/transcript.test-helper";
import { isDailySendRun, PROVING_CRON } from "@/lib/schedule";

// Characterization test of the due-screening job as it is today, written before the runner refactor (F-13 plan,
// phase 1). It runs `runDueScreeningReminders` exactly as `worker.ts` does and pins the invariants I1–I15; the same
// file must stay green and unchanged through every later phase.

vi.mock("astro:env/server", async () => (await import("@/lib/reminders/transcript.test-helper")).astroEnvModule());
vi.mock("@/lib/reminders/admin-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reminders/admin-client")>()),
  createReminderClient: vi.fn(),
}));
vi.mock("@/lib/schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedule")>();
  return { ...actual, isDailySendRun: vi.fn(actual.isDailySendRun) };
});

const KEY_PREFIX = "dbam-due-screening-reminder";
// sha256("7,8,9"): the claim's ids sorted (I13).
const SENT_KEY = `${KEY_PREFIX}:57a770bf9f606fd425994d412b11428dd9ce3306e14491df578d1d5298762246`;
const SECOND_DAILY_RUN = { cron: DAILY_RUN.cron, scheduledTime: DAILY_RUN.scheduledTime + 3_600_000 };

// Anchored 2025-09: a 12-month exam is due 2026-09, before the run day. Anchored 2026-09 it is due 2027-09.
const DUE = [candidateRow(1, CANARY_SLUG, "2025-09-01"), candidateRow(2, CANARY_SLUG, "2025-09-01")];
const NOT_YET_DUE = [candidateRow(1, CANARY_SLUG, "2026-09-01")];
const CANDIDATES_ARGS = { kind: "rpc", name: "get_due_screening_candidates", args: { p_today: RUN_DAY, p_limit: 50 } };
const CATALOG_CALL = {
  kind: "from",
  table: "screening_catalog",
  columns: expect.stringContaining("slug, status") as unknown,
  filter: ["status", "active"],
};
const claimArgs = (userNumbers: number[]) => ({
  kind: "rpc",
  name: "claim_due_screening_reminders",
  args: {
    p_today: RUN_DAY,
    p_items: userNumbers.map((user) => ({
      user_id: `00000000-0000-0000-0000-${String(user).padStart(12, "0")}`,
      catalog_slug: CANARY_SLUG,
      anchor_month: "2025-09-01",
      due_month: "2026-09-01",
    })),
  },
});

const dueReplies: Record<string, Reply> = {
  get_due_screening_candidates: { data: DUE },
  "from:screening_catalog": { data: [ruleRow(CANARY_SLUG)] },
  claim_due_screening_reminders: { data: DUE_CLAIM },
  mark_due_screening_reminders_sent: { data: 3 },
};

beforeEach(() => {
  vi.stubEnv("SITE", SITE);
  emailEnv.dryRun = false;
  vi.mocked(createReminderClient).mockReset();
  vi.mocked(isDailySendRun).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function arrange(replies: Record<string, Reply>, resend: "ok" | 500 | "missing-id" = "ok") {
  const calls: Call[] = [];
  const fetches = stubResend(resend);
  vi.mocked(createReminderClient).mockReturnValue(fakeClient(replies, calls));
  return { calls, fetches };
}

const runJob = (rig: ReturnType<typeof arrange>, budget = 92, run = DAILY_RUN) =>
  record(() => runDueScreeningReminders(run, { budget }), rig);

describe("runDueScreeningReminders", () => {
  describe("the gates", () => {
    it.each([
      ["the proving cron", { cron: PROVING_CRON, scheduledTime: DAILY_RUN.scheduledTime }],
      ["the 11:00 Warsaw daily run", SECOND_DAILY_RUN],
    ])("skips on %s without touching the database or Resend", async (_name, run) => {
      const rig = arrange({});

      const out = await runJob(rig, 92, run);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "skipped",
          cron: run.cron,
          scheduledAt: new Date(run.scheduledTime).toISOString(),
        },
      ]);
      expect(out.calls).toEqual([]);
      expect(out.fetches).toEqual([]);
    });

    it("logs `failed` and rethrows the same error when the send gate throws (I6)", async () => {
      const rig = arrange({});
      const boom = new Error(`no hour for ${HEARTBEAT_TO}`);
      vi.mocked(isDailySendRun).mockImplementationOnce(() => {
        throw boom;
      });

      const out = await runJob(rig);

      expect(out.thrown).toBe(boom);
      expect(out.logs).toEqual([
        { event: "due-screening-reminder", outcome: "failed", ...runFields(), error: "Error" },
      ]);
      expectNoLeak(out.logs, [HEARTBEAT_TO]);
    });

    it("skips with `no-budget` at budget 0, before any database call", async () => {
      const rig = arrange({});

      const out = await runJob(rig, 0);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(out.logs).toEqual([
        { event: "due-screening-reminder", outcome: "skipped", ...runFields(), reason: "no-budget" },
      ]);
      expect(out.calls).toEqual([]);
    });

    it("skips at budget 0 without calling the client factory, even if it would throw (I14)", async () => {
      const rig = arrange({});
      vi.mocked(createReminderClient).mockImplementation(() => {
        throw new ReminderConfigError("SUPABASE_SECRET_KEY is not set");
      });

      const out = await runJob(rig, 0);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(createReminderClient).not.toHaveBeenCalled();
    });

    it("skips on a skipped run without calling the client factory, even if it would throw (I14)", async () => {
      const rig = arrange({});
      vi.mocked(createReminderClient).mockImplementation(() => {
        throw new ReminderConfigError("SUPABASE_SECRET_KEY is not set");
      });

      const out = await runJob(rig, 92, SECOND_DAILY_RUN);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(createReminderClient).not.toHaveBeenCalled();
    });

    it("logs `failed` with ReminderConfigError on a daily run and rethrows the factory's own error (I6, I14)", async () => {
      const rig = arrange({});
      const missing = new ReminderConfigError("SUPABASE_SECRET_KEY is not set");
      vi.mocked(createReminderClient).mockImplementation(() => {
        throw missing;
      });

      const out = await runJob(rig);

      expect(out.thrown).toBe(missing);
      expect(out.logs).toEqual([
        { event: "due-screening-reminder", outcome: "failed", ...runFields(), error: "ReminderConfigError" },
      ]);
    });
  });

  describe("outcomes", () => {
    it("resolves `none` with `candidates: 0` when there are no candidates (I15)", async () => {
      const rig = arrange({ get_due_screening_candidates: { data: [] } });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "none", sent: 0 });
      expect(out.logs).toEqual([
        { event: "due-screening-reminder", outcome: "none", ...runFields(), candidates: 0, due: 0, sent: 0 },
      ]);
      expect(out.calls).toEqual([CANDIDATES_ARGS]);
    });

    it("resolves `none` when no candidate is due yet, and never claims", async () => {
      const rig = arrange({
        get_due_screening_candidates: { data: NOT_YET_DUE },
        "from:screening_catalog": dueReplies["from:screening_catalog"],
      });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "none", sent: 0 });
      expect(out.logs).toEqual([
        { event: "due-screening-reminder", outcome: "none", ...runFields(), candidates: 1, due: 0, sent: 0 },
      ]);
      expect(out.calls).toEqual([CANDIDATES_ARGS, CATALOG_CALL]);
    });

    it("resolves `none` when the claim comes back empty", async () => {
      const rig = arrange({ ...dueReplies, claim_due_screening_reminders: { data: [] } });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "none", sent: 0 });
      expect(out.logs).toEqual([
        { event: "due-screening-reminder", outcome: "none", ...runFields(), candidates: 2, due: 0, sent: 0 },
      ]);
      expect(out.calls).toEqual([CANDIDATES_ARGS, CATALOG_CALL, claimArgs([1, 2])]);
      expect(out.fetches).toEqual([]);
    });

    it("claims only `budget` users: budget 1 claims one item", async () => {
      const rig = arrange({ ...dueReplies, claim_due_screening_reminders: { data: [DUE_CLAIM[0]] } });

      const out = await runJob(rig, 1);

      expect(out.calls[2]).toEqual(claimArgs([1]));
      expect(out.result).toEqual({ outcome: "sent", sent: 1 });
    });

    it("claims, sends nothing and marks nothing on a dry run (I1–I3, I15)", async () => {
      emailEnv.dryRun = true;
      const rig = arrange(dueReplies);

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "dry-run", sent: 0 });
      // The claim ran (I2); no mark call follows (I1).
      expect(out.calls).toEqual([CANDIDATES_ARGS, CATALOG_CALL, claimArgs([1, 2])]);
      expect(out.fetches).toEqual([]);
      expect(out.logs).toEqual([
        { event: "email", outcome: "dry-run", idempotencyKey: SENT_KEY, count: 2 },
        { event: "due-screening-reminder", outcome: "dry-run", ...runFields(), candidates: 2, due: 2, sent: 0 },
      ]);
    });

    it("sends one batch to the claimed users, names no exam, and marks their ids (I4, I9, I13, I15)", async () => {
      const rig = arrange(dueReplies);

      const out = await runJob(rig);

      expect(out).toEqual({
        result: { outcome: "sent", sent: 2 },
        logs: [{ event: "due-screening-reminder", outcome: "sent", ...runFields(), candidates: 2, due: 2, sent: 2 }],
        calls: [
          CANDIDATES_ARGS,
          CATALOG_CALL,
          claimArgs([1, 2]),
          // The claim's ids flattened in claim order (7, then 9, 8), not sorted.
          { kind: "rpc", name: "mark_due_screening_reminders_sent", args: { p_ids: [7, 9, 8] } },
        ],
        fetches: [
          {
            url: "https://api.resend.com/emails/batch",
            key: SENT_KEY,
            body: [
              {
                from: "Dbam <reminders@example.com>",
                to: ["ala@example.com"],
                subject: "Dbam: czas na badanie profilaktyczne",
                text: [
                  "Dzień dobry,",
                  "",
                  "Minął zalecany odstęp od jednego z Twoich badań profilaktycznych. Czas je powtórzyć.",
                  "",
                  "Zobacz, których badań to dotyczy, w swoim panelu Dbam: https://dbam.example/dashboard",
                  "",
                  "Nie chcesz dostawać przypomnień? Wyłącz je w swoim profilu: https://dbam.example/profile#reminders",
                  "",
                ].join("\n"),
              },
              {
                from: "Dbam <reminders@example.com>",
                to: ["bob@example.com"],
                subject: "Dbam: time to repeat a preventive exam",
                text: [
                  "Hello,",
                  "",
                  "The recommended interval since 2 of your preventive exams has passed. It's time to repeat them.",
                  "",
                  "See which ones in your Dbam dashboard: https://dbam.example/dashboard",
                  "",
                  "Don't want these reminders? Turn them off in your profile: https://dbam.example/profile#reminders",
                  "",
                ].join("\n"),
              },
            ],
          },
        ],
      });
      expect(JSON.stringify(out.fetches)).not.toContain(HEARTBEAT_TO);
      expect(out.fetches[0]?.key).toMatch(new RegExp(`^${KEY_PREFIX}:[0-9a-f]{64}$`));
      // The exam is only in the claim items; neither a log line nor an email names it (I9).
      expect(JSON.stringify(out.fetches)).not.toContain(CANARY_SLUG);
      expectNoLeak(out.logs);
    });
  });

  describe("failures (I6, I7, I8)", () => {
    it("fails at the candidates call with a code-only error", async () => {
      const rig = arrange({ get_due_screening_candidates: { error: LEAKY_RPC_ERROR } });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "candidates", code: "23505" });
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "failed",
          ...runFields(),
          error: "ReminderDatabaseError",
          step: "candidates",
          code: "23505",
        },
      ]);
      expectNoLeak(out.logs);
    });

    it("fails with code `invalid` on a malformed candidate row, without echoing it", async () => {
      const rig = arrange({ get_due_screening_candidates: { data: [{ ...DUE[0], sex: LEAKED_ADDRESS }] } });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "candidates", code: "invalid" });
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "failed",
          ...runFields(),
          error: "ReminderDatabaseError",
          step: "candidates",
          code: "invalid",
        },
      ]);
      expect(out.calls).toEqual([CANDIDATES_ARGS]);
      expectNoLeak(out.logs, [LEAKED_ADDRESS]);
      expect((out.thrown as Error).message).not.toContain("@");
    });

    it("fails at the catalog read with a DatabaseError", async () => {
      const rig = arrange({
        get_due_screening_candidates: { data: DUE },
        "from:screening_catalog": { error: LEAKY_RPC_ERROR },
      });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "DatabaseError", operation: "read-catalog", code: "23505" });
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "failed",
          ...runFields(),
          error: "DatabaseError",
          operation: "read-catalog",
          code: "23505",
        },
      ]);
      expectNoLeak(out.logs);
    });

    it("keeps the catalog's plain-text `console.error` for a bad row and still finishes the run", async () => {
      const rig = arrange({
        ...dueReplies,
        "from:screening_catalog": { data: [ruleRow(CANARY_SLUG), { slug: "broken-entry" }] },
        claim_due_screening_reminders: { data: [] },
      });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "none", sent: 0 });
      expect(out.logs).toEqual([
        "Skipping invalid catalog entry broken-entry",
        { event: "due-screening-reminder", outcome: "none", ...runFields(), candidates: 2, due: 0, sent: 0 },
      ]);
    });

    it("fails at the claim with a code-only error and no send", async () => {
      const rig = arrange({ ...dueReplies, claim_due_screening_reminders: { error: LEAKY_RPC_ERROR } });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "claim", code: "23505" });
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "failed",
          ...runFields(),
          error: "ReminderDatabaseError",
          step: "claim",
          code: "23505",
        },
      ]);
      expect(out.fetches).toEqual([]);
      expectNoLeak(out.logs);
    });

    it("fails on a Resend 500 with its status and error name, and marks nothing", async () => {
      const rig = arrange(dueReplies, 500);

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "EmailSendError", status: 500, resendError: "internal_server_error" });
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "failed",
          ...runFields(),
          error: "EmailSendError",
          status: "500",
          resendError: "internal_server_error",
        },
      ]);
      expect(out.calls).toEqual([CANDIDATES_ARGS, CATALOG_CALL, claimArgs([1, 2])]);
      expect((out.thrown as Error).message).not.toContain("@");
      expectNoLeak(out.logs, [LEAKED_ADDRESS]);
    });

    it("fails on a Resend 200 without ids as `missing_id`, and marks nothing", async () => {
      const rig = arrange(dueReplies, "missing-id");

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "EmailSendError", status: 200, resendError: "missing_id" });
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "failed",
          ...runFields(),
          error: "EmailSendError",
          status: "200",
          resendError: "missing_id",
        },
      ]);
      expect(out.calls).toHaveLength(3);
    });

    it("fails at the mark after the send, with a code-only error", async () => {
      const rig = arrange({ ...dueReplies, mark_due_screening_reminders_sent: { error: LEAKY_RPC_ERROR } });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "mark", code: "23505" });
      expect(out.fetches).toHaveLength(1);
      expect(out.logs).toEqual([
        {
          event: "due-screening-reminder",
          outcome: "failed",
          ...runFields(),
          error: "ReminderDatabaseError",
          step: "mark",
          code: "23505",
        },
      ]);
      expectNoLeak(out.logs);
    });
  });
});
