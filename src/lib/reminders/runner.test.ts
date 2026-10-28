import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReminderRun } from "@/lib/reminders/chain";
import { ReminderDatabaseError } from "@/lib/reminders/errors";
import {
  DAILY_RUN,
  expectNoLeak,
  fakeClient,
  LEAKED_ADDRESS,
  record,
  runFields,
  type Call,
  type Reply,
} from "@/lib/reminders/transcript.test-helper";
import { runClaimSendMark, type ClaimSendMarkJob, type ReminderDeps } from "@/lib/reminders/runner";
import { isDailySendRun, PROVING_CRON } from "@/lib/schedule";

// The runner against a fake spec and fake deps. No `astro:*` mock anywhere in this file: that is what proves the module
// is pure. The send gate is the real `isDailySendRun`, wrapped so one scenario can make it throw.

vi.mock("@/lib/schedule", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/schedule")>();
  return { ...actual, isDailySendRun: vi.fn(actual.isDailySendRun) };
});

interface Row {
  to: string;
  ids: number[];
}

const ROWS: Row[] = [
  { to: "ala@example.com", ids: [5, 3] },
  { to: "bob@example.com", ids: [4] },
];
// sha256("3,4,5"), the ids sorted (the same value the appointment job test pins).
const KEY = "test-prefix:a752d8ffaabe4c4d8a7a10cbdb2ee1525130a56a8290eef5d8a695434c49928f";
const SITE = "https://dbam.example";
const SECOND_DAILY_RUN: ReminderRun = { cron: DAILY_RUN.cron, scheduledTime: DAILY_RUN.scheduledTime + 3_600_000 };

type Order = string[];

/** A spec whose select, ids and message record themselves in `order`. */
function setup({
  rows = ROWS,
  fields,
  selectError,
  sendResult,
  markReply = { data: 3 },
}: {
  rows?: Row[];
  fields?: Record<string, number>;
  selectError?: Error;
  sendResult?: Awaited<ReturnType<ReminderDeps["send"]>>;
  markReply?: Reply;
} = {}) {
  const order: Order = [];
  const calls: Call[] = [];
  const client = fakeClient({ mark_appointment_reminders_sent: markReply }, calls);
  const selects: { now: Date; budget: number | undefined }[] = [];
  const sends: Parameters<ReminderDeps["send"]>[0][] = [];
  const job: ClaimSendMarkJob<Row> = {
    event: "appointment-reminder",
    keyPrefix: "test-prefix",
    select: (_client, ctx) => {
      order.push("select");
      selects.push(ctx);
      if (selectError !== undefined) throw selectError;
      return Promise.resolve({ rows, fields });
    },
    ids: (row) => row.ids,
    message: (row, site) => ({ to: row.to, subject: "subject", text: `${site}/dashboard` }),
    mark: "mark_appointment_reminders_sent",
  };
  const deps: ReminderDeps = {
    client: vi.fn<ReminderDeps["client"]>(() => {
      order.push("client");
      return client;
    }),
    send: vi.fn<ReminderDeps["send"]>((batch) => {
      order.push("send");
      sends.push(batch);
      return Promise.resolve(sendResult ?? { ids: batch.messages.map((_, index) => `resend-${index + 1}`) });
    }),
    site: SITE,
  };
  return { job, deps, order, calls, selects, sends };
}

type Rig = ReturnType<typeof setup>;

const run = (rig: Rig, budget?: number, at: ReminderRun = DAILY_RUN) =>
  record(() => runClaimSendMark(rig.job, at, budget, rig.deps), { calls: rig.calls, fetches: [] });

