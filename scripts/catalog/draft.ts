// `npm run catalog:draft -- --topic "<text>" [--source <path>] [--max <n>] [--max-searches <n>] [--dry-run]`:
// drafts new catalog entries with Claude Opus 5, live web search and web fetch. Owner-run only, never in CI or
// production. Writes only schema-valid entries with new slugs, always as `draft`, to catalog/entries/<slug>.json, and
// saves every raw response to catalog/.draft-runs/<timestamp>.json (gitignored).
//
// Credentials come from `new Anthropic()`: ANTHROPIC_API_KEY or an `ant auth login` profile. They are never read from
// .env or .dev.vars. The prompt (draft-prompt.md) carries the schema, the factor vocabulary and the existing slugs, and
// never any user or profile data. Response handling lives in draft-core.ts, free of I/O.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { FACTORS } from "@/lib/catalog/factors";

import {
  buildSubmitToolInputSchema,
  buildUserMessage,
  continuationContent,
  extractSubmittedEntries,
  fallbackHops,
  forbiddenSourceReason,
  planWrites,
  renderExistingEntries,
  renderFactorVocabulary,
  renderTemplate,
  SUBMIT_TOOL_NAME,
  sumUsage,
  terminalSafe,
  type SubmittedEntries,
  type UsageTotals,
  type WritePlan,
} from "./draft-core";
import {
  displayPath,
  entryFilePath,
  JSON_SCHEMA_PATH,
  listSnapshots,
  loadEntries,
  parseSnapshotSlugs,
  REPO_ROOT,
  renderEntryFile,
} from "./lib";

const MODEL = "claude-opus-5";
const MAX_TOKENS = 64000;
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** `pause_turn` continuations after the first request before the run is given up. */
const MAX_CONTINUATIONS = 5;
const DEFAULT_MAX_ENTRIES = 5;
const MAX_ENTRIES_LIMIT = 30;
const DEFAULT_MAX_SEARCHES = 20;
const MAX_SEARCHES_LIMIT = 50;
/** Per fetched page: Dziennik Ustaw PDFs can be very long, and every fetched token is billed as input. */
const FETCH_MAX_CONTENT_TOKENS = 50000;

const PROMPT_PATH = path.join(import.meta.dirname, "draft-prompt.md");
const RUNS_DIR = path.join(REPO_ROOT, "catalog", ".draft-runs");

const USAGE = `Usage: npm run catalog:draft -- --topic "<text>" [options]

Drafts new screening catalog entries with Claude Opus 5 and live web sources. Valid entries with new slugs are
written to catalog/entries/<slug>.json as "draft"; review them per catalog/README.md before activating any.

Options:
  --topic <text>        What to draft, e.g. "mammografia NFZ" (required)
  --source <path>       Background document included in the prompt, e.g.
                        context/foundation/screening-catalog-research.md (default: none)
  --max <n>             Most entries to submit, 1-${MAX_ENTRIES_LIMIT} (default: ${DEFAULT_MAX_ENTRIES})
  --max-searches <n>    Cap on web searches, and separately on web fetches, for the whole run,
                        1-${MAX_SEARCHES_LIMIT} (default: ${DEFAULT_MAX_SEARCHES})
  --dry-run             Validate and report, but write no entry files (the audit file is still saved)
  -h, --help            Show this help

Credentials: ANTHROPIC_API_KEY or an \`ant auth login\` profile (never .env, .dev.vars or a CI/Cloudflare secret).
Every run costs money: Opus 5 tokens plus per-search fees. Start with --max 5.
`;

/** stdout/stderr writes: model and web-derived text is stripped of terminal control characters first. */
function writeOut(text: string): void {
  process.stdout.write(terminalSafe(text));
}
function writeErr(text: string): void {
  process.stderr.write(terminalSafe(text));
}

