import { afterEach, describe, expect, it, vi } from "vitest";

import { REMINDER_EMAIL_DAILY_BUDGET } from "@/lib/email-budget";
import { buildReminderFailureEmail, isRedacted, type ReminderJob } from "@/lib/observability";
import { runReminderChain, type ReminderChainDeps, type ReminderRun } from "@/lib/reminders/chain";

const RUN: ReminderRun = { cron: "0 8,9 * * *", scheduledTime: 1790841600000 };
const ADDRESS = "jan.kowalski@example.com";

afterEach(() => {
  vi.restoreAllMocks();
});

function leaky(): Error {
  return new Error(`duplicate key value for ${ADDRESS}`);
}

function setup(overrides: Partial<ReminderChainDeps> = {}) {
  const alerts: { job: ReminderJob; error: unknown }[] = [];
  const deps: ReminderChainDeps = {
    appointment: vi.fn().mockResolvedValue({ sent: 0 }),
    due: vi.fn().mockResolvedValue({ outcome: "none", sent: 0 }),
    nudge: vi.fn().mockResolvedValue({ outcome: "none", sent: 0 }),
    alert: vi.fn((_run: ReminderRun, job: ReminderJob, error: unknown) => {
      alerts.push({ job, error });
      return Promise.resolve();
    }),
    ...overrides,
  };
  return { deps, alerts };
}

