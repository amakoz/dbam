// Smoke test: proves the built app, the Cloudflare adapter and the Supabase auth flow still work together.
// Zero dependencies on purpose. Run against a live server: BASE_URL=http://localhost:4321 node scripts/smoke.mjs
// SMOKE_READONLY=1 runs only GET checks that create no users and send no email; it is the only mode allowed
// against a non-local BASE_URL (production), because the full run signs up a real account.

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";
const READONLY = process.env.SMOKE_READONLY === "1";
const isLocal = ["localhost", "127.0.0.1"].includes(new URL(BASE_URL).hostname);
if (!isLocal && !READONLY) {
  console.error(
    `Refusing to run the full smoke test against ${BASE_URL}: it creates real users. Set SMOKE_READONLY=1.`,
  );
  process.exit(2);
}
const email = `smoke-${Date.now()}@example.com`;
const password = "Smoke-Test-Passw0rd!";
// A former smoker, so the conditional smoking fields are exercised too.
const profile = {
  mode: "onboarding",
  birth_year: "1970",
  sex: "female",
  smoking_status: "former",
  packs_per_day: "0,5",
  smoking_years: "20",
  years_since_quitting: "5",
};
// The edit turns them into a never-smoker, so saving also has to clear the smoking fields.
const profileEdit = { mode: "profile", birth_year: "1971", sex: "female", smoking_status: "never" };
const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(response) {
  for (const raw of response.headers.getSetCookie()) {
    const [pair, ...attrs] = raw.split(";");
    const [name, ...rest] = pair.split("=");
    const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
    if (expired) jar.delete(name.trim());
    else jar.set(name.trim(), rest.join("="));
  }
}

async function request(path, { method = "GET", form } = {}) {
  const response = await fetch(BASE_URL + path, {
    method,
    redirect: "manual",
    headers: {
      Cookie: cookieHeader(),
      Origin: BASE_URL,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  storeCookies(response);
  return { status: response.status, location: response.headers.get("location") ?? "", body: await response.text() };
}

// Plan and done dates relative to the run date, as Warsaw calendar values like the app uses (`YYYY-MM-DD`), so the
// steps never age and never flake around midnight.
function warsawToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}
function shiftDays(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}
const today = warsawToday();
// Last calendar month in Warsaw: always between January of the fixture's birth year (1970) and this month.
const [thisYear, thisMonth] = today.split("-").map(Number);
const lastMonth =
  thisMonth === 1
    ? { month: "12", year: String(thisYear - 1) }
    : { month: String(thisMonth - 1), year: String(thisYear) };
const mammography = "mammography-nfz-program";
const screening = (form) => request("/api/screenings", { method: "POST", form: { slug: mammography, ...form } });

// The consent form carries the version of the text it shows; read it from the page like a browser would submit it.
let consentVersion = "";
async function readConsentVersion() {
  const response = await request("/onboarding");
  consentVersion = /name="version" value="([^"]+)"/.exec(response.body)?.[1] ?? "";
  return response;
}

