import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const RUNNER = fileURLToPath(new URL("./run.mjs", import.meta.url));
const MARKER = "<!-- ai-code-review -->";
const API_KEY = "sk-or-test-key-4567";
const GH_TOKEN = "ghs_testtoken1234";
const DEFAULT_MODEL = "poolside/laguna-s-2.1:free";

interface Recorded {
  method: string;
  url: string;
  body: string;
}
interface Reply {
  status: number;
  body?: unknown;
  contentType?: string;
  hang?: boolean;
}
type Handler = (req: Recorded) => Reply;

const SENTINELS = {
  app: "SENTINEL_APP_a1",
  space: "SENTINEL_SPACE_b2",
  env: "SENTINEL_ENV_c3",
  lock: "SENTINEL_LOCK_d4",
  types: "SENTINEL_TYPES_e5",
};
const DEFAULT_FILES: Record<string, string> = {
  "src/app.ts": `export const a = "${SENTINELS.app}";\n`,
  "src/my file.ts": `export const b = "${SENTINELS.space}";\n`,
  ".env": `KEY=${SENTINELS.env}\n`,
  "package-lock.json": `{"x":"${SENTINELS.lock}"}\n`,
  "src/lib/database.types.ts": `export type T = "${SENTINELS.types}";\n`,
};

let server: Server;
let origin: string;
let requests: Recorded[];
let providerHandler: Handler;
let githubHandler: Handler;
let tmpDirs: string[];

function defaultGithub(req: Recorded): Reply {
  if (req.method === "GET" && req.url.includes("/comments")) return { status: 200, body: [] };
  if (req.method === "POST" && req.url.endsWith("/comments")) return { status: 201, body: { id: 1 } };
  if (req.method === "PATCH") return { status: 200, body: { id: 1 } };
  if (req.method === "POST" && req.url.endsWith("/repos/o/r/labels")) return { status: 201, body: {} };
  if (req.method === "POST" && req.url.endsWith("/labels")) return { status: 200, body: [] };
  if (req.method === "DELETE") return { status: 404, body: { message: "Label does not exist" } };
  return { status: 500 };
}

const review =
  (content: string): Handler =>
  () => ({
    status: 200,
    body: { model: "vendor/served-model:free", choices: [{ message: { content } }] },
  });

beforeEach(async () => {
  requests = [];
  tmpDirs = [];
  providerHandler = review("SCORE: 8/10\n### Summary\nLooks fine.\n### Findings\nNone.");
  githubHandler = defaultGithub;
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const rec = { method: req.method ?? "", url: req.url ?? "", body: Buffer.concat(chunks).toString("utf8") };
      requests.push(rec);
      const reply = rec.url.startsWith("/chat/completions") ? providerHandler(rec) : githubHandler(rec);
      if (reply.hang) return;
      res.writeHead(reply.status, { "Content-Type": reply.contentType ?? "application/json" });
      res.end(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => {
  server.closeAllConnections();
  server.close();
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "ai-review-test-"));
  tmpDirs.push(dir);
  return dir;
}

function baseEnv(home: string): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: home,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
}

/** A temp git repo: one base commit, then a second commit adding `files`. */
function makeRepo(
  files: Record<string, string> = DEFAULT_FILES,
  commits = 2,
): { dir: string; env: Record<string, string> } {
  const dir = tmp();
  const env = baseEnv(dir);
  // The project augments NodeJS.ProcessEnv with required keys; a minimal test env deliberately lacks them.
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, env: env as NodeJS.ProcessEnv, stdio: "pipe" });
  git("init", "-q");
  writeFileSync(join(dir, "README.md"), "# base\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  if (commits === 1) return { dir, env };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git("add", "-A");
  git("commit", "-q", "-m", "change");
  return { dir, env };
}

function writeEvent(dir: string, headRepo: { full_name: string } | null = { full_name: "o/r" }): string {
  const file = join(dir, "event.json");
  const pull_request = {
    number: 7,
    title: "Add app",
    body: "Adds the app.",
    head: { sha: "0123456789abcdef0123", repo: headRepo },
  };
  writeFileSync(file, JSON.stringify({ pull_request }));
  return file;
}

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  summary: string;
}

