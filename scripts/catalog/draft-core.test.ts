import type { BetaContentBlock, BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { FactorDefinition } from "@/lib/catalog/factors";
import { CatalogEntrySchema } from "@/lib/catalog/schema";

import {
  buildSubmitToolInputSchema,
  buildUserMessage,
  continuationContent,
  DRAFT_FIELDS,
  extractSubmittedEntries,
  fallbackHops,
  forbiddenSourceReason,
  planWrites,
  renderExistingEntries,
  renderFactorVocabulary,
  renderTemplate,
  sumUsage,
  terminalSafe,
  toStrictToolSchema,
} from "./draft-core";
import { loadEntries } from "./lib";

// API responses are plain objects cast to the SDK types: draft-core.ts imports the SDK for types only.

type Block = Record<string, unknown> & { type: string };
type Message = Parameters<typeof extractSubmittedEntries>[0];

const blocks = (content: Block[]) => content as unknown as BetaContentBlock[];

function message(stopReason: string, content: Block[], stopDetails: unknown = null): Message {
  return { stop_reason: stopReason, stop_details: stopDetails, content } as unknown as Message;
}

const submit = (input: unknown, id = "call"): Block => ({ type: "tool_use", id, name: "submit_entries", input });
const text = (value: string): Block => ({ type: "text", text: value });
const fallback = (from: string, to: string): Block => ({ type: "fallback", from: { model: from }, to: { model: to } });

const [BASE] = loadEntries().entries.filter((entry) => entry.status === "active");

describe("toStrictToolSchema", () => {
  it("drops unsupported keywords and closes every object", () => {
    expect(
      toStrictToolSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          day: { type: "string", pattern: "^\\d+$", minLength: 1, format: "date" },
          re: { type: "string", format: "regex" },
          list: {
            type: "array",
            minItems: 1,
            items: { type: "object", properties: { n: { type: "integer", minimum: 1 } }, additionalProperties: true },
          },
          either: { anyOf: [{ type: "string", maxLength: 3 }, { type: "null" }] },
        },
        required: ["day"],
        additionalProperties: true,
      }),
    ).toEqual({
      type: "object",
      properties: {
        day: { type: "string", format: "date" },
        re: { type: "string" },
        list: {
          type: "array",
          items: { type: "object", properties: { n: { type: "integer" } }, additionalProperties: false },
        },
        either: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["day"],
      additionalProperties: false,
    });
  });

  it("closes a node that has properties but no type", () => {
    expect(toStrictToolSchema({ properties: { x: { type: "string" } } })).toEqual({
      properties: { x: { type: "string" } },
      additionalProperties: false,
    });
  });

  it.each([
    { schema: "string", error: "every schema node must be an object" },
    { schema: { properties: [] }, error: '"properties" must be an object' },
    { schema: { anyOf: {} }, error: '"anyOf" must be an array' },
  ])("throws on a malformed node: $error", ({ schema, error }) => {
    expect(() => toStrictToolSchema(schema)).toThrow(error);
  });

  it("leaves no pattern and no open object in the real entry schema", () => {
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node !== "object" || node === null) return;
      const schema = node as Record<string, unknown>;
      expect(schema).not.toHaveProperty("pattern");
      if (schema.type === "object" || "properties" in schema) expect(schema.additionalProperties).toBe(false);
      for (const key of ["properties", "$defs"]) Object.values(schema[key] ?? {}).forEach(visit);
      for (const key of ["items", "anyOf", "allOf"]) visit(schema[key]);
    };
    visit(toStrictToolSchema(z.toJSONSchema(CatalogEntrySchema)));
  });
});

describe("buildSubmitToolInputSchema", () => {
  it("wraps the strict entry schema in a closed { entries: [...] } object", () => {
    const entrySchema = { type: "object", properties: { slug: { type: "string", pattern: "^[a-z]+$" } } };
    expect(buildSubmitToolInputSchema(entrySchema)).toEqual({
      type: "object",
      properties: {
        entries: { type: "array", description: expect.any(String) as string, items: toStrictToolSchema(entrySchema) },
      },
      required: ["entries"],
      additionalProperties: false,
    });
  });
});

describe("renderTemplate", () => {
  it("fills every occurrence of a placeholder", () => {
    expect(renderTemplate("a {{X_1}} b {{X_1}}", { X_1: "1" })).toBe("a 1 b 1");
  });

  it("leaves lower-case names alone: placeholders are upper case only", () => {
    expect(renderTemplate("{{lower}} {{toString}}", {})).toBe("{{lower}} {{toString}}");
  });

  it.each<{ template: string; values: Record<string, string>; error: string }>([
    { template: "{{X}} {{Y}}", values: { X: "1" }, error: "prompt template: no value for {{Y}}" },
    { template: "{{X}}", values: { X: "1", Z: "2" }, error: "prompt template: no placeholder for Z" },
    { template: "x", values: { toString: "y" }, error: "prompt template: no placeholder for toString" },
  ])("throws: $error", ({ template, values, error }) => {
    expect(() => renderTemplate(template, values)).toThrow(error);
  });
});

