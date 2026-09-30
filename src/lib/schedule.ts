// Cron schedules shared by the Worker's scheduled jobs (`scheduled()` in src/worker.ts). Cron runs in UTC only, so the
// daily schedule fires at 08:00 and 09:00 UTC and jobs act only on the run that is 10:00 in Warsaw, which holds in both
// CEST and CET.

/** Proving schedule: every run is a send run for the heartbeat. */
export const PROVING_CRON = "*/30 * * * *";
/** Daily schedule: two UTC runs, one of which is 10:00 Europe/Warsaw. */
export const DAILY_CRON = "0 8,9 * * *";

const DAILY_SEND_HOUR = 10;

/** Whether this is the daily schedule's run at 10:00 Warsaw time (the other daily run skips). */
export function isDailySendRun(cron: string, scheduledTime: number): boolean {
  return cron === DAILY_CRON && warsawHour(scheduledTime) === DAILY_SEND_HOUR;
}

function warsawHour(time: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(time);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  // A NaN hour would silently skip every daily run; fail the run instead so it shows in Trigger Events.
  if (!Number.isFinite(hour)) {
    throw new Error("Could not read the Europe/Warsaw hour");
  }
  return hour;
}