describe("runReminderChain", () => {
  it("gives the due job the daily budget minus what the appointment job sent", async () => {
    const { deps, alerts } = setup({ appointment: vi.fn().mockResolvedValue({ sent: 40 }) });

    await runReminderChain(RUN, deps);

    expect(deps.due).toHaveBeenCalledTimes(1);
    expect(deps.due).toHaveBeenCalledWith(RUN, { budget: REMINDER_EMAIL_DAILY_BUDGET - 40 });
    expect(REMINDER_EMAIL_DAILY_BUDGET).toBe(92);
    expect(alerts).toEqual([]);
  });

  it("gives the due job the whole budget when the appointment job sent nothing", async () => {
    const { deps } = setup();
    await runReminderChain(RUN, deps);
    expect(deps.due).toHaveBeenCalledWith(RUN, { budget: 92 });
  });

  it("never gives a negative budget", async () => {
    const { deps } = setup({ appointment: vi.fn().mockResolvedValue({ sent: 200 }) });
    await runReminderChain(RUN, deps);
    expect(deps.due).toHaveBeenCalledWith(RUN, { budget: 0 });
  });

  it("runs the jobs in order, each after the previous one finishes", async () => {
    const order: string[] = [];
    const { deps } = setup({
      appointment: vi.fn(async () => {
        await Promise.resolve();
        order.push("appointment");
        return { sent: 1 };
      }),
      due: vi.fn(async () => {
        await Promise.resolve();
        order.push("due");
        return { sent: 1 };
      }),
      nudge: vi.fn(() => {
        order.push("nudge");
        return Promise.resolve({ sent: 1 });
      }),
    });
    await runReminderChain(RUN, deps);
    expect(order).toEqual(["appointment", "due", "nudge"]);
  });

  it("gives the nudge job what is left after the appointment and due jobs sent", async () => {
    const { deps, alerts } = setup({
      appointment: vi.fn().mockResolvedValue({ sent: 40 }),
      due: vi.fn().mockResolvedValue({ sent: 30 }),
    });

    await runReminderChain(RUN, deps);

    expect(deps.due).toHaveBeenCalledWith(RUN, { budget: 52 });
    expect(deps.nudge).toHaveBeenCalledWith(RUN, { budget: 22 });
    expect(alerts).toEqual([]);
  });

  it("never gives the nudge job a negative budget", async () => {
    const { deps } = setup({
      appointment: vi.fn().mockResolvedValue({ sent: 92 }),
      due: vi.fn().mockResolvedValue({ sent: 0 }),
    });
    await runReminderChain(RUN, deps);
    expect(deps.nudge).toHaveBeenCalledWith(RUN, { budget: 0 });
  });

  it("runs the due job with budget 0 and sends one alert when the appointment job rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = leaky();
    const { deps, alerts } = setup({ appointment: vi.fn().mockRejectedValue(error) });

    await expect(runReminderChain(RUN, deps)).rejects.toThrow();

    expect(deps.due).toHaveBeenCalledWith(RUN, { budget: 0 });
    expect(deps.nudge).toHaveBeenCalledWith(RUN, { budget: 0 });
    expect(alerts).toEqual([{ job: "appointment-reminder", error }]);
  });

  it("sends one alert when only the due job rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = leaky();
    const { deps, alerts } = setup({ due: vi.fn().mockRejectedValue(error) });

    await expect(runReminderChain(RUN, deps)).rejects.toThrow();

    expect(alerts).toEqual([{ job: "due-screening-reminder", error }]);
  });

  it("gives the nudge job budget 0 when the due job rejects, with one alert", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = leaky();
    const { deps, alerts } = setup({
      appointment: vi.fn().mockResolvedValue({ sent: 10 }),
      due: vi.fn().mockRejectedValue(error),
    });

    await expect(runReminderChain(RUN, deps)).rejects.toThrow();

    expect(deps.nudge).toHaveBeenCalledWith(RUN, { budget: 0 });
    expect(alerts).toEqual([{ job: "due-screening-reminder", error }]);
  });

  it("sends one alert naming the nudge job when only it rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = leaky();
    const { deps, alerts } = setup({ nudge: vi.fn().mockRejectedValue(error) });

    await expect(runReminderChain(RUN, deps)).rejects.toThrow();

    expect(alerts).toEqual([{ job: "follow-up-nudge", error }]);
  });

  it("sends three alerts with different idempotency keys when all jobs fail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps, alerts } = setup({
      appointment: vi.fn().mockRejectedValue(leaky()),
      due: vi.fn().mockRejectedValue(leaky()),
      nudge: vi.fn().mockRejectedValue(leaky()),
    });

    await expect(runReminderChain(RUN, deps)).rejects.toThrow();

    expect(alerts.map(({ job }) => job)).toEqual(["appointment-reminder", "due-screening-reminder", "follow-up-nudge"]);
    const keys = alerts.map(({ job, error }) => buildReminderFailureEmail({ job, error, ...RUN }).idempotencyKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("logs one cron error event per failed job, without the message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps } = setup({
      appointment: vi.fn().mockRejectedValue(leaky()),
      due: vi.fn().mockRejectedValue(leaky()),
      nudge: vi.fn().mockRejectedValue(leaky()),
    });

    await expect(runReminderChain(RUN, deps)).rejects.toThrow();

    const lines = spy.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, string>);
    expect(lines.map((line) => line.job)).toEqual([
      "appointment-reminder",
      "due-screening-reminder",
      "follow-up-nudge",
    ]);
    for (const line of lines) {
      expect(line).toMatchObject({ event: "error", source: "cron", cron: RUN.cron });
      expect(JSON.stringify(line)).not.toContain(ADDRESS);
    }
  });

  it("rethrows the first failure redacted, with no message text", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps } = setup({
      appointment: vi.fn().mockRejectedValue(leaky()),
      due: vi.fn().mockRejectedValue(new Error("second failure")),
    });

    const thrown: unknown = await runReminderChain(RUN, deps).catch((error: unknown) => error);

    expect(isRedacted(thrown)).toBe(true);
    const error = thrown as Error;
    expect(error.message).toBe("[redacted]");
    expect(error.stack).not.toContain(ADDRESS);
    expect(error.stack).not.toContain("duplicate key");
    expect(error.stack).not.toContain("second failure");
  });

  it("resolves when all jobs succeed", async () => {
    const { deps } = setup();
    await expect(runReminderChain(RUN, deps)).resolves.toBeUndefined();
  });
});
