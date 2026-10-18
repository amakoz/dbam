import fs from "node:fs";

import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { afterEach, describe, expect, it, vi } from "vitest";

import { extractSubmittedEntries, planWrites } from "./draft-core";
import { runDraft, type RunOptions } from "./draft-run";
import { CATALOG_USER_AGENT, openParallelWeb, PARALLEL_MCP_URL, resolveSearchProvider } from "./draft-web";

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new Error("Fixture expected a JSON request body");
  return init.body;
}

const sourceUrl = "https://pacjent.gov.pl/program-profilaktyczny";
const evidence = JSON.stringify({ results: [{ url: sourceUrl, excerpts: ["Official screening source quote"] }] });
const tool = (name: string, input: Record<string, unknown>, id = name): BetaContentBlock => ({
  type: "tool_use",
  name,
  input,
  id,
});
const submit = () => tool("submit_entries", { entries: [] });
const params: BetaMessageStreamParams = {
  model: "claude-opus-5",
  max_tokens: 1000,
  messages: [{ role: "user", content: "Research official screening sources and submit drafts." }],
  tools: [
    { name: "submit_entries", input_schema: { type: "object" } },
    { name: "web_search", type: "web_search_20260209", max_uses: 2 },
    { name: "web_fetch", type: "web_fetch_20260209", max_uses: 2 },
  ],
};

