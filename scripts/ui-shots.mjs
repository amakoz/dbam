// UI shots: signs a fresh fixture user in against a local dev server and saves full-page screenshots of onboarding
// (consent and profile steps), the dashboard, the profile page and the kitchen sink, each in light and dark at 1440px
// and 390px, so agents can look at UI changes without a human at the screen (F-05).
// Unlike the other `scripts/*.mjs`, it has a dependency (`playwright`), because it drives a browser.
//
// Run (once per machine: `npx playwright install chromium --only-shell`), against `npm run dev` and local Supabase:
//   BASE_URL=http://127.0.0.1:<port> npm run ui:shots [-- --only <view>]... [-- --out <dir>]
// Views: onboarding, dashboard, profile, kitchen-sink. Files: <view>-<desktop|mobile>-<light|dark>.png in --out
// (default `ui-shots/`, gitignored); onboarding is shot twice, as onboarding-consent and onboarding-profile.
// It needs `astro dev`, not a production build: the kitchen sink is dev only and answers 404 there.
//
// Local only: it refuses (exit 2, before any request) a BASE_URL or SUPABASE_URL that is not localhost/127.0.0.1,
// and port 4321 in a worker session (DBAM_CHANGE set), which belongs to the human's dev server. SUPABASE_URL is read
// from this script's environment and from every `.dev.vars*` and `.env*` file at the repo root except `.env.example`
// (the last matching line in each, as dotenv's override does); any non-local value refuses. Limitation: that is not
// the environment the dev server was started with, so a server launched with a shell-exported production
// SUPABASE_URL is not detected.
// Exit codes: 0 done, 1 run failure (browser missing, unexpected status or redirect, failed step), 2 refusal or usage.
// Every full run signs up one throwaway `ui-shots-*@example.com` user in the local Supabase.

import { readdirSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const VIEWS = ["onboarding", "dashboard", "profile", "kitchen-sink"];
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const SCHEMES = ["light", "dark"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1"];
const USAGE = `Usage: BASE_URL=http://127.0.0.1:<port> npm run ui:shots [-- --only <view>]... [-- --out <dir>]
Views: ${VIEWS.join(", ")}`;

function refuse(message) {
  console.error(message);
  process.exit(2);
}

let args;
try {
  args = parseArgs({
    options: { only: { type: "string", multiple: true }, out: { type: "string" } },
    allowPositionals: false,
  }).values;
} catch (error) {
  refuse(`${error.message}\n${USAGE}`);
}
const unknownView = (args.only ?? []).find((view) => !VIEWS.includes(view));
if (unknownView !== undefined) refuse(`Unknown view "${unknownView}".\n${USAGE}`);
const selected = args.only?.length ? VIEWS.filter((view) => args.only.includes(view)) : VIEWS;
const outDir = path.resolve(args.out ?? "ui-shots");

// Guards: nothing below this block touches the network or launches a browser until they pass.
const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
let baseUrl;
try {
  baseUrl = new URL(BASE_URL);
} catch {
  refuse(`Refusing to run: BASE_URL is not a URL.\n${USAGE}`);
}
if (!LOCAL_HOSTS.includes(baseUrl.hostname)) {
  refuse(`Refusing to run against ${baseUrl.hostname}: it signs up a real user. Use a local dev server.`);
}
if (process.env.DBAM_CHANGE && baseUrl.port === "4321") {
  refuse("Refusing port 4321 in a worker session: it is the human's dev server. Set BASE_URL to your $DBAM_PORT.");
}
// Scheme, host and port only: a trailing slash or path in BASE_URL would build `//dashboard` and a bad Origin header.
const origin = baseUrl.origin;

// The value of SUPABASE_URL from a dotenv-style file, from its last matching line (later lines override earlier
// ones); commented lines don't match. An unreadable file is skipped.
function readEnvFile(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const line = text.split(/\r?\n/).findLast((l) => /^\s*(export\s+)?SUPABASE_URL\s*=/.test(l));
  if (line === undefined) return undefined;
  const value = line.slice(line.indexOf("=") + 1).trim();
  return /^(["']).*\1$/.test(value) ? value.slice(1, -1) : value;
}

// Every env file wrangler or Vite may load in dev (`.env.local`, `.env.<mode>`, `.dev.vars.<env>`, …), without
// modelling their precedence: one non-local value anywhere refuses.
const repoRoot = path.resolve(import.meta.dirname, "..");
const envFiles = readdirSync(repoRoot)
  .filter((name) => /^\.(dev\.vars|env)($|\.)/.test(name) && name !== ".env.example")
  .sort();
const supabaseUrls = [
  ["the environment", process.env.SUPABASE_URL],
  ...envFiles.map((name) => [name, readEnvFile(path.join(repoRoot, name))]),
].filter(([, value]) => value !== undefined);
if (supabaseUrls.length === 0) {
  refuse(
    "Refusing to run: no SUPABASE_URL found in the environment or the .dev.vars*/.env* files, so it can't be shown local.",
  );
}
for (const [source, value] of supabaseUrls) {
  let host;
  try {
    host = new URL(value).hostname;
  } catch {
    refuse(`Refusing to run: SUPABASE_URL in ${source} is not a URL.`);
  }
  if (!LOCAL_HOSTS.includes(host)) {
    refuse(`Refusing to run: SUPABASE_URL in ${source} points to ${host}, not local Supabase.`);
  }
}

// Warsaw calendar dates like the app uses (`YYYY-MM-DD`), copied from smoke.mjs so the fixture never ages.
function warsawToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}
function shiftDays(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

const email = `ui-shots-${Date.now()}@example.com`;
const password = "Ui-Shots-Passw0rd!";
// The smoke fixture: a 56-year-old former smoker, so mammography is in tier 1 and the smoking fields show.
const profile = {
  mode: "onboarding",
  birth_year: "1970",
  sex: "female",
  smoking_status: "former",
  packs_per_day: "0,5",
  smoking_years: "20",
  years_since_quitting: "5",
};
// Two different exams: a plan and a done record on the same exam replace each other.
const planned = "mammography-nfz-program";
const done = "cervical-screening-nfz-program";
const today = warsawToday();
const [thisYear, thisMonth] = today.split("-").map(Number);
const lastMonth =
  thisMonth === 1
    ? { month: "12", year: String(thisYear - 1) }
    : { month: String(thisMonth - 1), year: String(thisYear) };

let shots = 0;
// Relative to the current directory, or absolute for a folder outside it (a `../../..` path is hard to open).
function display(target) {
  const relative = path.relative(process.cwd(), target) || ".";
  return relative.startsWith("..") ? target : relative;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch (error) {
    if (/Executable doesn't exist/i.test(error.message)) {
      throw new Error("Chromium is not installed. Run: npx playwright install chromium --only-shell", { cause: error });
    }
    throw error;
  }
}

// Warm-up: a freshly started `astro dev` optimizes dependencies on the first requests, which can reload a page
// mid-capture. Results are ignored on purpose; the checked navigations come after.
async function warmUp(page, paths) {
  for (const route of [...paths, "/auth/signin"]) {
    try {
      await page.goto(origin + route);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    } catch {
      // Redirects, errors and timeouts are fine here.
    }
  }
}

// A navigation that must land on the requested path with a 200; anything else means the fixture state or the
// server is wrong.
async function open(page, route) {
  const response = await page.goto(origin + route);
  const status = response?.status();
  if (route === "/dev/kitchen-sink" && status === 404) {
    throw new Error("/dev/kitchen-sink answered 404: the server is a production build. Run against `npm run dev`.");
  }
  const landed = new URL(page.url()).pathname;
  if (status !== 200 || landed !== route) {
    throw new Error(`GET ${route} -> ${status}, landed on ${landed}; expected 200 on ${route}.`);
  }
  await page.waitForLoadState("load");
  // Fonts loaded and every island hydrated (Astro drops `ssr` from `astro-island` once it has).
  await page.waitForFunction("document.fonts.status === 'loaded' && !document.querySelector('astro-island[ssr]')");
}

async function shoot(page, name, route) {
  for (const [size, viewport] of Object.entries(VIEWPORTS)) {
    for (const colorScheme of SCHEMES) {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize(viewport);
      // Reload at the new width, so server-rendered content and layout settle there.
      await open(page, route);
      const file = path.join(outDir, `${name}-${size}-${colorScheme}.png`);
      await page.screenshot({
        path: file,
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        style: "astro-dev-toolbar { display: none !important; }",
      });
      shots++;
      console.log(display(file));
    }
  }
}

// A form POST that must answer 302 to `location` (the query string only needs the expected prefix).
async function step(context, label, route, form, location) {
  const response = await context.request.post(origin + route, {
    form,
    maxRedirects: 0,
    headers: { Origin: origin },
  });
  const actual = response.headers().location ?? "";
  const [actualPath] = actual.split("?");
  const [expectedPath] = location.split("?");
  if (response.status() !== 302 || actualPath !== expectedPath || !actual.startsWith(location)) {
    throw new Error(`${label}: POST ${route} -> ${response.status()} ${actual}; expected 302 ${location}.`);
  }
  console.log(`fixture: ${label}`);
}

async function run() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  try {
    const context = await browser.newContext({ deviceScaleFactor: 1, reducedMotion: "reduce" });
    await context.addCookies([{ name: "lang", value: "pl", url: origin }]);
    const page = await context.newPage();

    const pathOf = { onboarding: "/onboarding", dashboard: "/dashboard", profile: "/profile" };
    await warmUp(page, [...selected.map((view) => pathOf[view] ?? "/dev/kitchen-sink")]);

    if (selected.length > 1 || selected[0] !== "kitchen-sink") {
      await step(context, `signed up ${email}`, "/api/auth/signup", { email, password }, "/auth/confirm-email");
      await step(context, "signed in", "/api/auth/signin", { email, password }, "/dashboard");
      if (selected.includes("onboarding")) await shoot(page, "onboarding-consent", "/onboarding");

      const onboarding = await context.request.get(`${origin}/onboarding`, { maxRedirects: 0 });
      const version = /name="version" value="([^"]+)"/.exec(await onboarding.text())?.[1];
      if (version === undefined) throw new Error("The consent version is missing from /onboarding.");
      await step(context, "consent granted", "/api/consent/grant", { consent: "yes", version }, "/onboarding");
      if (selected.includes("onboarding")) await shoot(page, "onboarding-profile", "/onboarding");

      await step(context, "profile saved", "/api/profile", profile, "/dashboard");
      await step(
        context,
        "plan saved",
        "/api/screenings",
        { slug: planned, intent: "plan", appointment_date: shiftDays(today, 30) },
        "/dashboard?saved=plan",
      );
      await step(
        context,
        "done record saved",
        "/api/screenings",
        { slug: done, intent: "done", done_month: lastMonth.month, done_year: lastMonth.year },
        "/dashboard?saved=done",
      );
    }

    for (const view of selected.filter((v) => v !== "onboarding")) {
      await shoot(page, view, pathOf[view] ?? "/dev/kitchen-sink");
    }
    console.log(`${shots} screenshots in ${display(outDir)} from ${origin}`);
  } finally {
    await browser.close();
  }
}

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