function fail(message: string): never {
  writeErr(`${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------------------------

interface Options {
  topic: string;
  sourcePath: string | null;
  maxEntries: number;
  maxSearches: number;
  dryRun: boolean;
}

function parseCount(flag: string, raw: string | undefined, fallback: number, limit: number): number {
  if (raw === undefined) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 1 || value > limit) {
    fail(`catalog:draft: ${flag} must be a whole number from 1 to ${limit} (got "${raw}")\n\n${USAGE}`);
  }
  return value;
}

function parseOptions(argv: string[]): Options {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        topic: { type: "string" },
        source: { type: "string" },
        max: { type: "string" },
        "max-searches": { type: "string" },
        "dry-run": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    fail(`catalog:draft: ${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
  }

  if (values.help) {
    writeOut(USAGE);
    process.exit(0);
  }

  const topic = values.topic?.trim() ?? "";
  if (topic === "") fail(`catalog:draft: --topic is required\n\n${USAGE}`);

  let sourcePath: string | null = null;
  if (values.source !== undefined) {
    sourcePath = path.resolve(values.source);
    const refused = forbiddenSourceReason(path.relative(REPO_ROOT, sourcePath));
    if (refused !== null) fail(`catalog:draft: --source ${values.source}: ${refused}`);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
      fail(`catalog:draft: --source ${values.source}: no such file`);
    }
  }

  return {
    topic,
    sourcePath,
    maxEntries: parseCount("--max", values.max, DEFAULT_MAX_ENTRIES, MAX_ENTRIES_LIMIT),
    maxSearches: parseCount("--max-searches", values["max-searches"], DEFAULT_MAX_SEARCHES, MAX_SEARCHES_LIMIT),
    dryRun: values["dry-run"],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------------------------------------------

/** The local calendar date, YYYY-MM-DD (the schema accepts any date up to "today" anywhere on Earth). */
function localToday(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Every slug in use: entry files (valid or not) and slugs any snapshot migration has shipped. */
function takenSlugs(): { slugs: Set<string>; listing: string; warnings: string[] } {
  const { entries, fileSlugs, problems } = loadEntries();
  const slugs = new Set(fileSlugs);
  for (const snapshot of listSnapshots()) for (const slug of parseSnapshotSlugs(snapshot.body) ?? []) slugs.add(slug);

  const bySlug = new Map(entries.map((entry) => [entry.slug, entry]));
  const listed = [...slugs].sort().map((slug) => {
    const entry = bySlug.get(slug);
    return entry === undefined
      ? { slug }
      : { slug, name_pl: entry.name_pl, name_en: entry.name_en, status: entry.status };
  });
  return { slugs, listing: renderExistingEntries(listed), warnings: problems };
}

function buildParams(options: Options, existingEntries: string, today: string): BetaMessageStreamParams {
  const entryJsonSchema = fs.readFileSync(JSON_SCHEMA_PATH, "utf8");
  const system = renderTemplate(fs.readFileSync(PROMPT_PATH, "utf8"), {
    FACTOR_VOCABULARY: renderFactorVocabulary(FACTORS),
    EXISTING_ENTRIES: existingEntries,
    ENTRY_JSON_SCHEMA: entryJsonSchema.trim(),
  });
  const source =
    options.sourcePath === null
      ? undefined
      : { label: displayPath(options.sourcePath), text: fs.readFileSync(options.sourcePath, "utf8") };

  return {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system,
    tools: [
      // max_uses applies per request; run() lowers both caps on each continuation by what was already spent.
      { type: "web_search_20260209", name: "web_search", max_uses: options.maxSearches },
      {
        type: "web_fetch_20260209",
        name: "web_fetch",
        max_uses: options.maxSearches,
        max_content_tokens: FETCH_MAX_CONTENT_TOKENS,
      },
      {
        name: SUBMIT_TOOL_NAME,
        description:
          "Submit the drafted screening catalog entries. Call it exactly once, at the end, with every entry " +
          "(or an empty list when nothing could be sourced). Each rule must be backed by a verbatim quote.",
        // Strict mode validates the input structure; planWrites() still validates every entry with Zod. No
        // eager_input_streaming: it would skip the API-side validation that strict mode provides.
        strict: true,
        input_schema: buildSubmitToolInputSchema(JSON.parse(entryJsonSchema)),
      },
    ],
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: buildUserMessage({ topic: options.topic, maxEntries: options.maxEntries, today, source }),
      },
    ],
  };
}

/** Progress on stderr: the model's text, and each web search, fetch and submission as it completes. */
function reportBlock(block: BetaContentBlock): void {
  const line = (text: string) => {
    writeErr(`\n  · ${text}\n`);
  };
  switch (block.type) {
    case "server_tool_use": {
      const input = block.input;
      if (block.name === "web_search") line(`web_search: ${String(input.query)}`);
      else if (block.name === "web_fetch") line(`web_fetch: ${String(input.url)}`);
      break;
    }
    case "web_search_tool_result":
      if (!Array.isArray(block.content)) line(`web_search failed: ${block.content.error_code}`);
      break;
    case "web_fetch_tool_result":
      if (block.content.type === "web_fetch_tool_result_error") line(`web_fetch failed: ${block.content.error_code}`);
      break;
    case "tool_use":
      if (block.name === SUBMIT_TOOL_NAME) line(`${SUBMIT_TOOL_NAME} called`);
      break;
    case "fallback":
      line(`${block.from.model} declined; ${block.to.model} continues`);
      break;
    default:
      break;
  }
}

interface RunResult {
  responses: BetaMessage[];
  error: { kind: "api"; status: number | undefined; message: string } | { kind: "other"; message: string } | null;
}

/** The request's tools with the web search and fetch caps lowered to what is left of the run's budget. */
function withWebBudget(
  tools: BetaMessageStreamParams["tools"],
  searchesLeft: number,
  fetchesLeft: number,
): BetaMessageStreamParams["tools"] {
  return tools?.map((tool) => {
    if (tool.type === "web_search_20260209") return { ...tool, max_uses: searchesLeft };
    if (tool.type === "web_fetch_20260209") return { ...tool, max_uses: fetchesLeft };
    return tool;
  });
}

/**
 * Streams the request, resuming `pause_turn` up to MAX_CONTINUATIONS times. The web search and fetch caps
 * (`maxWebUses` each) hold across continuations; a run that uses one up while still paused stops with an error.
 * Never throws: errors are returned.
 */
async function run(client: Anthropic, params: BetaMessageStreamParams, maxWebUses: number): Promise<RunResult> {
  const responses: BetaMessage[] = [];
  const messages: BetaMessageParam[] = [...params.messages];
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    let tools = params.tools;
    if (turn > 0) {
      const spent = sumUsage(responses);
      const searchesLeft = maxWebUses - spent.web_search_requests;
      const fetchesLeft = maxWebUses - spent.web_fetch_requests;
      if (searchesLeft < 1 || fetchesLeft < 1) {
        const message =
          `the web search/fetch budget (${maxWebUses} each) was used up while the model was still working; ` +
          "retry with a larger --max-searches or a narrower --topic";
        return { responses, error: { kind: "other", message } };
      }
      tools = withWebBudget(params.tools, searchesLeft, fetchesLeft);
      writeErr(`\n[pause_turn: continuing, ${turn}/${MAX_CONTINUATIONS}]\n`);
    }
    try {
      const stream = client.beta.messages.stream({ ...params, tools, messages });
      stream.on("text", (delta) => {
        writeErr(delta);
      });
      stream.on("contentBlock", reportBlock);
      const message = await stream.finalMessage();
      responses.push(message);
      if (message.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: continuationContent(message.content) });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        const status = typeof error.status === "number" ? error.status : undefined;
        return { responses, error: { kind: "api", status, message: error.message } };
      }
      return { responses, error: { kind: "other", message: error instanceof Error ? error.message : String(error) } };
    }
  }
  writeErr("\n");
  return { responses, error: null };
}

