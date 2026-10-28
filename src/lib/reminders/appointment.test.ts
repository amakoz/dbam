import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReminderClient, ReminderConfigError } from "@/lib/reminders/admin-client";
import { runAppointmentReminders } from "@/lib/reminders/appointment";
import {
  APPOINTMENT_CLAIM,
  DAILY_RUN,
  emailEnv,
  expectNoLeak,
  fakeClient,
  HEARTBEAT_TO,
  LEAKY_RPC_ERROR,
  record,
  RUN_DAY,
  runFields,
  SITE,
  stubResend,
  type Call,
  type Reply,
} from "@/lib/reminders/transcript.test-helper";
import { isDailySendRun, PROVING_CRON } from "@/lib/schedule";

// Characterization test of the appointment job as it is today, written before the runner refactor (F-13 plan, phase 1).
// It runs `runAppointmentReminders` exactly as `worker.ts` does and pins the invariants I1–I15 of the plan; the same
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

const KEY_PREFIX = "dbam-appointment-reminder";
// sha256("3,4,5"): the claim's ids sorted, so the key is the same for a retried run (I13).
const SENT_KEY = `${KEY_PREFIX}:a752d8ffaabe4c4d8a7a10cbdb2ee1525130a56a8290eef5d8a695434c49928f`;
const CLAIM_ARGS = { kind: "rpc", name: "claim_due_appointment_reminders", args: expect.anything() as unknown };
// 11:00 Warsaw on the daily cron: the second UTC run, which skips.
const SECOND_DAILY_RUN = { cron: DAILY_RUN.cron, scheduledTime: DAILY_RUN.scheduledTime + 3_600_000 };

const claimReply: Reply = { data: APPOINTMENT_CLAIM };
const markReply: Reply = { data: 3 };

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

const runJob = (rig: ReturnType<typeof arrange>, run = DAILY_RUN) => record(() => runAppointmentReminders(run), rig);