async function run(
  opts: {
    env?: Record<string, string | undefined>;
    repo?: ReturnType<typeof makeRepo>;
    headRepo?: { full_name: string } | null;
  } = {},
): Promise<Run> {
  const repo = opts.repo ?? makeRepo();
  const summaryFile = join(repo.dir, "step-summary.md");
  const merged: Record<string, string | undefined> = {
    ...repo.env,
    GITHUB_EVENT_PATH: writeEvent(repo.dir, opts.headRepo === undefined ? { full_name: "o/r" } : opts.headRepo),
    GITHUB_REPOSITORY: "o/r",
    GITHUB_API_URL: origin,
    GITHUB_TOKEN: GH_TOKEN,
    GITHUB_STEP_SUMMARY: summaryFile,
    AI_REVIEW_API_KEY: API_KEY,
    AI_REVIEW_BASE_URL: origin,
    ...opts.env,
  };
  const env = Object.fromEntries(
    Object.entries(merged).filter((e): e is [string, string] => e[1] !== undefined),
  ) as NodeJS.ProcessEnv;
  const child = spawn(process.execPath, [RUNNER], { cwd: repo.dir, env });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
  child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
  const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
  let summary = "";
  try {
    summary = readFileSync(summaryFile, "utf8");
  } catch {
    // no summary written (e.g. a skipped run before any output)
  }
  return { code, stdout, stderr, summary };
}

const providerRequests = () => requests.filter((r) => r.url.startsWith("/chat/completions"));
const githubRequests = () => requests.filter((r) => !r.url.startsWith("/chat/completions"));
const commentPosts = () => requests.filter((r) => r.method === "POST" && r.url === "/repos/o/r/issues/7/comments");
const labelRequests = () => requests.filter((r) => r.url.includes("/labels"));

/** Lines printed outside every ::stop-commands:: block: the only lines the runner may use as workflow commands. */
function outsideBlocks(stdout: string): string[] {
  const out: string[] = [];
  let token: string | null = null;
  for (const line of stdout.split("\n")) {
    if (token === null) {
      if (line.startsWith("::stop-commands::")) token = line.slice("::stop-commands::".length);
      else out.push(line);
    } else if (line === `::${token}::`) {
      token = null;
    }
  }
  return out;
}

