import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createReminderClient, ReminderConfigError } from "@/lib/reminders/admin-client";
import { runFollowUpNudges } from "@/lib/reminders/follow-up-nudge";
import {
  DAILY_RUN,
  emailEnv,
  expectNoLeak,
  fakeClient,
  HEARTBEAT_TO,
  LEAKY_RPC_ERROR,
  NUDGE_CLAIM,
  record,
  RUN_DAY,
  runFields,
  SITE,
  stubResend,
  type Call,
  type Reply,
} from "@/lib/reminders/transcript.test-helper";
import { isDailySendRun, PROVING_CRON } from "@/lib/schedule";

// Characterization test of the follow-up nudge job as it is today, written before the runner refactor (F-13 plan,
// phase 1). It runs `runFollowUpNudges` exactly as `worker.ts` does and pins the invariants I1–I15; the same file must
// stay green and unchanged through every later phase.

vi.mock("astro:env/server", async () => (await import("@/lib/reminders/transcript.test-helper")).astroEnvModule());
vi.mock("@/lib/reminders/admin-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reminders/admin-client")>()),
  createReminderClient: vi.fn(),
}));
vi.mock("@/lib/schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedule")>();
  return { ...actual, isDailySendRun: vi.fn(actual.isDailySendRun) };
});

const KEY_PREFIX = "dbam-follow-up-nudge";
// sha256("11,12,13"): the claim's ids sorted (I13).
const SENT_KEY = `${KEY_PREFIX}:ba85ab82a52c4e8e1d3195b9cd09d15e166d227e1ac3196b2c969e47b1a5991f`;
const SECOND_DAILY_RUN = { cron: DAILY_RUN.cron, scheduledTime: DAILY_RUN.scheduledTime + 3_600_000 };

const claimCall = (limit: number) => ({
  kind: "rpc",
  name: "claim_follow_up_nudges",
  args: { p_today: RUN_DAY, p_schedule_after: 14, p_confirm_after: 7, p_limit: limit },
});

const claimReply: Reply = { data: NUDGE_CLAIM };
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

const runJob = (rig: ReturnType<typeof arrange>, budget = 92, run = DAILY_RUN) =>
  record(() => runFollowUpNudges(run, { budget }), rig);