describe("renderFactorVocabulary", () => {
  it("renders one table row per factor", () => {
    const factors: Record<string, FactorDefinition> = {
      status: { kind: "enum", values: ["a", "b"], collected: true, column: "smoking_status", description: "S." },
      exposure: { kind: "boolean", collected: false, description: "E." },
    };
    expect(renderFactorVocabulary(factors).split("\n")).toEqual([
      "| Factor | Kind | Collected | Meaning |",
      "| --- | --- | --- | --- |",
      "| `status` | enum: a, b | yes | S. |",
      "| `exposure` | boolean | no | E. |",
    ]);
  });
});

describe("renderExistingEntries", () => {
  it("says so when no slug is taken", () => {
    expect(renderExistingEntries([])).toBe("(none yet)");
  });

  it("lists each slug with whatever names and status it has", () => {
    expect(
      renderExistingEntries([
        { slug: "a" },
        { slug: "b", name_pl: "PL", name_en: "EN", status: "draft" },
        { slug: "c", name_en: "EN" },
      ]).split("\n"),
    ).toEqual(["- `a`", "- `b` (PL / EN, draft)", "- `c` (EN)"]);
  });
});

describe("buildUserMessage", () => {
  const input = { topic: "Topic", today: "2026-10-28" };

  it.each([
    { maxEntries: 1, line: "Submit at most 1 entry, by calling `submit_entries` once." },
    { maxEntries: 2, line: "Submit at most 2 entries, by calling `submit_entries` once." },
  ])("caps the run at $maxEntries", ({ maxEntries, line }) => {
    const lines = buildUserMessage({ ...input, maxEntries }).split("\n");
    expect(lines).toContain(line);
    expect(lines.some((l) => l.startsWith("<source_document"))).toBe(false);
  });

  it("appends a trimmed source document under its label", () => {
    const lines = buildUserMessage({
      ...input,
      maxEntries: 1,
      source: { label: "docs/r.md", text: "  body \n" },
    }).split("\n");
    const start = lines.indexOf('<source_document path="docs/r.md">');
    expect(start).toBeGreaterThan(0);
    expect(lines.slice(start + 1)).toEqual(["body", "</source_document>"]);
  });
});

describe("extractSubmittedEntries", () => {
  it("reports a refusal without reading tool input", () => {
    expect(extractSubmittedEntries(message("refusal", [submit({ entries: [1] })]))).toEqual({
      ok: false,
      reason: "refusal",
      category: null,
      explanation: null,
    });
  });

  it.each(["max_tokens", "pause_turn"])("reports %s without reading tool input", (stopReason) => {
    expect(extractSubmittedEntries(message(stopReason, [submit({ entries: [1] })]))).toEqual({
      ok: false,
      reason: stopReason,
    });
  });

  it("reports a text-only answer as no tool call", () => {
    expect(extractSubmittedEntries(message("end_turn", [text(" a "), text("b ")]))).toEqual({
      ok: false,
      reason: "no_tool_call",
      stopReason: "end_turn",
      text: "a \nb",
    });
  });

  it("ignores a call to another tool", () => {
    const other: Block = { type: "tool_use", id: "x", name: "web_search", input: { entries: [1] } };
    expect(extractSubmittedEntries(message("end_turn", [other]))).toMatchObject({ ok: false, reason: "no_tool_call" });
  });

  it("concatenates the entries of every submit call", () => {
    expect(
      extractSubmittedEntries(message("tool_use", [submit({ entries: [1] }, "1"), submit({ entries: [2, 3] }, "2")])),
    ).toEqual({ ok: true, entries: [1, 2, 3], calls: 2 });
  });

  it("rejects a wrapper with an extra key", () => {
    const result = extractSubmittedEntries(message("tool_use", [submit({ entries: [], extra: 1 })]));
    expect(result).toMatchObject({ ok: false, reason: "schema_errors" });
    const problems = result.ok || result.reason !== "schema_errors" ? [] : result.problems;
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) expect(problem.startsWith("submit_entries call 1: ")).toBe(true);
  });

  it("reads only the content after the last fallback boundary", () => {
    expect(
      extractSubmittedEntries(
        message("tool_use", [submit({ entries: [1] }, "1"), fallback("a", "b"), submit({ entries: [2] }, "2")]),
      ),
    ).toEqual({ ok: true, entries: [2], calls: 1 });
  });
});