// ---------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------

function usageLines(usage: UsageTotals): string[] {
  return [
    `usage: ${usage.requests} request(s); input ${usage.input_tokens} tokens ` +
      `(+${usage.cache_creation_input_tokens} cache write, ${usage.cache_read_input_tokens} cache read), ` +
      `output ${usage.output_tokens} tokens`,
    `server tools: ${usage.web_search_requests} web search(es), ${usage.web_fetch_requests} web fetch(es)`,
  ];
}

function failureMessage(result: SubmittedEntries & { ok: false }): string {
  switch (result.reason) {
    case "refusal": {
      const details = [result.category, result.explanation].filter((part) => part !== null).join(": ");
      return `the model (and its fallbacks) refused${details === "" ? "" : ` (${details})`}`;
    }
    case "max_tokens":
      return `the response hit max_tokens (${MAX_TOKENS}) before submitting; retry with a smaller --max`;
    case "pause_turn":
      return `still paused after ${MAX_CONTINUATIONS} continuations; retry with a smaller --max or --max-searches`;
    case "no_tool_call":
      return (
        `the model ended (${result.stopReason ?? "no stop reason"}) without calling ${SUBMIT_TOOL_NAME}` +
        (result.text === "" ? "" : `; its last words:\n${result.text}`)
      );
    case "schema_errors":
      return `${SUBMIT_TOOL_NAME} input is malformed:\n${result.problems.map((p) => `  ${p}`).join("\n")}`;
  }
}

