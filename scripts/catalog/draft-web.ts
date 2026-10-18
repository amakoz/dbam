import { randomUUID } from "node:crypto";

import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

export type SearchProvider = "parallel" | "anthropic" | "none";

/** No saved search-provider setting existed before this option. Model credentials remain separate. */
export function resolveSearchProvider(value: string | undefined): SearchProvider {
  if (value === undefined) return "parallel";
  if (value === "parallel" || value === "anthropic" || value === "none") return value;
  throw new Error("--search-provider must be parallel, anthropic or none");
}

export const PARALLEL_MCP_URL = "https://search.parallel.ai/mcp";
export const CATALOG_USER_AGENT = "dbam/0.0.1 (+https://github.com/amakoz/dbam)";

export interface WebResult {
  text: string;
  isError: boolean;
}

export interface DraftWeb {
  tools: BetaTool[];
  call: (name: string, input: Record<string, unknown>) => Promise<WebResult>;
  close: () => Promise<void>;
}

/** Only the two read-only tools are exposed. No environment or saved Parallel credentials are loaded. */
export async function openParallelWeb(
  model: string,
  signal: AbortSignal,
  options: { fetch?: typeof globalThis.fetch; timeoutMs?: number } = {},
): Promise<DraftWeb> {
  const timeout = options.timeoutMs ?? 30_000;
  const client = new Client({ name: "dbam-catalog-drafter", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(PARALLEL_MCP_URL), {
    requestInit: { headers: { "User-Agent": CATALOG_USER_AGENT } },
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const sessionId = randomUUID();
  try {
    signal.throwIfAborted();
    await client.connect(transport, { signal, timeout });
    const listed = await client.listTools(undefined, { signal, timeout });
    const tools: BetaTool[] = [];
    for (const name of ["web_search", "web_fetch"]) {
      const tool = listed.tools.find((item) => item.name === name);
      if (tool === undefined) throw new Error(`Parallel MCP did not advertise ${name}`);
      const properties = { ...tool.inputSchema.properties };
      delete properties.session_id;
      delete properties.model_name;
      tools.push({
        name,
        description: tool.description ?? `Read-only ${name} through Parallel Search MCP.`,
        input_schema: {
          ...tool.inputSchema,
          properties,
          required: tool.inputSchema.required?.filter((key) => key !== "session_id" && key !== "model_name"),
        },
      });
    }
    return {
      tools,
      async call(name, input) {
        signal.throwIfAborted();
        if (name !== "web_search" && name !== "web_fetch") throw new Error(`Unknown web tool: ${name}`);
        if (name === "web_fetch") {
          if (!Array.isArray(input.urls) || input.urls.length < 1 || input.urls.length > 20) {
            throw new Error("web_fetch requires 1–20 HTTP(S) URLs");
          }
          for (const value of input.urls as unknown[]) {
            if (typeof value !== "string") throw new Error("web_fetch requires HTTP(S) URLs");
            const url = new URL(value);
            if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "") {
              throw new Error("web_fetch requires HTTP(S) URLs without credentials");
            }
          }
        }
        const result = CallToolResultSchema.parse(
          await client.callTool(
            { name, arguments: { ...input, session_id: sessionId, model_name: model } },
            CallToolResultSchema,
            { signal, timeout },
          ),
        );
        // Preserve source URLs and excerpts verbatim for the model and the audit. Reject output with no text.
        const text = result.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
        if (text.length === 0) throw new Error(`Parallel ${name} returned no text`);
        return { text, isError: result.isError === true };
      },
      close: () => client.close(),
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}
