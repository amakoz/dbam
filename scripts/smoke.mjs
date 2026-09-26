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

// Read-only steps run in both modes; the rest need a throwaway account and run only against local servers.
const readonlySteps = [
  ["home renders without config banner", () => request("/"), { status: 200, bodyExcludes: "nie jest skonfigurowany" }],
  ["dashboard redirects anonymous user", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
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
    { status: 302, location: "/" },
  ],
  ["dashboard renders for signed-in user", () => request("/dashboard"), { status: 200 }],
  ["signout clears session", () => request("/api/auth/signout", { method: "POST" }), { status: 302, location: "/" }],
  ["dashboard redirects after signout", () => request("/dashboard"), { status: 302, location: "/auth/signin" }],
];

const steps = READONLY ? readonlySteps : [...readonlySteps, ...accountSteps];

let failed = 0;
for (const [name, run, expected] of steps) {
  const actual = await run();
  const ok =
    actual.status === expected.status &&
    (expected.location === undefined || actual.location.startsWith(expected.location)) &&
    (expected.bodyExcludes === undefined || !actual.body.includes(expected.bodyExcludes));
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  -> ${actual.status} ${actual.location}`);
  if (!ok) {
    failed++;
    console.log(`      expected ${expected.status} ${expected.location ?? ""}`);
  }
}

console.log(failed ? `\n${failed} step(s) failed` : `\nAll ${READONLY ? "read-only " : ""}smoke steps passed`);
process.exit(failed ? 1 : 0);
