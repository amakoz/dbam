import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

import { continuationContent, SUBMIT_TOOL_NAME, sumUsage } from "./draft-core";
import { openParallelWeb, type DraftWeb, type SearchProvider } from "./draft-web";

export const MAX_CONTINUATIONS = 5;

export interface RunResult {
  responses: BetaMessage[];
  /** First effective model request, with the selected provider tools rather than the template tools. */
  request: BetaMessageStreamParams | null;
  /** Client-side MCP attempts, separate from billed Anthropic server-tool usage. */
  webUsage: { searches: number; fetches: number };
  /** Exact tool results supplied to the model, also retained when a later request fails. */
  webResults: BetaToolResultBlockParam[];
  error: { kind: "api"; status: number | undefined; message: string } | { kind: "other"; message: string } | null;
}

export interface RunOptions {
  provider: SearchProvider;
  signal: AbortSignal;
  text: (delta: string) => void;
  block: (block: BetaContentBlock) => void;
  openWeb?: typeof openParallelWeb;
}

/** The normal drafter loop: provider resolution, web dispatch, result consumption and bounded continuations. */
export async function runDraft(
  client: Pick<Anthropic, "beta">,
  params: BetaMessageStreamParams,
  maxWebUses: number,
  options: RunOptions,
): Promise<RunResult> {
  const responses: BetaMessage[] = [];
  let request: BetaMessageStreamParams | null = null;
  const webUsage = { searches: 0, fetches: 0 };
  const webResults: BetaToolResultBlockParam[] = [];
  const messages: BetaMessageParam[] = [...params.messages];
  let web: DraftWeb | undefined;
  let error: RunResult["error"] = null;
  try {
    options.signal.throwIfAborted();
    if (options.provider === "parallel") {
      web = await (options.openWeb ?? openParallelWeb)(params.model, options.signal);
    }
    const submissionTools = params.tools?.filter((tool) => "name" in tool && tool.name === SUBMIT_TOOL_NAME) ?? [];
    let pauses = 0;
    // Each request must either finish, spend a web attempt, or use a bounded pause continuation.
    const maxTurns = 2 * maxWebUses + MAX_CONTINUATIONS + 1;
    for (let turn = 0; turn < maxTurns; turn++) {
      options.signal.throwIfAborted();
      let tools = params.tools;
      if (options.provider === "parallel") {
        tools = [
          ...submissionTools,
          ...(web?.tools.filter((tool) =>
            tool.name === "web_search" ? webUsage.searches < maxWebUses : webUsage.fetches < maxWebUses,
          ) ?? []),
        ];
      } else if (options.provider === "none") {
        tools = submissionTools;
      } else if (turn > 0) {
        const spent = sumUsage(responses);
        const searchesLeft = maxWebUses - spent.web_search_requests;
        const fetchesLeft = maxWebUses - spent.web_fetch_requests;
        if (searchesLeft < 1 || fetchesLeft < 1)
          throw new Error("the web search/fetch budget was used up while paused");
        tools = params.tools?.map((tool) => {
          if (tool.type === "web_search_20260209") return { ...tool, max_uses: searchesLeft };
          if (tool.type === "web_fetch_20260209") return { ...tool, max_uses: fetchesLeft };
          return tool;
        });
      }
      const nextRequest = { ...params, tools, messages: [...messages] };
      request ??= nextRequest;
      const stream = client.beta.messages.stream(nextRequest, { signal: options.signal });
      stream.on("text", options.text);
      stream.on("contentBlock", options.block);
      const message = await stream.finalMessage();
      responses.push(message);
      // Never dispatch incomplete or refused calls, including a partially streamed submit_entries.
      if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") break;
      if (message.stop_reason === "pause_turn") {
        if (++pauses > MAX_CONTINUATIONS) break;
        messages.push({ role: "assistant", content: continuationContent(message.content) });
        continue;
      }
      const content = continuationContent(message.content);
      const calls = content.filter((block) => block.type === "tool_use");
      const submissions = calls.filter((block) => block.name === SUBMIT_TOOL_NAME);
      if (submissions.length > 0) {
        if (submissions.length !== 1 || calls.length !== 1) {
          throw new Error("submit_entries must be called once, after all web results have been read");
        }
        break;
      }
      if (calls.length === 0) break;
      const results: BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        if (web === undefined || (call.name !== "web_search" && call.name !== "web_fetch")) {
          throw new Error(`Web tool is not enabled: ${call.name}`);
        }
        const key = call.name === "web_search" ? "searches" : "fetches";
        if (webUsage[key] >= maxWebUses) throw new Error(`The ${call.name} budget (${maxWebUses}) was used up`);
        webUsage[key]++;
        if (typeof call.input !== "object" || call.input === null || Array.isArray(call.input)) {
          throw new Error("Web tool input must be an object");
        }
        const result = await web.call(call.name, { ...call.input });
        const block: BetaToolResultBlockParam = {
          type: "tool_result",
          tool_use_id: call.id,
          content: result.text,
          is_error: result.isError,
        };
        results.push(block);
        webResults.push(block);
      }
      messages.push({ role: "assistant", content }, { role: "user", content: results });
      if (turn === maxTurns - 1) throw new Error("catalog drafting exceeded the bounded tool-turn limit");
    }
  } catch (caught) {
    error =
      caught instanceof Anthropic.APIError
        ? {
            kind: "api",
            status: typeof caught.status === "number" ? caught.status : undefined,
            message: caught.message,
          }
        : { kind: "other", message: caught instanceof Error ? caught.message : String(caught) };
  } finally {
    await web?.close().catch(() => undefined);
  }
  return { responses, request, webUsage, webResults, error };
}
