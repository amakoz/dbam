// AI review runner: the entry point of the advisory `AI review` workflow (.github/workflows/ai-review.yml).
// Zero dependencies on purpose. Run: node scripts/ai-review/run.mjs from a checkout of the PR merge commit (fetch-depth 2).
// Reads the PR event, diffs only the files core.mjs allows, asks a free OpenRouter model (or any OpenAI-compatible
// endpoint) for a scored review, then writes it to the job log and step summary and sets an ai-cr:* label. No PR
// comment on purpose: every new comment emails the PR's participants, labels do not. The rules live in the pure
// core.mjs; this file is the I/O. Provider trouble keeps the job green ("review unavailable", labels unchanged); a
// broken GitHub call (permissions, token) exits 1 so the wiring failure is visible. Never required: see the workflow
// header.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import {
  DIFF_BUDGET,
  LABELS,
  buildMessages,
  isBinaryPatch,
  parseNameStatus,
  parseReview,
  planFiles,
  redactSecrets,
  renderComment,
  renderUnavailable,
  sanitize,
  selectDiff,
  verdict,
} from "./core.mjs";

const env = process.env;
const repo = env.GITHUB_REPOSITORY ?? "";
const apiUrl = (env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/+$/, "");
const baseUrl = (env.AI_REVIEW_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const model = env.AI_REVIEW_MODEL || "poolside/laguna-s-2.1:free";
const fallbackModels = (env.AI_REVIEW_FALLBACK_MODELS ?? "openrouter/free")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const timeoutMs = Number(env.AI_REVIEW_TIMEOUT_MS) || 120_000;
const secrets = [env.AI_REVIEW_API_KEY, env.GITHUB_TOKEN];

// Model- and provider-derived text must never act as a workflow command (::error::, ::add-mask::, ...): it is only
// printed between ::stop-commands::<token> and ::<token>::, with a token no one can guess.
const stopToken = randomBytes(16).toString("hex");

function logUntrusted(text) {
  console.log(`::stop-commands::${stopToken}`);
  console.log(text);
  console.log(`::${stopToken}::`);
}

function summary(text) {
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

/** Provider-derived text: secrets out first, then the sanitiser. */
function clean(text, cap) {
  return sanitize(redactSecrets(text, secrets), cap);
}

/** git's stderr is captured, never inherited: on failure it is logged as untrusted text, then the error is rethrown. */
function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    if (typeof err?.stderr === "string" && err.stderr !== "") logUntrusted(clean(err.stderr, 2000));
    throw err;
  }
}

/** Names of the allowed files are diffed one by one, so excluded content is never read into this process. */
function collectDiff() {
  const plan = planFiles(parseNameStatus(git(["diff", "--name-status", "-z", "--find-renames", "HEAD^1", "HEAD"])));
  const excluded = [...plan.excluded];
  const files = [];
  const unread = [];
  let used = 0;
  for (const { paths, displayPath } of plan.allowed) {
    // Once the budget is spent selectDiff would omit the rest anyway: list it without diffing it.
    if (used >= DIFF_BUDGET) {
      unread.push(displayPath);
      continue;
    }
    const text = git([
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      "--find-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "HEAD^1",
      "HEAD",
      "--",
      ...paths.map((p) => `:(literal)${p}`),
    ]);
    if (isBinaryPatch(text)) {
      excluded.push({ path: displayPath, reason: "binary" });
    } else if (text !== "") {
      files.push({ path: displayPath, text });
      used += text.length;
    }
  }
  const selection = selectDiff(files);
  return { ...selection, omitted: [...selection.omitted, ...unread], excluded };
}

/**
 * @returns {Promise<{ ok: true, content: string, model: string } | { ok: false, reason: string }>}
 */