describe("runFollowUpNudges", () => {
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
          event: "follow-up-nudge",
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
      expect(out.logs).toEqual([{ event: "follow-up-nudge", outcome: "failed", ...runFields(), error: "Error" }]);
      expectNoLeak(out.logs, [HEARTBEAT_TO]);
    });

    it("skips with `no-budget` at budget 0, before any database call", async () => {
      const rig = arrange({});

      const out = await runJob(rig, 0);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(out.logs).toEqual([{ event: "follow-up-nudge", outcome: "skipped", ...runFields(), reason: "no-budget" }]);
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
        { event: "follow-up-nudge", outcome: "failed", ...runFields(), error: "ReminderConfigError" },
      ]);
    });
  });

  describe("outcomes", () => {
    it("claims at most the budget, capped at the Resend batch size (budget 250 claims 100)", async () => {
      const rig = arrange({ claim_follow_up_nudges: { data: [] } });

      await runJob(rig, 250);

      expect(rig.calls).toEqual([claimCall(100)]);
    });

    it("claims the budget when it is under the batch size (budget 7 claims 7)", async () => {
      const rig = arrange({ claim_follow_up_nudges: { data: [] } });

      await runJob(rig, 7);

      expect(rig.calls).toEqual([claimCall(7)]);
    });

    it("resolves `none` for an empty claim (I15)", async () => {
      const rig = arrange({ claim_follow_up_nudges: { data: [] } });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "none", sent: 0 });
      expect(out.logs).toEqual([{ event: "follow-up-nudge", outcome: "none", ...runFields(), due: 0, sent: 0 }]);
      expect(out.calls).toEqual([claimCall(92)]);
      expect(out.fetches).toEqual([]);
    });

    it("claims, sends nothing and marks nothing on a dry run (I1–I3, I15)", async () => {
      emailEnv.dryRun = true;
      const rig = arrange({ claim_follow_up_nudges: claimReply });

      const out = await runJob(rig);

      expect(out.result).toEqual({ outcome: "dry-run", sent: 0 });
      // The claim ran (I2); no mark call follows (I1).
      expect(out.calls).toEqual([claimCall(92)]);
      expect(out.fetches).toEqual([]);
      expect(out.logs).toEqual([
        { event: "email", outcome: "dry-run", idempotencyKey: SENT_KEY, count: 2 },
        { event: "follow-up-nudge", outcome: "dry-run", ...runFields(), due: 2, sent: 0 },
      ]);
    });

    it("sends one batch to the claimed users and marks their ids (I4, I9, I13, I15)", async () => {
      const rig = arrange({ claim_follow_up_nudges: claimReply, mark_follow_up_nudges_sent: markReply });

      const out = await runJob(rig);

      expect(out).toEqual({
        result: { outcome: "sent", sent: 2 },
        logs: [{ event: "follow-up-nudge", outcome: "sent", ...runFields(), due: 2, sent: 2 }],
        calls: [
          claimCall(92),
          // The claim's ids flattened in claim order (12, 11, then 13), not sorted.
          { kind: "rpc", name: "mark_follow_up_nudges_sent", args: { p_ids: [12, 11, 13] } },
        ],
        fetches: [
          {
            url: "https://api.resend.com/emails/batch",
            key: SENT_KEY,
            body: [
              {
                from: "Dbam <reminders@example.com>",
                to: ["ala@example.com"],
                subject: "Dbam: przypomnienie o planowanych badaniach",
                text: [
                  "Dzień dobry,",
                  "",
                  "Minęły terminy 2 wizyt. Potwierdź, czy się odbyły.",
                  "",
                  "Uzupełnij swoje plany w panelu Dbam: https://dbam.example/dashboard",
                  "",
                  "Nie chcesz dostawać takich wiadomości? Wyłącz je w swoim profilu: https://dbam.example/profile#reminders",
                  "",
                ].join("\n"),
              },
              {
                from: "Dbam <reminders@example.com>",
                to: ["bob@example.com"],
                subject: "Dbam: a follow-up on your planned exams",
                text: [
                  "Hello,",
                  "",
                  "1 appointment date has passed. Please confirm whether you went.",
                  "",
                  "3 planned exams still have no appointment date.",
                  "",
                  "Update your plans in your Dbam dashboard: https://dbam.example/dashboard",
                  "",
                  "Don't want these emails? Turn them off in your profile: https://dbam.example/profile#reminders",
                  "",
                ].join("\n"),
              },
            ],
          },
        ],
      });
      expect(JSON.stringify(out.fetches)).not.toContain(HEARTBEAT_TO);
      expect(out.fetches[0]?.key).toMatch(new RegExp(`^${KEY_PREFIX}:[0-9a-f]{64}$`));
    });
  });

  describe("failures (I6, I7, I8)", () => {
    it("fails at the claim with a code-only error and no send", async () => {
      const rig = arrange({ claim_follow_up_nudges: { error: LEAKY_RPC_ERROR } });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "claim", code: "23505" });
      expect(out.logs).toEqual([
        {
          event: "follow-up-nudge",
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
      const rig = arrange({ claim_follow_up_nudges: claimReply }, 500);

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "EmailSendError", status: 500, resendError: "internal_server_error" });
      expect(out.logs).toEqual([
        {
          event: "follow-up-nudge",
          outcome: "failed",
          ...runFields(),
          error: "EmailSendError",
          status: "500",
          resendError: "internal_server_error",
        },
      ]);
      expect(out.calls).toEqual([claimCall(92)]);
      expect((out.thrown as Error).message).not.toContain("@");
      expectNoLeak(out.logs);
    });

    it("fails on a Resend 200 without ids as `missing_id`, and marks nothing", async () => {
      const rig = arrange({ claim_follow_up_nudges: claimReply }, "missing-id");

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "EmailSendError", status: 200, resendError: "missing_id" });
      expect(out.calls).toEqual([claimCall(92)]);
      expect(out.logs).toEqual([
        {
          event: "follow-up-nudge",
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
        claim_follow_up_nudges: claimReply,
        mark_follow_up_nudges_sent: { error: LEAKY_RPC_ERROR },
      });

      const out = await runJob(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "mark", code: "23505" });
      expect(out.fetches).toHaveLength(1);
      expect(out.logs).toEqual([
        {
          event: "follow-up-nudge",
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
