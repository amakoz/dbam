// Claude Code Stop hook for Dbam workers: blocks a `STATUS: done` turn while ESLint reports errors in the files
// changed against origin/main. Zero dependencies on purpose; wired in .claude/settings.json (see README "Agent Stop hook").
// Guards: runs only when DBAM_CHANGE is set (worker sessions) and not for DBAM_ROLE=review; lints only turns whose last
// `STATUS:` line is `done` (or missing); blocks at most MAX_BLOCKS times in a row per worktree, then lets the stop through;
// fails open (passes with a systemMessage) when git, origin/main, astro sync or ESLint itself is unavailable.
// Always exits 0 and prints at most one JSON object. State and log live in the per-worktree git dir.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_BLOCKS = 3;
const MAX_REASON_OUTPUT = 4000;
const LINTABLE = /\.(js|mjs|cjs|jsx|ts|tsx|mts|cts|astro)$/;

function emit(object) {
  console.log(JSON.stringify(object));
  process.exit(0);
}

function pass() {
  process.exit(0);
}

function failOpen(reason) {
  emit({ systemMessage: `stop-lint skipped: ${reason}` });
}

function readInput() {
  try {
    const parsed = JSON.parse(readFileSync(0, "utf8"));
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// The word after the last `STATUS:` line, lowercased; null when the message has no such line.
function finalStatus(message) {
  const lines = typeof message === "string" ? message.split("\n") : [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("STATUS:")) return /^STATUS:\s*([A-Za-z]+)/.exec(line)?.[1].toLowerCase() ?? "";
  }
  return null;
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    ...options,
  });
  return { ...result, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function firstLine(text) {
  return text.trim().split("\n")[0] || "no output";
}

if (!process.env.DBAM_CHANGE || process.env.DBAM_ROLE === "review") pass();

const input = readInput();
const status = finalStatus(input.last_assistant_message);

const startDir = process.env.CLAUDE_PROJECT_DIR || (typeof input.cwd === "string" && input.cwd) || process.cwd();
const top = run("git", ["rev-parse", "--show-toplevel"], startDir);
if (top.status !== 0) failOpen(`not a git repository (${firstLine(top.stderr || String(top.error))})`);
const root = top.stdout.trim();

function git(args) {
  return run("git", args, root);
}

function statePath(name) {
  const result = git(["rev-parse", "--git-path", name]);
  return result.status === 0 ? path.resolve(root, result.stdout.trim()) : null;
}

const stateFile = statePath("dbam-stop-lint.json");
const logFile = statePath("dbam-stop-lint.log");

function readBlocks() {
  try {
    const parsed = JSON.parse(readFileSync(stateFile, "utf8"));
    return typeof parsed.blocks === "number" && parsed.blocks > 0 ? parsed.blocks : 0;
  } catch {
    return 0;
  }
}

function writeBlocks(blocks) {
  if (!stateFile) return;
  try {
    writeFileSync(stateFile, JSON.stringify({ blocks }) + "\n");
  } catch {
    // A state file we cannot write only costs us the cap; the hook still lints.
  }
}

// A turn that is not a `done` report passes unlinted and ends the streak of consecutive blocks.
if (status !== null && status !== "done") {
  if (readBlocks() > 0) writeBlocks(0);
  pass();
}

const blocks = readBlocks();
if (blocks >= MAX_BLOCKS) {
  writeBlocks(0);
  emit({
    systemMessage: `stop-lint: released after ${MAX_BLOCKS} consecutive blocks; lint errors remain, see ${logFile}`,
  });
}

// Changed lintable files: committed, staged, unstaged and untracked, with deletions dropped (a missing path is fatal for ESLint).
const changed = git(["diff", "--name-only", "-z", "--diff-filter=d", "--merge-base", "origin/main"]);
if (changed.status !== 0) failOpen(`git diff against origin/main failed (${firstLine(changed.stderr)})`);
const untracked = git(["ls-files", "-z", "--others", "--exclude-standard"]);
if (untracked.status !== 0) failOpen(`git ls-files failed (${firstLine(untracked.stderr)})`);
const files = [
  ...new Set([...changed.stdout.split("\0"), ...untracked.stdout.split("\0")].filter((file) => LINTABLE.test(file))),
]
  .filter((file) => existsSync(path.join(root, file)))
  .sort();

if (files.length === 0) {
  writeBlocks(0);
  pass();
}

const eslintBin = path.join(root, "node_modules", ".bin", "eslint");
if (!existsSync(eslintBin)) failOpen("node_modules/.bin/eslint is missing (npm ci has not finished?)");

// Type-checked rules need .astro/types.d.ts, which fresh worktrees lack (CI runs `astro sync` before lint).
const astroTypes = path.join(root, ".astro", "types.d.ts");
const astroConfig = path.join(root, "astro.config.mjs");
const typesStale =
  !existsSync(astroTypes) || (existsSync(astroConfig) && statSync(astroTypes).mtimeMs < statSync(astroConfig).mtimeMs);
if (typesStale) {
  const astroBin = path.join(root, "node_modules", ".bin", "astro");
  if (!existsSync(astroBin)) failOpen("node_modules/.bin/astro is missing, so `astro sync` could not run");
  const sync = run(astroBin, ["sync"], root, { timeout: 90_000 });
  if (sync.status !== 0) failOpen(`astro sync failed (${firstLine(sync.stderr || sync.stdout)})`);
  // `astro sync` may leave an unchanged types file alone; touch it so the mtime check stops re-syncing.
  if (existsSync(astroTypes)) utimesSync(astroTypes, new Date(), new Date());
}

const lint = run(
  eslintBin,
  ["--quiet", "--no-warn-ignored", "--no-error-on-unmatched-pattern", "-f", "stylish", ...files],
  root,
  { timeout: 150_000 },
);
if (lint.status === 0) {
  writeBlocks(0);
  pass();
}
if (lint.status !== 1) failOpen(`ESLint did not run cleanly (${firstLine(lint.stderr || String(lint.error))})`);

const block = blocks + 1;
const output = lint.stdout.trim();
if (logFile) {
  try {
    writeFileSync(
      logFile,
      `stop-lint ${new Date().toISOString()} change=${process.env.DBAM_CHANGE} session=${String(input.session_id ?? "unknown")} block ${block}/${MAX_BLOCKS}\n${files.length} changed file(s) linted\n\n${output}\n`,
    );
  } catch {
    // The reason below still carries the errors.
  }
}
writeBlocks(block);

const shown =
  output.length > MAX_REASON_OUTPUT
    ? `${output.slice(0, MAX_REASON_OUTPUT)}\n… (truncated, full output in the log)`
    : output;
const reason = [
  `ESLint reports errors in the files you changed (${files.length} linted; block ${block}/${MAX_BLOCKS}). Full output: ${logFile}`,
  "",
  shown,
  "",
  "Fix these errors, rerun `npx eslint <files>`, then end with your STATUS line.",
  "If this is a review-only session, do not fix code: report these lint errors as a finding.",
  ...(block >= MAX_BLOCKS
    ? [
        "",
        `This is the last block (${MAX_BLOCKS}/${MAX_BLOCKS}). If you cannot fix them, end with \`STATUS: failed — lint — ${logFile}\`.`,
      ]
    : []),
].join("\n");
emit({ decision: "block", reason });