async function askProvider(messages) {
  if (!env.AI_REVIEW_API_KEY) return { ok: false, reason: "no API key" };
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.AI_REVIEW_API_KEY}`,
  };
  if (new URL(baseUrl).hostname === "openrouter.ai") {
    headers["HTTP-Referer"] = `https://github.com/${repo}`;
    headers["X-OpenRouter-Title"] = "Dbam AI review";
  }
  const body = {
    ...(fallbackModels.length > 0 ? { models: [model, ...fallbackModels] } : { model }),
    messages,
    max_tokens: 8192,
    temperature: 0.2,
  };

  let res;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network error" };
  }

  let data;
  try {
    const raw = await res.text();
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
    if (!res.ok) {
      const message = typeof data?.error?.message === "string" ? `: ${clean(data.error.message, 200)}` : "";
      return { ok: false, reason: `HTTP ${res.status}${message}` };
    }
  } catch (err) {
    return { ok: false, reason: err instanceof Error && err.name === "TimeoutError" ? "timeout" : "bad response" };
  }
  if (data === null || typeof data !== "object") return { ok: false, reason: "bad response" };
  const content = data.choices?.[0]?.message?.content;
  if (data.error || typeof content !== "string" || content.trim() === "") return { ok: false, reason: "no content" };
  return { ok: true, content, model: typeof data.model === "string" ? data.model : model };
}

/** One GitHub REST call; returns the status and parsed JSON (null when there is no JSON body). */
async function github(method, path, body) {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dbam-ai-review",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // no JSON body (e.g. 204)
  }
  return { status: res.status, json };
}

class GitHubError extends Error {
  constructor(method, path, status) {
    super(`GitHub API ${method} ${path} failed: ${status}`);
    this.name = "GitHubError";
  }
}

async function githubOk(method, path, body, okStatuses) {
  const { status, json } = await github(method, path, body);
  if (!okStatuses.includes(status)) throw new GitHubError(method, path, status);
  return json;
}

async function applyLabels(number, score) {
  for (const label of Object.values(LABELS)) {
    await githubOk("POST", `/repos/${repo}/labels`, label, [201, 422]);
  }
  const { add, remove } = verdict(score);
  await githubOk("POST", `/repos/${repo}/issues/${number}/labels`, { labels: [add] }, [200]);
  await githubOk(
    "DELETE",
    `/repos/${repo}/issues/${number}/labels/${encodeURIComponent(remove)}`,
    undefined,
    [200, 404],
  );
}

async function main() {
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH ?? "", "utf8"));
  const pr = event.pull_request;
  if (!pr.head.repo || pr.head.repo.full_name !== repo) {
    const note = "ai-review skipped: fork PR (no secrets)";
    console.log(note);
    summary(note);
    return;
  }

  const selection = collectDiff();
  const headSha = String(pr.head.sha ?? "");
  let result = null;
  let usedModel = model;
  let reason = "";
  if (selection.sent.length === 0) {
    reason = "no reviewable files in this diff";
  } else {
    const nonce = randomBytes(16).toString("hex");
    const messages = buildMessages({
      title: String(pr.title ?? ""),
      body: String(pr.body ?? ""),
      ...selection,
      nonce,
    });
    const answer = await askProvider(messages);
    if (!answer.ok) {
      reason = answer.reason;
    } else {
      const parsed = parseReview(redactSecrets(answer.content, secrets));
      if (parsed.ok) {
        result = parsed;
        usedModel = redactSecrets(answer.model, secrets);
      } else {
        reason = parsed.reason;
        logUntrusted(clean(answer.content));
      }
    }
  }

  const report = result
    ? renderComment({ result, model: usedModel, headSha, selection })
    : renderUnavailable({ reason, headSha, selection });
  logUntrusted(report);
  summary(report);

  if (result) await applyLabels(Number(pr.number), result.score);
}

try {
  await main();
} catch (err) {
  if (err instanceof GitHubError) {
    console.log(`::error::${err.message}`);
  } else {
    logUntrusted(clean(err instanceof Error ? err.message : "unknown error", 500));
    console.log("::error::ai-review runner error (details above)");
  }
  process.exitCode = 1;
}