describe("runAppointmentReminders", () => {
  describe("the send gate", () => {
    it.each([
      ["the proving cron", { cron: PROVING_CRON, scheduledTime: DAILY_RUN.scheduledTime }],
      ["the 11:00 Warsaw daily run", SECOND_DAILY_RUN],
    ])("skips on %s without touching the database or Resend", async (_name, run) => {
      const rig = arrange({});

      const out = await runJob(rig, run);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(out.logs).toEqual([
        {
          event: "appointment-reminder",
          outcome: "skipped",
          cron: run.cron,
          scheduledAt: new Date(run.scheduledTime).toISOString(),
        },
      ]);
      expect(out.calls).toEqual([]);
      expect(out.fetches).toEqual([]);
    });

    it("logs `failed` and rethrows the same error when the gate throws (I6)", async () => {
      const rig = arrange({});
      const boom = new Error(`no hour for ${HEARTBEAT_TO}`);
      vi.mocked(isDailySendRun).mockImplementationOnce(() => {
        throw boom;
      });

      const out = await runJob(rig);

      expect(out.thrown).toBe(boom);
      expect(out.logs).toEqual([{ event: "appointment-reminder", outcome: "failed", ...runFields(), error: "Error" }]);
      expectNoLeak(out.logs, [HEARTBEAT_TO]);
    });

    it("skips on a skipped run even when the client factory would throw (I14)", async () => {
      const rig = arrange({});
      vi.mocked(createReminderClient).mockImplementation(() => {
        throw new ReminderConfigError("SUPABASE_SECRET_KEY is not set");
      });

      const out = await runJob(rig, SECOND_DAILY_RUN);

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
        { event: "appointment-reminder", outcome: "failed", ...runFields(), error: "ReminderConfigError" },
      ]);
      expect(out.fetches).toEqual([]);
    });
  });

  describe("outcomes", () => {
    it("resolves `none` for an empty claim, after one claim with the lead days and the daily budget (I15)", async () => {
      const rig = arrange({ claim_due_appointment_reminders: { data: [] } });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "none", sent: 0 });
      expect(out.logs).toEqual([{ event: "appointment-reminder", outcome: "none", ...runFields(), due: 0, sent: 0 }]);
      expect(out.calls).toEqual([
        {
          kind: "rpc",
          name: "claim_due_appointment_reminders",
          args: { p_today: RUN_DAY, p_lead_days: 3, p_limit: 92 },
        },
      ]);
      expect(out.fetches).toEqual([]);
    });

    it("claims, sends nothing and marks nothing on a dry run (I1–I3, I15)", async () => {
      emailEnv.dryRun = true;
      const rig = arrange({ claim_due_appointment_reminders: claimReply });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "dry-run", sent: 0 });
      // The claim ran (I2); no mark call follows, so nothing is consumed (I1).
      expect(out.calls).toEqual([CLAIM_ARGS]);
      expect(out.fetches).toEqual([]);
      // The sender's own dry-run line comes first: it proves the real `sendEmailBatch` ran.
      expect(out.logs).toEqual([
        { event: "email", outcome: "dry-run", idempotencyKey: SENT_KEY, count: 2 },
        { event: "appointment-reminder", outcome: "dry-run", ...runFields(), due: 2, sent: 0 },
      ]);
    });

    it("sends one batch to the claimed users and marks their ids (I4, I13, I15)", async () => {
      const rig = arrange({ claim_due_appointment_reminders: claimReply, mark_appointment_reminders_sent: markReply });

      const out = await runJob(rig);

      expect(out).toEqual({
        result: { outcome: "sent", sent: 2 },
        logs: [{ event: "appointment-reminder", outcome: "sent", ...runFields(), due: 2, sent: 2 }],
        calls: [
          {
            kind: "rpc",
            name: "claim_due_appointment_reminders",
            args: { p_today: RUN_DAY, p_lead_days: 3, p_limit: 92 },
          },
          // The claim's ids flattened in claim order (5, 3, then 4), not sorted.
          { kind: "rpc", name: "mark_appointment_reminders_sent", args: { p_ids: [5, 3, 4] } },
        ],
        fetches: [
          {
            url: "https://api.resend.com/emails/batch",
            key: SENT_KEY,
            body: [
              {
                from: "Dbam <reminders@example.com>",
                to: ["ala@example.com"],
                subject: "Dbam: przypomnienie o wizycie",
                text: [
                  "Dzień dobry,",
                  "",
                  "Masz 2 zaplanowane wizyty w najbliższych dniach: 2 października 2026 i 3 października 2026.",
                  "",
                  "Szczegóły znajdziesz w swoim panelu Dbam: https://dbam.example/dashboard",
                  "",
                  "Nie chcesz dostawać przypomnień? Wyłącz je w swoim profilu: https://dbam.example/profile#reminders",
                  "",
                ].join("\n"),
              },
              {
                from: "Dbam <reminders@example.com>",
                to: ["bob@example.com"],
                subject: "Dbam: appointment reminder",
                text: [
                  "Hello,",
                  "",
                  "You have an appointment coming up: October 4, 2026.",
                  "",
                  "See the details in your Dbam dashboard: https://dbam.example/dashboard",
                  "",
                  "Don't want these reminders? Turn them off in your profile: https://dbam.example/profile#reminders",
                  "",
                ].join("\n"),
              },
            ],
          },
        ],
      });
      // Reminders go to the users, never to the heartbeat recipient (I4).
      expect(JSON.stringify(out.fetches)).not.toContain(HEARTBEAT_TO);
      expect(out.fetches[0]?.key).toMatch(new RegExp(`^${KEY_PREFIX}:[0-9a-f]{64}$`));
    });
  });

  describe("failures (I6, I7, I8)", () => {
    it("fails at the claim with a code-only error and no send", async () => {
      const rig = arrange({ claim_due_appointment_reminders: { error: LEAKY_RPC_ERROR } });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "claim", code: "23505" });
      expect(out.logs).toEqual([
        {
          event: "appointment-reminder",
          outcome: "failed",
          ...runFields(),
          error: "ReminderDatabaseError",
          step: "claim",
          code: "23505",
        },
      ]);
      expect((out.thrown as Error).message).not.toContain("@");
      expect(out.fetches).toEqual([]);
      expectNoLeak(out.logs);
    });

    it("fails on a Resend 500 with its status and error name, and marks nothing", async () => {
      const rig = arrange({ claim_due_appointment_reminders: claimReply }, 500);

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "EmailSendError", status: 500, resendError: "internal_server_error" });
      expect(out.logs).toEqual([
        {
          event: "appointment-reminder",
          outcome: "failed",
          ...runFields(),
          error: "EmailSendError",
          status: "500",
          resendError: "internal_server_error",
        },
      ]);
      expect(out.calls).toEqual([CLAIM_ARGS]);
      expect((out.thrown as Error).message).not.toContain("@");
      expectNoLeak(out.logs);
    });

    it("fails on a Resend 200 without ids as `missing_id`, and marks nothing", async () => {
      const rig = arrange({ claim_due_appointment_reminders: claimReply }, "missing-id");

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "EmailSendError", status: 200, resendError: "missing_id" });
      expect(out.calls).toEqual([CLAIM_ARGS]);
      expect(out.logs).toEqual([
        {
          event: "appointment-reminder",
          outcome: "failed",
          ...runFields(),
          error: "EmailSendError",
          status: "200",
          resendError: "missing_id",
        },
      ]);
    });

    it("fails at the mark after the send, with a code-only error", async () => {
      const rig = arrange({
        claim_due_appointment_reminders: claimReply,
        mark_appointment_reminders_sent: { error: LEAKY_RPC_ERROR },
      });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "mark", code: "23505" });
      expect(out.fetches).toHaveLength(1);
      expect(out.logs).toEqual([
        {
          event: "appointment-reminder",
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
