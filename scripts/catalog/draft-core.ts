import type {
  BetaContentBlock,
  BetaMessage,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";

import type { FactorDefinition } from "@/lib/catalog/factors";
import { CatalogEntrySchema, type CatalogEntry } from "@/lib/catalog/schema";

import { formatIssuePath } from "./lib";

// Pure response handling for `draft.ts` (`npm run catalog:draft`): no I/O, no API calls, no process access, so unit
// tests can cover it later without refactoring. `draft.ts` does the reading, the API call and the writing.
//
// The model returns entries through the strict custom tool `submit_entries` rather than structured output
// (`output_config.format`), because structured output cannot be combined with the citations web search produces.
// Strict tool schemas accept only a subset of JSON Schema, so `buildSubmitToolInputSchema()` derives a
// strict-compatible copy of the published `catalog/entry.schema.json`: it drops the keywords strict mode does not
// support (`pattern`, `minimum`/`maximum`, `minLength`/`maxLength`, `minItems`, `$schema`, …) and forces
// `additionalProperties: false` on every object. The dropped rules are still enforced: `planWrites()` validates every
// submitted entry with `CatalogEntrySchema`, and the full published schema is also part of the prompt.

export const SUBMIT_TOOL_NAME = "submit_entries";

// ---------------------------------------------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

/** JSON Schema keywords a strict tool's `input_schema` may carry; everything else is dropped. */
const STRICT_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "anyOf",
  "allOf",
  "$ref",
  "$defs",
  "title",
  "description",
  "format",
]);

/** String formats strict mode supports; other formats are dropped. */
const STRICT_FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapValues(value: unknown, keyword: string): JsonSchema {
  if (!isPlainObject(value)) throw new Error(`strict tool schema: "${keyword}" must be an object`);
  return Object.fromEntries(Object.entries(value).map(([key, schema]) => [key, toStrictToolSchema(schema)]));
}

function mapArray(value: unknown, keyword: string): JsonSchema[] {
  if (!Array.isArray(value)) throw new Error(`strict tool schema: "${keyword}" must be an array`);
  return value.map((schema) => toStrictToolSchema(schema));
}

/**
 * A strict-mode-compatible copy of a JSON Schema: unsupported keywords removed, `additionalProperties: false` on
 * every object. Recursion follows `properties`, `items`, `anyOf`, `allOf` and `$defs`. Throws on anything that is not
 * a schema object, so a malformed published schema fails before any API call.
 */
export function toStrictToolSchema(schema: unknown): JsonSchema {
  if (!isPlainObject(schema)) throw new Error("strict tool schema: every schema node must be an object");
  const out: JsonSchema = {};
  for (const [keyword, value] of Object.entries(schema)) {
    if (!STRICT_KEYWORDS.has(keyword)) continue;
    switch (keyword) {
      case "properties":
      case "$defs":
        out[keyword] = mapValues(value, keyword);
        break;
      case "items":
        out[keyword] = toStrictToolSchema(value);
        break;
      case "anyOf":
      case "allOf":
        out[keyword] = mapArray(value, keyword);
        break;
      case "format":
        if (typeof value === "string" && STRICT_FORMATS.has(value)) out[keyword] = value;
        break;
      case "additionalProperties":
        // Forced to false below for objects; strict mode rejects any other value.
        break;
      default:
        out[keyword] = value;
    }
  }
  if (out.type === "object" || "properties" in out) out.additionalProperties = false;
  return out;
}

/** The `submit_entries` input schema: `{ entries: CatalogEntry[] }`, built from the published entry JSON Schema. */
export function buildSubmitToolInputSchema(entryJsonSchema: unknown): JsonSchema & { type: "object" } {
  return {
    type: "object",
    properties: {
      entries: {
        type: "array",
        description: "The drafted catalog entries. Empty when no entry could be sourced.",
        items: toStrictToolSchema(entryJsonSchema),
      },
    },
    required: ["entries"],
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------------------------------------------

const PLACEHOLDER = /\{\{([A-Z0-9_]+)\}\}/g;

/** Replaces every `{{NAME}}` in the template. Throws on a placeholder without a value or a value without a placeholder. */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  const used = new Set<string>();
  const rendered = template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) throw new Error(`prompt template: no value for {{${name}}}`);
    used.add(name);
    return value;
  });
  const unused = Object.keys(values).filter((name) => !used.has(name));
  if (unused.length > 0) throw new Error(`prompt template: no placeholder for ${unused.join(", ")}`);
  return rendered;
}