/** Scripted model turns through the real Anthropic streaming parser, never a live-model test. */
function modelFixture(turns: { content: BetaContentBlock[]; reason?: string }[]) {
  const requests: BetaMessageStreamParams[] = [];
  const client = new Anthropic({
    apiKey: "fixture",
    maxRetries: 0,
    fetch: vi.fn((_url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      requests.push(JSON.parse(requestBody(init)) as BetaMessageStreamParams);
      const turn = turns.at(requests.length - 1);
      if (turn === undefined) throw new Error("Unexpected model turn");
      const events: Record<string, unknown>[] = [
        {
          type: "message_start",
          message: {
            id: `msg_${requests.length}`,
            type: "message",
            role: "assistant",
            model: params.model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          },
        },
      ];
      turn.content.forEach((block, index) => {
        events.push({
          type: "content_block_start",
          index,
          content_block: block.type === "tool_use" ? { ...block, input: {} } : block,
        });
        if (block.type === "tool_use")
          events.push({
            type: "content_block_delta",
            index,
            delta: { type: "input_json_delta", partial_json: JSON.stringify(block.input) },
          });
        events.push({ type: "content_block_stop", index });
      });
      events.push({
        type: "message_delta",
        delta: { stop_reason: turn.reason ?? "tool_use", stop_sequence: null },
        usage: { output_tokens: 10 },
      });
      events.push({ type: "message_stop" });
      return Promise.resolve(
        new Response(
          events.map((event) => `event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
          {
            headers: { "Content-Type": "text/event-stream" },
          },
        ),
      );
    }),
  });
  return { client, requests };
}

interface RpcRequest {
  id?: number;
  method: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
}

/** The real MCP transport talks to this HTTP fixture; every destination, header and JSON-RPC body is observed. */
function mcpFixture(options: { toolError?: boolean; status?: number; missingTool?: boolean; hang?: boolean } = {}) {
  const requests: { url: string; headers: Headers; rpc: RpcRequest }[] = [];
  const fetch: typeof globalThis.fetch = vi.fn(
    async (url: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
      if (init?.method === "GET") return new Response(null, { status: 405 });
      const rpc = JSON.parse(requestBody(init)) as RpcRequest;
      requests.push({
        url: typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
        headers: new Headers(init?.headers),
        rpc,
      });
      if (rpc.id === undefined) return new Response(null, { status: 202 });
      if (options.status !== undefined) return new Response("fixture failure", { status: options.status });
      let result: unknown;
      switch (rpc.method) {
        case "initialize":
          result = {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: { name: "fixture", version: "1" },
          };
          break;
        case "tools/list":
          result = {
            tools: (options.missingTool ? ["web_search"] : ["web_search", "web_fetch"]).map((name) => ({
              name,
              inputSchema: {
                type: "object",
                properties: { session_id: { type: "string" }, model_name: { type: "string" } },
              },
            })),
          };
          break;
        case "tools/call":
          if (options.hang) return await new Promise<Response>(() => undefined);
          result = { content: [{ type: "text", text: evidence }], isError: options.toolError ?? false };
          break;
        default:
          throw new Error(`Unexpected MCP method ${rpc.method}`);
      }
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    },
  );
  return { requests, fetch };
}

const runOptions = (openWeb?: RunOptions["openWeb"]): RunOptions => ({
  provider: resolveSearchProvider(undefined),
  signal: new AbortController().signal,
  text: () => undefined,
  block: () => undefined,
  ...(openWeb === undefined ? {} : { openWeb }),
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("catalog drafting provider and actual tool loop", () => {
  it("uses anonymous Parallel by default, consumes search/fetch sources, and validates hidden drafts", async () => {
    vi.stubEnv("PARALLEL_API_KEY", "ambient-must-not-be-used");
    const mcp = mcpFixture();
    const entry = JSON.parse(
      fs.readFileSync(new URL("../../catalog/entries/blood-pressure-measurement.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    entry.slug = "new-source-backed-draft";
    entry.sources = [
      {
        url: sourceUrl,
        title: "Fixture official source",
        publisher: "Fixture",
        quote: "Official screening source quote",
        accessed: new Date().toISOString().slice(0, 10),
      },
    ];
    const model = modelFixture([
      {
        content: [
          tool("web_search", {
            objective: "Find official NFZ sources",
            search_queries: ["NFZ screening Poland"],
            session_id: "untrusted",
            model_name: "untrusted",
          }),
        ],
      },
      { content: [tool("web_fetch", { urls: [sourceUrl] })] },
      { content: [tool("submit_entries", { entries: [entry] })] },
    ]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
    );
    expect(result.error).toBeNull();
    expect(result.webUsage).toEqual({ searches: 1, fetches: 1 });
    expect(model.requests).toHaveLength(3);
    expect(model.requests[1].tools?.some((tool) => "name" in tool && tool.name === "web_search")).toBe(false);
    expect(model.requests[2].tools?.map((tool) => ("name" in tool ? tool.name : tool.type))).toEqual([
      "submit_entries",
    ]);
    expect(result.request?.tools).toEqual(model.requests[0].tools);
    expect(JSON.stringify(model.requests[1].messages)).toContain(sourceUrl);
    expect(JSON.stringify(model.requests[2].messages)).toContain("Official screening source quote");
    expect(model.requests[0].tools?.every((tool) => tool.type !== "web_search_20260209")).toBe(true);
    const calls = mcp.requests.filter((request) => request.rpc.method === "tools/call");
    expect(calls[1].rpc.params?.arguments?.urls).toEqual([sourceUrl]);
    expect(calls[0].rpc.params?.arguments?.session_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(calls[1].rpc.params?.arguments?.session_id).toBe(calls[0].rpc.params?.arguments?.session_id);
    expect(calls[0].rpc.params?.arguments?.model_name).toBe(params.model);
    for (const request of mcp.requests) {
      expect(request.url).toBe(PARALLEL_MCP_URL);
      expect(request.headers.get("User-Agent")).toBe(CATALOG_USER_AGENT);
      expect(request.headers.has("Authorization")).toBe(false);
    }
    const extracted = extractSubmittedEntries(result.responses[result.responses.length - 1]);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) throw new Error("No draft submission");
    const plan = planWrites(extracted.entries, new Set());
    expect(plan.invalid).toEqual([]);
    expect(plan.write[0]).toMatchObject({ slug: entry.slug, status: "draft", reviewed_by: null, last_reviewed: null });
    expect(plan.write[0].sources[0].url).toBe(sourceUrl);
    expect(result.webResults).toHaveLength(2);
  });

  it.each(["anthropic", "none"] as const)("preserves explicit %s without opening MCP", async (provider) => {
    const openWeb = vi.fn();
    const model = modelFixture([{ content: [submit()] }]);
    const result = await runDraft(model.client, params, 2, {
      ...runOptions(openWeb),
      provider: resolveSearchProvider(provider),
    });
    expect(result.error).toBeNull();
    expect(openWeb).not.toHaveBeenCalled();
    expect(model.requests[0].tools?.map((tool) => ("name" in tool ? tool.name : tool.type))).toEqual(
      provider === "none" ? ["submit_entries"] : ["submit_entries", "web_search", "web_fetch"],
    );
  });

  it("rejects an invalid explicit provider", () => {
    expect(() => resolveSearchProvider("other")).toThrow("--search-provider");
  });

  it("does not execute calls when web access is disabled", async () => {
    const model = modelFixture([{ content: [tool("web_search", { objective: "ignored" })] }]);
    const result = await runDraft(model.client, params, 1, { ...runOptions(), provider: "none" });
    expect(result.error?.message).toContain("not enabled");
  });

  it("enforces independent whole-run budgets, including multiple calls in one model turn", async () => {
    const mcp = mcpFixture();
    const model = modelFixture([{ content: [tool("web_search", {}, "one"), tool("web_search", {}, "two")] }]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
    );
    expect(result.error?.message).toContain("budget");
    expect(mcp.requests.filter((request) => request.rpc.method === "tools/call")).toHaveLength(1);
  });

  it("returns MCP tool errors to the model without switching provider", async () => {
    const mcp = mcpFixture({ toolError: true });
    const model = modelFixture([{ content: [tool("web_search", {})] }, { content: [submit()] }]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
    );
    expect(result.error).toBeNull();
    expect(result.webResults[0].is_error).toBe(true);
    expect(JSON.stringify(model.requests[1].messages)).toContain('"is_error":true');
  });

  it.each([401, 429, 500])("stops on MCP HTTP %s without fallback", async (status) => {
    const mcp = mcpFixture({ status });
    const model = modelFixture([{ content: [submit()] }]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
    );
    expect(result.error).not.toBeNull();
    expect(model.requests).toHaveLength(0);
  });

  it("rejects incomplete MCP discovery", async () => {
    const mcp = mcpFixture({ missingTool: true });
    await expect(openParallelWeb(params.model, new AbortController().signal, { fetch: mcp.fetch })).rejects.toThrow(
      "web_fetch",
    );
  });

  it.each(["file:///etc/passwd", "https://user:password@example.com", "invalid"])(
    "rejects unsupported fetch URL %s",
    async (url) => {
      const mcp = mcpFixture();
      const model = modelFixture([{ content: [tool("web_fetch", { urls: [url] })] }]);
      const result = await runDraft(
        model.client,
        params,
        1,
        runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
      );
      expect(result.error).not.toBeNull();
      expect(mcp.requests.filter((request) => request.rpc.method === "tools/call")).toHaveLength(0);
    },
  );

  it.each(["refusal", "max_tokens"])("never dispatches partial calls after %s", async (reason) => {
    const mcp = mcpFixture();
    const model = modelFixture([{ content: [tool("web_search", {})], reason }]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
    );
    expect(result.error).toBeNull();
    expect(mcp.requests.filter((request) => request.rpc.method === "tools/call")).toHaveLength(0);
    expect(extractSubmittedEntries(result.responses[0]).ok).toBe(false);
  });

  it("rejects submission mixed with unread web results", async () => {
    const mcp = mcpFixture();
    const model = modelFixture([{ content: [tool("web_search", {}), submit()] }]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
    );
    expect(result.error?.message).toContain("after all web results");
  });

  it("bounds paused model turns", async () => {
    const model = modelFixture(Array.from({ length: 6 }, () => ({ content: [], reason: "pause_turn" })));
    const result = await runDraft(model.client, params, 1, { ...runOptions(), provider: "none" });
    expect(model.requests).toHaveLength(6);
    expect(extractSubmittedEntries(result.responses[result.responses.length - 1]).ok).toBe(false);
  });

  it("retains consumed sources and responses when the next model request fails", async () => {
    const mcp = mcpFixture();
    const model = modelFixture([{ content: [tool("web_search", {})] }]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch })),
    );
    expect(result.error).not.toBeNull();
    expect(result.responses).toHaveLength(1);
    expect(result.webResults[0].content).toContain(sourceUrl);
    expect(result.request?.tools?.some((tool) => tool.type === "web_search_20260209")).toBe(false);
  });

  it("honors cancellation before discovery", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const openWeb = vi.fn();
    const model = modelFixture([{ content: [submit()] }]);
    const result = await runDraft(model.client, params, 1, { ...runOptions(openWeb), signal: controller.signal });
    expect(result.error?.message).toBe("cancelled");
    expect(openWeb).not.toHaveBeenCalled();
  });

  it("cancels an in-flight model stream", async () => {
    const controller = new AbortController();
    const client = new Anthropic({
      apiKey: "fixture",
      maxRetries: 0,
      fetch: (_url, init: RequestInit | undefined) =>
        new Promise<Response>((_resolve, reject) => {
          const aborted = () => {
            reject(new DOMException("Aborted", "AbortError"));
          };
          init?.signal?.addEventListener("abort", aborted, { once: true });
          controller.abort(new Error("model interrupted"));
        }),
    });
    const result = await runDraft(client, params, 1, { ...runOptions(), provider: "none", signal: controller.signal });
    expect(result.error?.message).toMatch(/abort/i);
    expect(result.responses).toHaveLength(0);
  });

  it("times out pending MCP calls and retains earlier responses", async () => {
    const mcp = mcpFixture({ hang: true });
    const model = modelFixture([{ content: [tool("web_search", {})] }]);
    const result = await runDraft(
      model.client,
      params,
      1,
      runOptions((model, signal) => openParallelWeb(model, signal, { fetch: mcp.fetch, timeoutMs: 30 })),
    );
    expect(result.error?.message).toMatch(/timed out/i);
    expect(result.responses).toHaveLength(1);
  });

  it("cancels an in-flight MCP call", async () => {
    const controller = new AbortController();
    const mcp = mcpFixture({ hang: true });
    const model = modelFixture([{ content: [tool("web_search", {})] }]);
    const resultPromise = runDraft(model.client, params, 1, {
      ...runOptions(async (model, signal) => {
        const web = await openParallelWeb(model, signal, { fetch: mcp.fetch });
        return {
          ...web,
          call: async (name, input) => {
            const result = web.call(name, input);
            controller.abort(new Error("interrupted"));
            return await result;
          },
        };
      }),
      signal: controller.signal,
    });
    const result = await resultPromise;
    expect(result.error?.message).toMatch(/interrupted|abort/i);
  });
});
