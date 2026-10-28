# Follow-up: pin a west-of-UTC time zone for the unit run

- **Source**: impl-review F1 (`impl-review.md`), deferred by the orchestrator on 2026-10-28.
- **Gap**: Vitest runs in the host time zone, which is UTC in CI and Europe/Warsaw locally. The "no shift" date cases in `src/lib/screenings/format.test.ts` (`formatDay("2026-01-01")` and the other `formatDay`/`formatMonth` strings) go red only in a zone west of UTC. A regression that drops `timeZone: "UTC"` from `formatDay`/`formatMonth` in `src/lib/screenings/format.ts` would stay green in CI. It was shown red under `TZ=America/New_York` during implementation (Progress 2.4) and again in impl review.
- **Proposed change**: pin a west-of-UTC zone (e.g. `America/New_York`) for the unit run, via `process.env.TZ` in `vitest.config.ts` or `TZ=… vitest run` in the `test` script.
- **Check first**: that `src/lib/screenings/rules.test.ts` and the other Warsaw-based cases (`warsawToday`, `warsawMonth`, `partitionDashboard`, reminders) don't depend on the host zone. Run `TZ=America/New_York npm test` and `TZ=Pacific/Kiritimati npm test` before pinning.
- **Also**: update the header comment in `format.test.ts`, which says "Europe/Warsaw time zone", to name the zone the run actually pins.