/** The factor vocabulary as a Markdown table: id, kind (with enum values), whether the profile collects it. */
export function renderFactorVocabulary(factors: Readonly<Record<string, FactorDefinition>>): string {
  const rows = Object.entries(factors).map(([id, factor]) => {
    const kind = factor.kind === "enum" ? `enum: ${factor.values.join(", ")}` : factor.kind;
    return `| \`${id}\` | ${kind} | ${factor.collected ? "yes" : "no"} | ${factor.description} |`;
  });
  return ["| Factor | Kind | Collected | Meaning |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

export interface ExistingEntry {
  slug: string;
  name_pl?: string;
  name_en?: string;
  status?: string;
}

/** One line per slug already taken, with its names when the file is valid. */
export function renderExistingEntries(entries: readonly ExistingEntry[]): string {
  if (entries.length === 0) return "(none yet)";
  return entries
    .map((entry) => {
      const names = [entry.name_pl, entry.name_en].filter((name) => name !== undefined).join(" / ");
      const details = [names, entry.status].filter((part) => part !== undefined && part !== "").join(", ");
      return details === "" ? `- \`${entry.slug}\`` : `- \`${entry.slug}\` (${details})`;
    })
    .join("\n");
}

export interface UserMessageInput {
  topic: string;
  maxEntries: number;
  /** The local date the run starts, YYYY-MM-DD. */
  today: string;
  /** Optional background document (e.g. the research report); never user or profile data. */
  source?: { label: string; text: string };
}

/** The user turn: the topic, the entry cap, today's date and the optional background document. */
export function buildUserMessage(input: UserMessageInput): string {
  const parts = [
    `Topic: ${input.topic}`,
    "",
    `Today's date is ${input.today}. Use it as \`accessed\` for every source you read in this run.`,
    `Submit at most ${input.maxEntries} ${input.maxEntries === 1 ? "entry" : "entries"}, by calling \`${SUBMIT_TOOL_NAME}\` once.`,
  ];
  if (input.source !== undefined) {
    parts.push(
      "",
      "Background research follows. Treat it as leads only: it may be outdated or wrong, so confirm every rule " +
        "against a current source you open yourself, and cite that source, not this document.",
      "",
      `<source_document path="${input.source.label}">`,
      input.source.text.trim(),
      "</source_document>",
    );
  }
  return parts.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------------------------------------------

type ResponseMessage = Pick<BetaMessage, "stop_reason" | "stop_details" | "content">;

export type SubmittedEntries =
  | { ok: true; entries: unknown[]; calls: number }
  | { ok: false; reason: "refusal"; category: string | null; explanation: string | null }
  | { ok: false; reason: "max_tokens" }
  | { ok: false; reason: "pause_turn" }
  | { ok: false; reason: "no_tool_call"; stopReason: string | null; text: string }
  | { ok: false; reason: "schema_errors"; problems: string[] };

const SubmitInputSchema = z.strictObject({ entries: z.array(z.unknown()) });

/** The content that follows the last server-side fallback boundary, i.e. what the model that answered produced. */
function servedContent(content: readonly BetaContentBlock[]): readonly BetaContentBlock[] {
  const boundary = content.findLastIndex((block) => block.type === "fallback");
  return boundary === -1 ? content : content.slice(boundary + 1);
}

/**
 * The raw entries the model submitted through `submit_entries`, or why there are none. Checks the stop reason first:
 * a refusal or `max_tokens` can cut a tool call off mid-input, so its input is never read. Entries are validated
 * one by one later, by `planWrites()`; this only checks the `{ entries: [...] }` wrapper.
 */
export function extractSubmittedEntries(message: ResponseMessage): SubmittedEntries {
  switch (message.stop_reason) {
    case "refusal":
      return {
        ok: false,
        reason: "refusal",
        category: message.stop_details?.category ?? null,
        explanation: message.stop_details?.explanation ?? null,
      };
    case "max_tokens":
      return { ok: false, reason: "max_tokens" };
    case "pause_turn":
      return { ok: false, reason: "pause_turn" };
    default:
      break;
  }

  const content = servedContent(message.content);
  const calls = content.filter(
    (block): block is BetaToolUseBlock => block.type === "tool_use" && block.name === SUBMIT_TOOL_NAME,
  );
  if (calls.length === 0) {
    const text = content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("\n")
      .trim();
    return { ok: false, reason: "no_tool_call", stopReason: message.stop_reason, text };
  }

  const entries: unknown[] = [];
  const problems: string[] = [];
  calls.forEach((call, i) => {
    const parsed = SubmitInputSchema.safeParse(call.input);
    if (parsed.success) entries.push(...parsed.data.entries);
    else {
      for (const issue of parsed.error.issues) {
        problems.push(`${SUBMIT_TOOL_NAME} call ${i + 1}: ${formatIssuePath(issue.path)}: ${issue.message}`);
      }
    }
  });
  if (problems.length > 0) return { ok: false, reason: "schema_errors", problems };
  return { ok: true, entries, calls: calls.length };
}

/** Lifecycle fields every drafted entry gets, whatever the model submitted: hidden, and not medically reviewed. */
export const DRAFT_FIELDS = { status: "draft", reviewed_by: null, last_reviewed: null, next_review_due: null } as const;

export interface InvalidEntry {
  /** Position in the submitted list, 0-based. */
  index: number;
  slug: string | null;
  /** `<field path>: <message>` lines. */
  problems: string[];
}

export interface WritePlan {
  /** Valid entries with a new slug, in submission order, with `DRAFT_FIELDS` applied. */
  write: CatalogEntry[];
  /** Valid entries whose slug already exists (a file or a shipped snapshot slug); never overwritten. */
  skipExisting: CatalogEntry[];
  /** Entries that fail `CatalogEntrySchema`, or repeat a slug submitted earlier in the same run. */
  invalid: InvalidEntry[];
}

function submittedSlug(raw: unknown): string | null {
  return isPlainObject(raw) && typeof raw.slug === "string" ? raw.slug : null;
}

/**
 * Sorts submitted entries into files to write, existing-slug skips and invalid entries. Every entry is forced to
 * `draft` with null review fields before validation, so a model-supplied `active` status never reaches a file.
 */
export function planWrites(entries: readonly unknown[], existingSlugs: Iterable<string>): WritePlan {
  const existing = new Set(existingSlugs);
  const planned = new Set<string>();
  const plan: WritePlan = { write: [], skipExisting: [], invalid: [] };

  entries.forEach((raw, index) => {
    const slug = submittedSlug(raw);
    const parsed = CatalogEntrySchema.safeParse(isPlainObject(raw) ? { ...raw, ...DRAFT_FIELDS } : raw);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((issue) => `${formatIssuePath(issue.path)}: ${issue.message}`);
      plan.invalid.push({ index, slug, problems });
      return;
    }
    const entry = parsed.data;
    if (existing.has(entry.slug)) {
      plan.skipExisting.push(entry);
    } else if (planned.has(entry.slug)) {
      plan.invalid.push({ index, slug, problems: [`slug: "${entry.slug}" was already submitted earlier in this run`] });
    } else {
      planned.add(entry.slug);
      plan.write.push(entry);
    }
  });
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------
// Continuations, fallbacks and usage
// ---------------------------------------------------------------------------------------------------------------

const DROPPED_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "tool_use"]);

/**
 * The assistant content to echo back when resuming a `pause_turn`. Normally the content as is. After a mid-output
 * server-side fallback, blocks before the last `fallback` boundary are echoed without thinking, `tool_use` and
 * unpaired `server_tool_use` blocks, which the fallback model cannot continue from.
 */
export function continuationContent(content: readonly BetaContentBlock[]): BetaContentBlock[] {
  const boundary = content.findLastIndex((block) => block.type === "fallback");
  if (boundary === -1) return [...content];
  const answered = new Set(
    content.flatMap((block) =>
      "tool_use_id" in block && typeof block.tool_use_id === "string" ? [block.tool_use_id] : [],
    ),
  );
  const before = content.slice(0, boundary).filter((block) => {
    if (DROPPED_BEFORE_FALLBACK.has(block.type)) return false;
    return block.type !== "server_tool_use" || answered.has(block.id);
  });
  return [...before, ...content.slice(boundary)];
}

export interface FallbackHop {
  from: string;
  to: string;
}

/** Every server-side fallback switch in a response: which model declined and which one continued. */
export function fallbackHops(message: Pick<BetaMessage, "content">): FallbackHop[] {
  return message.content.flatMap((block) =>
    block.type === "fallback" ? [{ from: block.from.model, to: block.to.model }] : [],
  );
}

export interface UsageTotals {
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  web_search_requests: number;
  web_fetch_requests: number;
}

/**
 * Token and server-tool totals across every response of a run (the first request plus `pause_turn` continuations).
 * Top-level `usage` only; after a server-side fallback the declined attempt is itemized in `usage.iterations`,
 * which the audit file keeps.
 */
export function sumUsage(messages: readonly Pick<BetaMessage, "usage">[]): UsageTotals {
  const totals: UsageTotals = {
    requests: messages.length,
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    web_search_requests: 0,
    web_fetch_requests: 0,
  };
  for (const { usage } of messages) {
    totals.input_tokens += usage.input_tokens;
    totals.output_tokens += usage.output_tokens;
    totals.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0;
    totals.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
    totals.web_search_requests += usage.server_tool_use?.web_search_requests ?? 0;
    totals.web_fetch_requests += usage.server_tool_use?.web_fetch_requests ?? 0;
  }
  return totals;
}