function planLines(plan: WritePlan, dryRun: boolean): string[] {
  const lines: string[] = [];
  const verb = dryRun ? "valid (dry run, not written)" : "valid, written as draft";
  lines.push(`${plan.write.length} ${verb}:`);
  for (const entry of plan.write) {
    lines.push(`  ${entry.slug}: ${entry.name_pl} / ${entry.name_en}`);
    for (const source of entry.sources) {
      lines.push(`    - ${source.url} (${source.publisher}, accessed ${source.accessed})`);
      lines.push(`      "${source.quote}"`);
    }
  }
  if (plan.skipExisting.length > 0) {
    lines.push(`${plan.skipExisting.length} skipped, slug already exists:`);
    for (const entry of plan.skipExisting) lines.push(`  ${entry.slug}`);
  }
  if (plan.invalid.length > 0) {
    lines.push(`${plan.invalid.length} invalid, not written:`);
    for (const entry of plan.invalid) {
      lines.push(`  entry ${entry.index + 1}${entry.slug === null ? "" : ` (${entry.slug})`}:`);
      for (const problem of entry.problems) lines.push(`    ${problem}`);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------------------

const options = parseOptions(process.argv.slice(2));
const startedAt = new Date();

const taken = takenSlugs();
for (const warning of taken.warnings) writeErr(`warning: ${warning}\n`);
const params = buildParams(options, taken.listing, localToday(startedAt));

let client: Anthropic;
try {
  client = new Anthropic();
} catch (error) {
  fail(
    `catalog:draft: no Claude API credentials (${error instanceof Error ? error.message : String(error)}).\n` +
      "Run `ant auth login`, or export ANTHROPIC_API_KEY in this shell. Never put the key in .env or .dev.vars.",
  );
}

writeErr(
  `catalog:draft: ${MODEL}, topic "${options.topic}", max ${options.maxEntries} entries, ` +
    `max ${options.maxSearches} searches${options.dryRun ? ", dry run" : ""}\n`,
);

const { responses, error } = await run(client, params, options.maxSearches);
const final = responses.at(-1);
const usage = sumUsage(responses);
const extracted: SubmittedEntries | null = final === undefined ? null : extractSubmittedEntries(final);

let plan: WritePlan | null = null;
let overMax = 0;
if (error === null && extracted?.ok === true) {
  overMax = Math.max(0, extracted.entries.length - options.maxEntries);
  plan = planWrites(extracted.entries.slice(0, options.maxEntries), taken.slugs);
}

// The audit file is written for every run that reached the API, before any entry file.
fs.mkdirSync(RUNS_DIR, { recursive: true });
const auditFile = path.join(RUNS_DIR, `${startedAt.toISOString().replace(/[:.]/g, "-")}.json`);
const audit = {
  started_at: startedAt.toISOString(),
  finished_at: new Date().toISOString(),
  options,
  request: params,
  responses,
  usage,
  error,
  outcome:
    extracted === null
      ? null
      : extracted.ok
        ? { ok: true, submitted: extracted.entries.length, over_max: overMax, plan }
        : extracted,
};
fs.writeFileSync(auditFile, `${JSON.stringify(audit, null, 2)}\n`);

const out: string[] = ["", ...usageLines(usage)];
const hops = responses.flatMap(fallbackHops);
for (const hop of hops) out.push(`fallback: ${hop.from} declined, ${hop.to} continued`);
out.push(`audit: ${displayPath(auditFile)}`);
writeOut(`${out.join("\n")}\n`);

if (error !== null) {
  const status = error.kind === "api" && error.status !== undefined ? ` ${error.status}` : "";
  fail(`catalog:draft failed: ${error.kind === "api" ? `API error${status}` : "error"}: ${error.message}`);
}
if (extracted === null) fail("catalog:draft failed: no response received");
if (!extracted.ok) fail(`catalog:draft failed: ${failureMessage(extracted)}`);
if (plan === null) fail("catalog:draft failed: nothing to plan");

const report = planLines(plan, options.dryRun);
if (overMax > 0)
  report.unshift(`${overMax} entr${overMax === 1 ? "y" : "ies"} beyond --max ${options.maxEntries} ignored`);

const writeErrors: string[] = [];
if (!options.dryRun) {
  for (const entry of plan.write) {
    const file = entryFilePath(entry.slug);
    try {
      // `wx`: never overwrite, even if a file with this slug appeared while the request ran.
      fs.writeFileSync(file, await renderEntryFile(entry), { flag: "wx" });
    } catch (writeError) {
      writeErrors.push(
        `${displayPath(file)}: not written: ${writeError instanceof Error ? writeError.message : String(writeError)}`,
      );
    }
  }
}
writeOut(`${report.join("\n")}\n`);
if (writeErrors.length > 0) fail(writeErrors.join("\n"));
if (!options.dryRun && plan.write.length > 0) {
  writeOut(
    '\nNext: review each new file against its sources (catalog/README.md, "Drafting with Claude"), ' +
      "then run `npm run catalog:check`.\n",
  );
}