// Read-only steps run in both modes; the rest need a throwaway account and run only against local servers.
const readonlySteps = [
  ["health endpoint reports ok", () => request("/api/health"), { status: 200 }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
  ["onboarding redirects anonymous user", () => request("/onboarding"), { status: 302, location: "/auth/signin" }],
  ["profile redirects anonymous user", () => request("/profile"), { status: 302, location: "/auth/signin" }],
  ["signin page renders", () => request("/auth/signin"), { status: 200 }],
  ["signup page renders", () => request("/auth/signup"), { status: 200 }],
  ["unknown path returns 404", () => request("/does-not-exist"), { status: 404 }],
];

const accountSteps = [
  // Rejected by the endpoint before Supabase, so it creates no user: the same email can sign up in the next step.
  [
    "signup rejects a weak password",
    () => request("/api/auth/signup", { method: "POST", form: { email, password: "short" } }),
    { status: 302, location: "/auth/signup?error=weak_password" },
  ],
  [
    "signup creates account",
    () => request("/api/auth/signup", { method: "POST", form: { email, password } }),
    { status: 302, location: "/auth/confirm-email" },
  ],
  [
    "signin rejects wrong password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password: "wrong" } }),
    { status: 302, location: "/auth/signin?error=" },
  ],
  [
    "signin accepts correct password",
    () => request("/api/auth/signin", { method: "POST", form: { email, password } }),
    { status: 302, location: "/dashboard" },
  ],
  // Onboarding: consent first, then the profile, then the dashboard.
  ["dashboard sends new user to onboarding", () => request("/dashboard"), { status: 302, location: "/onboarding" }],
  ["onboarding renders consent step", readConsentVersion, { status: 200, bodyIncludes: 'name="version"' }],
  [
    "profile is refused without consent",
    () => request("/api/profile", { method: "POST", form: profile }),
    { status: 302, location: "/onboarding" },
  ],
  [
    "consent requires the checkbox",
    () => request("/api/consent/grant", { method: "POST", form: {} }),
    { status: 302, location: "/onboarding?error=" },
  ],
  [
    "consent rejects an outdated text version",
    () => request("/api/consent/grant", { method: "POST", form: { consent: "yes", version: "outdated" } }),
    { status: 302, location: "/onboarding?error=consent_outdated" },
  ],
  [
    "consent is recorded",
    () => request("/api/consent/grant", { method: "POST", form: { consent: "yes", version: consentVersion } }),
    { status: 302, location: "/onboarding" },
  ],
  [
    "profile rejects a minor",
    () => request("/api/profile", { method: "POST", form: { ...profile, birth_year: "2020" } }),
    { status: 302, location: "/onboarding?error=" },
  ],
  [
    "profile is saved",
    () => request("/api/profile", { method: "POST", form: profile }),
    { status: 302, location: "/dashboard" },
  ],
  // The fixture is 56 in 2026: mammography (women 45–74) stays in tier 1 until 2044, and PSA is for men only. The
  // stool blood test (50+) also needs the program questionnaire, which the profile doesn't collect: "may apply".
  [
    "dashboard renders for onboarded user",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: [
        'data-slug="mammography-nfz-program" data-tier="1"',
        'data-slug="fecal-occult-blood-test" data-maybe',
      ],
      bodyExcludes: 'data-slug="psa-shared-decision"',
    },
  ],
  // Plans and done records (S-03). Mammography is in tier 1 for the fixture, so it can be planned and marked done.
  [
    "plan with a date is saved",
    () => screening({ intent: "plan", appointment_date: shiftDays(today, 30) }),
    // The full location: the dashboard confirms the save on the exam's row (`slug`), where the browser scrolls.
    { status: 302, location: `/dashboard?saved=plan&slug=${mammography}#screening-${mammography}` },
  ],
  [
    "dashboard shows the plan instead of the tier item",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: `data-plan data-slug="${mammography}" data-appointment="${shiftDays(today, 30)}"`,
      bodyExcludes: `data-slug="${mammography}" data-tier`,
    },
  ],
  // Appointment reminders (S-04): off by default, so the dated plan above makes the dashboard suggest them.
  ["dashboard suggests reminders", () => request("/dashboard"), { status: 200, bodyIncludes: "data-reminders-hint" }],
  [
    "reminders are turned on",
    () => request("/api/reminders", { method: "POST", form: { enabled: "on" } }),
    { status: 302, location: "/profile?reminders=on" },
  ],
  ["profile shows reminders on", () => request("/profile"), { status: 200, bodyIncludes: 'data-reminders="on"' }],
  [
    "dashboard no longer suggests reminders",
    () => request("/dashboard"),
    { status: 200, bodyExcludes: "data-reminders-hint" },
  ],
  [
    "reminders are turned off",
    () => request("/api/reminders", { method: "POST", form: { enabled: "off" } }),
    { status: 302, location: "/profile?reminders=off" },
  ],
  [
    "reminders reject an invalid value",
    () => request("/api/reminders", { method: "POST", form: { enabled: "yes" } }),
    { status: 302, location: "/profile?error=" },
  ],
  [
    "dashboard confirms the save on the planned row",
    () => request(`/dashboard?saved=plan&slug=${mammography}`),
    {
      status: 200,
      bodyIncludes: `data-plan data-slug="${mammography}" data-appointment="${shiftDays(today, 30)}" data-saved="success"`,
    },
  ],
  [
    "plan rejects a past date",
    () => screening({ intent: "plan", appointment_date: shiftDays(today, -30) }),
    { status: 302, location: "/dashboard?error=invalid_appointment_date" },
  ],
  [
    "plan rejects an exam that is not recommended (draft entry)",
    () => request("/api/screenings", { method: "POST", form: { intent: "plan", slug: "lung-ldct-nfz-program" } }),
    { status: 302, location: "/dashboard?error=screening_not_available" },
  ],
  // Confirming a plan (S-05): only once its appointment day has come (Warsaw), and it records that exact day.
  [
    "confirm rejects a plan whose day has not come",
    () => screening({ intent: "confirm" }),
    { status: 302, location: "/dashboard?error=appointment_not_passed" },
  ],
  [
    "plan for today is saved",
    () => screening({ intent: "plan", appointment_date: today }),
    { status: 302, location: "/dashboard?saved=plan" },
  ],
  [
    "dashboard asks to confirm the plan for today",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: `data-plan data-slug="${mammography}" data-appointment="${today}" data-awaiting-confirmation`,
    },
  ],
  ["confirm is saved", () => screening({ intent: "confirm" }), { status: 302, location: "/dashboard?saved=confirm" }],
  [
    "dashboard shows the exam done on the confirmed day",
    () => request("/dashboard"),
    {
      status: 200,
      // Mammography is the only done exam, so the day belongs to its row.
      bodyIncludes: [`data-done data-slug="${mammography}"`, `data-last-done-on="${today}"`],
      bodyExcludes: [`data-slug="${mammography}" data-tier`, "data-plan"],
    },
  ],
  [
    "done last month is saved",
    () => screening({ intent: "done", done_month: lastMonth.month, done_year: lastMonth.year }),
    { status: 302, location: "/dashboard?saved=done" },
  ],
  // A month-only mark done clears the confirmed day; the empty value renders as a bare `data-last-done-on`.
  [
    "dashboard shows the exam as done, not planned",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: [`data-done data-slug="${mammography}"`, "data-last-done-on"],
      bodyExcludes: [`data-slug="${mammography}" data-tier`, "data-plan", 'data-last-done-on="'],
    },
  ],
  ["undone is saved", () => screening({ intent: "undone" }), { status: 302, location: "/dashboard?saved=undone" }],
  [
    "dashboard returns the exam to its tier",
    () => request("/dashboard"),
    { status: 200, bodyIncludes: `data-slug="${mammography}" data-tier="1"`, bodyExcludes: "data-done" },
  ],
  [
    "done in January 2020 is saved",
    () => screening({ intent: "done", done_month: "1", done_year: "2020" }),
    { status: 302, location: "/dashboard?saved=done" },
  ],
  [
    "dashboard shows the exam due again in its tier",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: `data-slug="${mammography}" data-tier="1" data-last-done="2020-01"`,
      bodyExcludes: "data-done",
    },
  ],
  [
    "plan without a date is saved",
    () => screening({ intent: "plan", appointment_date: "" }),
    { status: 302, location: "/dashboard?saved=plan" },
  ],
  // An empty attribute value renders as a bare attribute, so "no date" is `data-appointment` without `="…"`.
  [
    "dashboard shows the undated plan",
    () => request("/dashboard"),
    {
      status: 200,
      bodyIncludes: `data-plan data-slug="${mammography}" data-appointment`,
      bodyExcludes: ['data-appointment="', `data-slug="${mammography}" data-tier`],
    },
  ],
  [
    "onboarding sends onboarded user to dashboard",
    () => request("/onboarding"),
    { status: 302, location: "/dashboard" },
  ],
  // Profile editing and consent withdrawal, which deletes the health data.
  ["profile page renders", () => request("/profile"), { status: 200 }],
  [
    "profile edit is saved",
    () => request("/api/profile", { method: "POST", form: profileEdit }),
    { status: 302, location: "/profile?saved=1" },
  ],
  [
    "withdraw requires confirmation",
    () => request("/api/consent/withdraw", { method: "POST", form: {} }),
    { status: 302, location: "/profile?error=" },
  ],
  [
    "withdraw deletes health data",
    () => request("/api/consent/withdraw", { method: "POST", form: { confirm: "yes" } }),
    { status: 302, location: "/onboarding?withdrawn=1" },
  ],
  [
    "dashboard sends withdrawn user to onboarding",
    () => request("/dashboard"),
    { status: 302, location: "/onboarding" },
  ],
  // Withdrawal must also work after consenting but before a profile exists (GDPR Art. 7(3)).
  [
    "consent is recorded again",
    () => request("/api/consent/grant", { method: "POST", form: { consent: "yes", version: consentVersion } }),
    { status: 302, location: "/onboarding" },
  ],
  [
    "onboarding offers withdrawal before a profile exists",
    () => request("/onboarding"),
    { status: 200, bodyIncludes: 'action="/api/consent/withdraw"' },
  ],
  [
    "withdraw from onboarding requires confirmation",
    () => request("/api/consent/withdraw", { method: "POST", form: { from: "onboarding" } }),
    { status: 302, location: "/onboarding?error=withdraw_confirm_required" },
  ],
  [
    "withdraw from onboarding",
    () => request("/api/consent/withdraw", { method: "POST", form: { from: "onboarding", confirm: "yes" } }),
    { status: 302, location: "/onboarding?withdrawn=1" },
  ],
  // The first withdrawal deleted the plan and the done record left above: a fresh profile starts with none.
  [
    "consent is recorded after withdrawal",
    () => request("/api/consent/grant", { method: "POST", form: { consent: "yes", version: consentVersion } }),
    { status: 302, location: "/onboarding" },
  ],
  [
    "profile is saved again",
    () => request("/api/profile", { method: "POST", form: profile }),
    { status: 302, location: "/dashboard" },
  ],
  [
    "dashboard has no plans or done records after withdrawal",
    () => request("/dashboard"),
    { status: 200, bodyIncludes: `data-slug="${mammography}" data-tier="1"`, bodyExcludes: ["data-plan", "data-done"] },
  ],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

const steps = READONLY ? readonlySteps : [...readonlySteps, ...accountSteps];

// `bodyIncludes` (all must be present) and `bodyExcludes` (none may be present) take a string or an array.
const asList = (value) => (value === undefined ? [] : [value].flat());

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined ||
      // Same path exactly; the query string only needs the expected prefix (e.g. "?error=").
      (actual.location.split("?")[0] === expected.location.split("?")[0] &&
        actual.location.startsWith(expected.location))) &&
    asList(expected.bodyIncludes).every((text) => actual.body.includes(text)) &&
    asList(expected.bodyExcludes).every((text) => !actual.body.includes(text));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : `\nAll ${READONLY ? "read-only " : ""}smoke steps passed`);
process.exit(failed ? 1 : 0);