describe("runner", () => {
  it("reviews allowed files only, posts a marker comment and the passed label", async () => {
    const result = await run();
    expect(result.code).toBe(0);

    const [call] = providerRequests();
    const sent = JSON.parse(call.body) as { models?: string[]; model?: string; messages: unknown };
    const payload = JSON.stringify(sent.messages);
    expect(payload).toContain(SENTINELS.app);
    expect(payload).toContain(SENTINELS.space);
    for (const secret of [SENTINELS.env, SENTINELS.lock, SENTINELS.types]) expect(payload).not.toContain(secret);
    expect(sent.models).toEqual([DEFAULT_MODEL, "openrouter/free"]);

    const posts = commentPosts();
    expect(posts).toHaveLength(1);
    const comment = (JSON.parse(posts[0].body) as { body: string }).body;
    expect(comment.startsWith(MARKER)).toBe(true);
    expect(comment).toContain("8/10 · passed");
    expect(comment).toContain("vendor/served-model:free");
    expect(comment).toContain("0123456");
    expect(comment).toContain(".env");
    expect(comment).not.toContain(SENTINELS.env);

    const labelCreates = requests.filter((r) => r.method === "POST" && r.url === "/repos/o/r/labels");
    expect(labelCreates).toHaveLength(2);
    const add = requests.find((r) => r.method === "POST" && r.url === "/repos/o/r/issues/7/labels");
    expect(JSON.parse(add?.body ?? "{}")).toEqual({ labels: ["ai-cr:passed"] });
    expect(requests.some((r) => r.method === "DELETE" && r.url === "/repos/o/r/issues/7/labels/ai-cr%3Afailed")).toBe(
      true,
    );
    expect(result.stdout).toContain("8/10");
    expect(result.summary).toContain("8/10");
  });

  it("edits the existing bot comment and ignores a human comment with the marker", async () => {
    githubHandler = (req) => {
      if (req.method === "GET" && req.url.includes("/comments")) {
        return {
          status: 200,
          body: [
            { id: 5, user: { login: "someone" }, body: `${MARKER} human spoof` },
            { id: 9, user: { login: "github-actions[bot]" }, body: `${MARKER}\nold review` },
          ],
        };
      }
      return defaultGithub(req);
    };
    const result = await run();
    expect(result.code).toBe(0);
    expect(commentPosts()).toHaveLength(0);
    const patches = requests.filter((r) => r.method === "PATCH");
    expect(patches.map((p) => p.url)).toEqual(["/repos/o/r/issues/comments/9"]);
  });

  it("labels a low score as failed and removes the passed label", async () => {
    providerHandler = review("SCORE: 4/10\n### Summary\nBug.");
    const result = await run();
    expect(result.code).toBe(0);
    const add = requests.find((r) => r.method === "POST" && r.url === "/repos/o/r/issues/7/labels");
    expect(JSON.parse(add?.body ?? "{}")).toEqual({ labels: ["ai-cr:failed"] });
    expect(requests.some((r) => r.method === "DELETE" && r.url.endsWith("/ai-cr%3Apassed"))).toBe(true);
  });

  const unavailable: [string, Handler | null, Record<string, string | undefined>][] = [
    ["provider 429", () => ({ status: 429, body: { error: { message: "rate limited" } } }), {}],
    ["provider 503", () => ({ status: 503, body: "upstream down", contentType: "text/plain" }), {}],
    ["200 with an error object", () => ({ status: 200, body: { error: { message: "model failed", code: 502 } } }), {}],
    ["200 with empty content", review(""), {}],
    ["200 with a text/html body", () => ({ status: 200, body: "<html>oops</html>", contentType: "text/html" }), {}],
    ["provider that never answers", () => ({ status: 200, hang: true }), { AI_REVIEW_TIMEOUT_MS: "200" }],
    ["no API key", null, { AI_REVIEW_API_KEY: undefined }],
    ["an answer without a score", review("Looks good to me."), {}],
  ];

  it.each(unavailable)("stays green and leaves labels alone: %s", async (_name, handler, env) => {
    if (handler) providerHandler = handler;
    const result = await run({ env });
    expect(result.code).toBe(0);
    const posts = commentPosts();
    expect(posts).toHaveLength(1);
    expect((JSON.parse(posts[0].body) as { body: string }).body).toContain("review unavailable:");
    expect(labelRequests()).toHaveLength(0);
    if (!env.AI_REVIEW_API_KEY && "AI_REVIEW_API_KEY" in env) expect(providerRequests()).toHaveLength(0);
  });

  it("skips fork PRs and deleted forks without any request", async () => {
    for (const headRepo of [{ full_name: "fork/r" }, null]) {
      requests = [];
      const result = await run({ headRepo });
      expect(result.code).toBe(0);
      expect(requests).toHaveLength(0);
      expect(result.stdout).toContain("ai-review skipped: fork PR");
    }
  });

  it("does not call the provider when every changed file is excluded", async () => {
    const repo = makeRepo({ ".env": "A=1\n", "package-lock.json": "{}\n" });
    const result = await run({ repo });
    expect(result.code).toBe(0);
    expect(providerRequests()).toHaveLength(0);
    expect((JSON.parse(commentPosts()[0].body) as { body: string }).body).toContain("review unavailable:");
    expect(labelRequests()).toHaveLength(0);
  });

  it("exits 1 with an ::error:: line outside any stop-commands block when GitHub refuses the comment", async () => {
    githubHandler = (req) =>
      req.method === "POST" && req.url.endsWith("/comments")
        ? { status: 403, body: { message: "Resource not accessible by integration" } }
        : defaultGithub(req);
    const result = await run();
    expect(result.code).toBe(1);
    expect(
      outsideBlocks(result.stdout).some((l) => l.startsWith("::error::GitHub API POST") && l.endsWith("403")),
    ).toBe(true);
    expect(labelRequests()).toHaveLength(0);
  });

  it("sends `model` instead of `models` when the fallback list is empty", async () => {
    await run({ env: { AI_REVIEW_FALLBACK_MODELS: "", AI_REVIEW_MODEL: "gemini-2.5-flash" } });
    const sent = JSON.parse(providerRequests()[0].body) as { model?: string; models?: string[] };
    expect(sent.model).toBe("gemini-2.5-flash");
    expect(sent.models).toBeUndefined();
  });

  it("keeps model text from acting as workflow commands, with a fresh token per run", async () => {
    providerHandler = review("SCORE: 8/10\n::error::spoof\n::add-mask::x\n::stop-commands::evil\nbody");
    const tokens: string[] = [];
    for (let i = 0; i < 2; i++) {
      const result = await run();
      expect(result.code).toBe(0);
      const outside = outsideBlocks(result.stdout);
      expect(outside.some((l) => /^::(error::spoof|add-mask::|stop-commands::evil)/.test(l))).toBe(false);
      expect(result.stdout).toContain("::error::spoof");
      const opening = result.stdout.split("\n").find((l) => l.startsWith("::stop-commands::"));
      tokens.push(opening ?? "");
    }
    expect(tokens[0]).not.toBe("");
    expect(tokens[0]).not.toBe(tokens[1]);
  });

  it("never leaks the API key or the GitHub token", async () => {
    const leaks = (result: Run) => {
      const bodies = githubRequests().map((r) => r.body);
      for (const secret of [API_KEY, GH_TOKEN]) {
        expect(result.stdout).not.toContain(secret);
        expect(result.stderr).not.toContain(secret);
        expect(result.summary).not.toContain(secret);
        for (const body of bodies) expect(body).not.toContain(secret);
      }
    };

    providerHandler = () => ({ status: 401, body: { error: { message: `Invalid key ${API_KEY}` } } });
    const first = await run();
    expect(first.code).toBe(0);
    expect((JSON.parse(commentPosts()[0].body) as { body: string }).body).toContain("HTTP 401");
    leaks(first);

    requests = [];
    providerHandler = review(`SCORE: 8/10\n### Summary\nThe token is ${GH_TOKEN} and the key ${API_KEY}.`);
    const second = await run();
    expect(second.code).toBe(0);
    expect(githubRequests().length).toBeGreaterThan(0);
    leaks(second);

    requests = [];
    providerHandler = review(`Looks fine, key ${API_KEY}, token ${GH_TOKEN}`);
    const third = await run();
    expect(third.code).toBe(0);
    expect((JSON.parse(commentPosts()[0].body) as { body: string }).body).toContain("review unavailable:");
    expect(third.stdout).toContain("Looks fine");
    leaks(third);
  });

  it("keeps git's stderr out of the unwrapped log when git fails", async () => {
    const result = await run({ repo: makeRepo(DEFAULT_FILES, 1) });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout).toMatch(/fatal|unknown revision|ambiguous/i);
    expect(outsideBlocks(result.stdout).join("\n")).not.toMatch(/fatal|unknown revision|ambiguous/i);
    expect(outsideBlocks(result.stdout).some((l) => l.startsWith("::error::ai-review runner error"))).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it("does not diff files after the size budget is spent, and lists them as omitted", async () => {
    const dir = makeRepo({
      "src/a-big.ts": `// ${"x".repeat(65_000)}\n`,
      "src/b-late.ts": "export const late = 1;\n",
    });
    const trace = join(dir.dir, "git-trace.log");
    const result = await run({ repo: dir, env: { GIT_TRACE: trace } });
    expect(result.code).toBe(0);
    const log = readFileSync(trace, "utf8");
    expect(log).toContain("a-big.ts");
    expect(log).not.toContain("b-late.ts");
    const comment = (JSON.parse(commentPosts()[0].body) as { body: string }).body;
    expect(comment).toContain("Omitted files (1)");
    expect(comment).toContain("src/b-late.ts");
    expect(comment).toContain("1 truncated");
  });
});
