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