describe("planWrites", () => {
  const draft = (slug: string) => ({ ...structuredClone(BASE), slug });

  it("writes a new entry as a draft, whatever status it was submitted with", () => {
    const plan = planWrites([draft("new-entry")], []);
    expect(plan.skipExisting).toEqual([]);
    expect(plan.invalid).toEqual([]);
    expect(plan.write).toHaveLength(1);
    expect(plan.write[0]).toMatchObject({ slug: "new-entry", name_pl: BASE.name_pl, ...DRAFT_FIELDS });
  });

  it("skips an entry whose slug already exists", () => {
    expect(planWrites([draft("taken")], ["taken"])).toMatchObject({ write: [], skipExisting: [{ slug: "taken" }] });
  });

  it("rejects a slug submitted twice in one run", () => {
    const plan = planWrites([draft("twice"), draft("twice")], []);
    expect(plan.write).toHaveLength(1);
    expect(plan.invalid).toEqual([
      { index: 1, slug: "twice", problems: ['slug: "twice" was already submitted earlier in this run'] },
    ]);
  });

  it("keeps the index and slug of an invalid entry", () => {
    const plan = planWrites([draft("fine"), "not an object", { slug: "bad-one" }], []);
    expect(plan.invalid.map(({ index, slug }) => ({ index, slug }))).toEqual([
      { index: 1, slug: null },
      { index: 2, slug: "bad-one" },
    ]);
    for (const { problems } of plan.invalid) expect(problems.length).toBeGreaterThan(0);
  });
});

describe("continuationContent", () => {
  it("echoes the content as a copy when there is no fallback", () => {
    const content = blocks([text("a"), submit({ entries: [] })]);
    const result = continuationContent(content);
    expect(result).toEqual(content);
    expect(result).not.toBe(content);
  });

  it("drops what the fallback model cannot continue from, before the last boundary only", () => {
    const answered: Block = { type: "server_tool_use", id: "s1", name: "web_search", input: {} };
    const answer: Block = { type: "web_search_tool_result", tool_use_id: "s1", content: [] };
    const unanswered: Block = { type: "server_tool_use", id: "s2", name: "web_search", input: {} };
    const thinkingAfter: Block = { type: "thinking", thinking: "after", signature: "sig" };
    const content = blocks([
      { type: "thinking", thinking: "before", signature: "sig" },
      { type: "redacted_thinking", data: "x" },
      submit({ entries: [] }),
      answered,
      answer,
      unanswered,
      text("before"),
      fallback("a", "b"),
      thinkingAfter,
      text("after"),
    ]);
    expect(continuationContent(content)).toEqual(
      blocks([answered, answer, text("before"), fallback("a", "b"), thinkingAfter, text("after")]),
    );
  });
});

describe("fallbackHops", () => {
  it("lists every model switch in order", () => {
    const content = blocks([fallback("a", "b"), text("x"), fallback("b", "c")]);
    expect(fallbackHops({ content })).toEqual([
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ]);
  });
});

describe("sumUsage", () => {
  const usage = (value: Record<string, unknown>) => ({ usage: value }) as unknown as Pick<BetaMessage, "usage">;

  it("is all zeros for no responses", () => {
    expect(sumUsage([])).toEqual({
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      web_search_requests: 0,
      web_fetch_requests: 0,
    });
  });

  it("adds up every response, counting null fields as 0", () => {
    expect(
      sumUsage([
        usage({
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
        }),
        usage({
          input_tokens: 1,
          output_tokens: 2,
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 4,
          server_tool_use: { web_search_requests: 5, web_fetch_requests: 6 },
        }),
      ]),
    ).toEqual({
      requests: 2,
      input_tokens: 11,
      output_tokens: 7,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 4,
      web_search_requests: 5,
      web_fetch_requests: 6,
    });
  });
});

describe("terminalSafe", () => {
  it("removes C0 controls except tab and newline, DEL and C1 controls", () => {
    expect(terminalSafe("a\x1b[31mb\rc\x7fd\x9be\tf\ng")).toBe("a[31mbcde\tf\ng");
  });

  it("keeps Polish letters and emoji", () => {
    expect(terminalSafe("zażółć 😀")).toBe("zażółć 😀");
  });
});

describe("forbiddenSourceReason", () => {
  it.each(["", "../x", "/etc/x", "C:x", "\\x"])("%j is outside the repository", (repoRelativePath) => {
    expect(forbiddenSourceReason(repoRelativePath)).toBe("must be a file inside the repository");
  });

  it.each(["a/.env", "a/.env.local", "a\\.dev.vars", ".dev.vars"])("%j is an env file", (repoRelativePath) => {
    expect(forbiddenSourceReason(repoRelativePath)).toBe("env files hold secrets and are never sent to the API");
  });

  it("allows a document inside the repository", () => {
    expect(forbiddenSourceReason("docs/x.md")).toBeNull();
  });
});