beforeEach(() => {
  vi.mocked(isDailySendRun).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runClaimSendMark", () => {
  describe("the gates", () => {
    it.each([
      ["the proving cron", { cron: PROVING_CRON, scheduledTime: DAILY_RUN.scheduledTime }],
      ["the 11:00 Warsaw daily run", SECOND_DAILY_RUN],
    ])("skips on %s: no client, no select, no send", async (_name, at) => {
      const rig = setup();

      const out = await run(rig, 92, at);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(out.logs).toEqual([
        {
          event: "appointment-reminder",
          outcome: "skipped",
          cron: at.cron,
          scheduledAt: new Date(at.scheduledTime).toISOString(),
        },
      ]);
      expect(rig.order).toEqual([]);
    });

    it("checks the send gate before the budget gate: a skipped run with budget 0 logs no reason", async () => {
      const rig = setup();

      const out = await run(rig, 0, SECOND_DAILY_RUN);

      expect(out.logs).toEqual([
        {
          event: "appointment-reminder",
          outcome: "skipped",
          cron: DAILY_RUN.cron,
          scheduledAt: new Date(SECOND_DAILY_RUN.scheduledTime).toISOString(),
        },
      ]);
    });

    it("never gates on a missing budget: an undefined budget runs and reaches select as undefined", async () => {
      const rig = setup();

      const out = await run(rig, undefined);

      expect(out.result).toEqual({ outcome: "sent", sent: 2 });
      expect(rig.selects).toEqual([{ now: new Date(DAILY_RUN.scheduledTime), budget: undefined }]);
    });

    it.each([0, -1])("skips with `no-budget` at budget %i: no client, no select, no send", async (budget) => {
      const rig = setup();

      const out = await run(rig, budget);

      expect(out.result).toEqual({ outcome: "skipped", sent: 0 });
      expect(out.logs).toEqual([
        { event: "appointment-reminder", outcome: "skipped", ...runFields(), reason: "no-budget" },
      ]);
      expect(rig.order).toEqual([]);
    });

    it("runs at budget 1 and hands the budget to select", async () => {
      const rig = setup();

      await run(rig, 1);

      expect(rig.selects[0]?.budget).toBe(1);
    });
  });

  describe("the client (I14)", () => {
    it("is created once, after both gates and before select", async () => {
      const rig = setup();

      await run(rig, 92);

      expect(rig.deps.client).toHaveBeenCalledTimes(1);
      expect(rig.order).toEqual(["client", "select", "send"]);
    });

    it("is not created on a skipped run or at budget 0", async () => {
      const rig = setup();

      await run(rig, 92, SECOND_DAILY_RUN);
      await run(rig, 0);

      expect(rig.deps.client).not.toHaveBeenCalled();
    });

    it("failing to create it logs `failed` and rethrows the factory's own error", async () => {
      const rig = setup();
      const missing = new Error("SUPABASE_SECRET_KEY is not set");
      vi.mocked(rig.deps.client).mockImplementation(() => {
        throw missing;
      });

      const out = await run(rig);

      expect(out.thrown).toBe(missing);
      expect(out.logs).toEqual([{ event: "appointment-reminder", outcome: "failed", ...runFields(), error: "Error" }]);
    });
  });

  describe("outcomes and the returned `sent` (I15)", () => {
    it("resolves `none` for no rows, and sends nothing", async () => {
      const rig = setup({ rows: [] });

      const out = await run(rig);

      expect(out.result).toEqual({ outcome: "none", sent: 0 });
      expect(out.logs).toEqual([{ event: "appointment-reminder", outcome: "none", ...runFields(), due: 0, sent: 0 }]);
      expect(rig.sends).toEqual([]);
      expect(out.calls).toEqual([]);
    });

    it("resolves `dry-run` with `sent: 0` and never marks", async () => {
      const rig = setup({ sendResult: { dryRun: true } });

      const out = await run(rig);

      expect(out.result).toEqual({ outcome: "dry-run", sent: 0 });
      expect(out.logs).toEqual([
        { event: "appointment-reminder", outcome: "dry-run", ...runFields(), due: 2, sent: 0 },
      ]);
      expect(out.calls).toEqual([]);
    });

    it("resolves `sent` with the number of ids Resend accepted, not the number of rows", async () => {
      const rig = setup({ sendResult: { ids: ["a", "b", "c"] } });

      const out = await run(rig);

      expect(out.result).toEqual({ outcome: "sent", sent: 3 });
      expect(out.logs).toEqual([{ event: "appointment-reminder", outcome: "sent", ...runFields(), due: 2, sent: 3 }]);
    });
  });

  describe("send and mark", () => {
    it("sends one message per row, built with the deps' site, under the batch key of the sorted ids", async () => {
      const rig = setup();

      await run(rig);

      expect(rig.sends).toEqual([
        {
          messages: [
            { to: "ala@example.com", subject: "subject", text: `${SITE}/dashboard` },
            { to: "bob@example.com", subject: "subject", text: `${SITE}/dashboard` },
          ],
          idempotencyKey: KEY,
        },
      ]);
    });

    it("marks the flattened ids in row order after the send, with the spec's RPC", async () => {
      const rig = setup();

      const out = await run(rig);

      expect(rig.order).toEqual(["client", "select", "send"]);
      // 5 and 3 (the first row), then 4: claim order, not sorted.
      expect(out.calls).toEqual([{ kind: "rpc", name: "mark_appointment_reminders_sent", args: { p_ids: [5, 3, 4] } }]);
    });
  });

  describe("`fields`", () => {
    it.each([
      ["none", { rows: [] as Row[] }, ["event", "outcome", "cron", "scheduledAt", "candidates", "due", "sent"]],
      [
        "dry-run",
        { sendResult: { dryRun: true } as const },
        ["event", "outcome", "cron", "scheduledAt", "candidates", "due", "sent"],
      ],
      ["sent", {}, ["event", "outcome", "cron", "scheduledAt", "candidates", "due", "sent"]],
    ])("are spread into the `%s` line between `scheduledAt` and `due`", async (outcome, options, keys) => {
      const rig = setup({ ...options, fields: { candidates: 7 } });

      const out = await run(rig);

      const line = out.logs[0] as Record<string, unknown>;
      expect(line.outcome).toBe(outcome);
      expect(line.candidates).toBe(7);
      expect(Object.keys(line)).toEqual(keys);
    });

    it("are left out of skipped and failed lines", async () => {
      const skipped = await run(setup({ fields: { candidates: 7 } }), 0);
      const failed = await run(setup({ fields: { candidates: 7 }, selectError: new Error("boom") }));

      expect(skipped.logs).toEqual([
        { event: "appointment-reminder", outcome: "skipped", ...runFields(), reason: "no-budget" },
      ]);
      expect(failed.logs).toEqual([
        { event: "appointment-reminder", outcome: "failed", ...runFields(), error: "Error" },
      ]);
    });
  });

  describe("failures (I6, I7, I8)", () => {
    it("logs `failed` and rethrows the same error when the send gate throws", async () => {
      const rig = setup();
      const boom = new Error(`no hour for ${LEAKED_ADDRESS}`);
      vi.mocked(isDailySendRun).mockImplementationOnce(() => {
        throw boom;
      });

      const out = await run(rig);

      expect(out.thrown).toBe(boom);
      expect(out.logs).toEqual([{ event: "appointment-reminder", outcome: "failed", ...runFields(), error: "Error" }]);
      expect(rig.order).toEqual([]);
    });

    it("rethrows the very error select threw, after exactly one `failed` line with its code and step", async () => {
      const claimFailed = new ReminderDatabaseError("claim", "23505");
      const rig = setup({ selectError: claimFailed });

      const out = await run(rig);

      expect(out.thrown).toBe(claimFailed);
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
      expect(rig.sends).toEqual([]);
    });

    it("rethrows the sender's error and marks nothing", async () => {
      const rig = setup();
      const refused = new Error("Resend said no");
      vi.mocked(rig.deps.send).mockRejectedValueOnce(refused);

      const out = await run(rig);

      expect(out.thrown).toBe(refused);
      expect(out.calls).toEqual([]);
      expect(out.logs).toHaveLength(1);
    });

    it("fails at the mark with a code-only ReminderDatabaseError after the send", async () => {
      const rig = setup({ markReply: { error: { code: "23505", message: `duplicate for ${LEAKED_ADDRESS}` } } });

      const out = await run(rig);

      expect(out.error).toMatchObject({ name: "ReminderDatabaseError", step: "mark", code: "23505" });
      expect(rig.sends).toHaveLength(1);
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
      expect((out.thrown as Error).message).not.toContain("@");
      expectNoLeak(out.logs);
    });

    it("never copies a leaky error's message into the log line", async () => {
      const leaky = new Error(`duplicate key value for ${LEAKED_ADDRESS}`);
      const rig = setup({ selectError: leaky });

      const out = await run(rig);

      expect(out.thrown).toBe(leaky);
      expect(JSON.stringify(out.logs)).not.toContain("duplicate");
      expectNoLeak(out.logs, [LEAKED_ADDRESS]);
    });
  });
});
