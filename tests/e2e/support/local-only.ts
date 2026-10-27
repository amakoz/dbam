import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const LOCAL_HOSTS = ["localhost", "127.0.0.1"];

// The value of SUPABASE_URL from a dotenv-style file, from its last matching line (later lines override earlier
// ones); commented lines don't match. An unreadable file is skipped. Same reading as scripts/ui-shots.mjs.
function readEnvFile(file: string): string | undefined {
  let text: string;
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

function hostnameOf(value: string, source: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    throw new Error(`Refusing to run e2e: ${source} is not a URL.`);
  }
}

// Throws before any server starts or test runs: the suite signs up real users, so it only ever talks to a local app
// backed by a local Supabase. A parsed hostname is compared, never a string prefix (`http://127.0.0.1.evil.test`).
export function assertLocalOnly(baseURL: string, repoRoot: string): void {
  const baseHost = hostnameOf(baseURL, "BASE_URL");
  if (!LOCAL_HOSTS.includes(baseHost)) {
    throw new Error(
      `Refusing to run e2e against ${baseHost} (from BASE_URL): it signs up real users. Use a local app.`,
    );
  }
  if (process.env.DBAM_CHANGE && new URL(baseURL).port === "4321") {
    throw new Error(
      "Refusing port 4321 in a worker session: it is the human's dev server. Set E2E_PORT or DBAM_PORT, or BASE_URL.",
    );
  }

  // Every env file wrangler or Vite may load (`.env.local`, `.env.<mode>`, `.dev.vars.<env>`, …), without modelling
  // their precedence: one non-local value anywhere refuses.
  const envFiles = readdirSync(repoRoot)
    .filter((name) => /^\.(dev\.vars|env)($|\.)/.test(name) && name !== ".env.example")
    .sort();
  const supabaseUrls = [
    ["the environment", process.env.SUPABASE_URL],
    ...envFiles.map((name) => [name, readEnvFile(path.join(repoRoot, name))]),
  ].filter((entry): entry is [string, string] => entry[1] !== undefined);
  if (supabaseUrls.length === 0) {
    throw new Error(
      "Refusing to run e2e: no SUPABASE_URL found in the environment or the .dev.vars*/.env* files, so it can't be shown local.",
    );
  }
  for (const [source, value] of supabaseUrls) {
    const host = hostnameOf(value, `SUPABASE_URL in ${source}`);
    if (!LOCAL_HOSTS.includes(host)) {
      throw new Error(`Refusing to run e2e: SUPABASE_URL in ${source} points to ${host}, not local Supabase.`);
    }
  }
}
