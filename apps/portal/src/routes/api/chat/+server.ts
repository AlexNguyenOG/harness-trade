import { json } from "@sveltejs/kit";
import { env as privateEnv } from "$env/dynamic/private";
import { env as publicEnv } from "$env/dynamic/public";
import { AGENT_ACTION_TOOLS, isAgentActionName } from "$lib/agent/actions";
import { type AgentMode, isAgentMode } from "$lib/agent/modes";
import {
  BURST_WINDOW_MS,
  buildMessages,
  burstAllowed,
  CHAT_TOOLS,
  type ChatMessage,
  type ChatRole,
  type ToolDef,
  capHistory,
  classifyTaskClass,
  dailyAllowed,
  groundedOrNull,
  toolToEdgePath,
} from "$lib/chat-core";
import {
  type ChatModelChoice,
  FREE_MODEL,
  type ResolvedModel,
  resolveModel,
} from "$lib/chat-models";
import { verifyPrivyAccessToken } from "$lib/server/privy";
import type { RequestHandler } from "./$types";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const AI_GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const TOOL_RESULT_CAP = 4_000;
const MAX_TOOL_ROUNDS = 3;
const TOOL_TIMEOUT_MS = 5_000;
const AGENT_MAX_TOKENS = 800;
const CHAT_MAX_TOKENS = 400;
const FREE_RESOLVED_MODEL: ResolvedModel = {
  tier: "free",
  model: FREE_MODEL,
  proLabel: false,
};

// V1 rate caps are intentionally in-memory and approximate across instances.
// Fluid reuses instances enough for this side-panel chat guardrail.
const burstByUser = new Map<string, number[]>();
const dailyByUser = new Map<string, { dayKey: string; count: number }>();

type QueuedAction = {
  id: string;
  name: string;
  arguments: string;
};

type ChatRequestBody = {
  history: ChatMessage[];
  context: unknown;
  edgeToken?: string;
  modelChoice: ChatModelChoice;
  /** When set, enable agent action tools + agent system prompt. */
  agentMode?: AgentMode;
  paused?: boolean;
};

type ChatModelConfig = {
  url: string;
  apiKey: string;
  model: string;
};

type DeepSeekMessage =
  | { role: string; content: string }
  | { role: "assistant"; content: string; tool_calls: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type DeepSeekResponse = {
  choices?: {
    message?: {
      content?: unknown;
      tool_calls?: unknown;
    };
  }[];
};

type ToolResult = { message: DeepSeekMessage; facts: string };

type GeneratedReply = {
  reply: string | null;
  toolFacts: string[];
  resolved: ResolvedModel;
  actions: QueuedAction[];
};

export const POST: RequestHandler = async ({ request, fetch, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  const userId = token ? await verifyPrivyAccessToken(token) : null;
  if (!userId) return json({ error: "auth-required" }, { status: 401 });

  const body = await readChatBody(request);
  if (!body) return json({ error: "bad-request" }, { status: 400 });

  const history = capHistory(body.history);
  const contextJson = JSON.stringify(body.context);
  if (typeof contextJson !== "string") {
    return json({ error: "bad-request" }, { status: 400 });
  }

  const nowMs = Date.now();
  const recent = (burstByUser.get(userId) ?? []).filter(
    (timestamp) => nowMs - timestamp < BURST_WINDOW_MS,
  );
  if (!burstAllowed(recent, nowMs)) {
    burstByUser.set(userId, recent);
    return json({ error: "limit-reached", scope: "burst" }, { status: 429 });
  }

  const daily = dailyAllowed(dailyByUser.get(userId) ?? null, nowMs);
  dailyByUser.set(userId, daily.nextRecord);
  if (!daily.allowed) {
    burstByUser.set(userId, recent);
    return json({ error: "limit-reached", scope: "daily" }, { status: 429 });
  }
  burstByUser.set(userId, [...recent, nowMs]);

  const taskClass = classifyTaskClass(latestUserContent(history));
  const resolvedModel = resolveModel(
    body.modelChoice,
    taskClass,
    publicEnv.PUBLIC_CHAT_PRO_OPEN === "1",
  );
  const generated = await generateReply({
    context: body.context,
    edgeFetch: fetch,
    edgeToken: body.edgeToken,
    history,
    nowMs,
    resolvedModel,
    agentMode: body.agentMode,
    paused: body.paused === true,
  });
  if (!generated.reply && generated.actions.length === 0) {
    return json({
      reply: null,
      reason: "unavailable",
      model: generated.resolved.model,
      proLabel: generated.resolved.proLabel,
      actions: [],
    });
  }

  // Grounding facts include the conversation itself: a number the user
  // typed is a given fact — echoing it back is not invention.
  // Action summaries are exempt from digit grounding (ids/symbols).
  let reply = generated.reply;
  if (reply) {
    reply = groundedOrNull(
      reply,
      [
        contextJson,
        ...history.map((message) => message.content),
        ...generated.toolFacts,
      ].join("\n"),
    );
  }
  if (reply === null && generated.actions.length === 0) {
    return json({
      reply: null,
      reason: "ungrounded",
      model: generated.resolved.model,
      proLabel: generated.resolved.proLabel,
      actions: [],
    });
  }

  // When actions are present but grounding failed, keep a terse status line.
  const safeReply =
    reply ??
    (generated.actions.length > 0
      ? `Queued ${generated.actions.length} action(s) for review.`
      : null);

  return json({
    reply: safeReply,
    asOf: Date.now(),
    model: generated.resolved.model,
    proLabel: generated.resolved.proLabel,
    actions: generated.actions,
  });
};

async function readChatBody(request: Request): Promise<ChatRequestBody | null> {
  let body: unknown;
  try {
    body = (await request.json()) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(body)) return null;
  if (!("context" in body)) return null;
  if (!Array.isArray(body.history)) return null;
  const history = parseHistory(body.history);
  if (!history) return null;
  if ("edgeToken" in body && typeof body.edgeToken !== "string") return null;
  const modelChoice = parseModelChoice(body.modelChoice);
  if (!modelChoice) return null;
  let agentMode: AgentMode | undefined;
  if ("agentMode" in body && body.agentMode !== undefined) {
    if (!isAgentMode(body.agentMode)) return null;
    agentMode = body.agentMode;
  }
  if ("paused" in body && body.paused !== undefined && typeof body.paused !== "boolean") {
    return null;
  }
  return {
    history,
    context: body.context,
    edgeToken: typeof body.edgeToken === "string" ? body.edgeToken : undefined,
    modelChoice,
    agentMode,
    paused: body.paused === true,
  };
}

function parseHistory(history: unknown[]): ChatMessage[] | null {
  const parsed: ChatMessage[] = [];
  for (const item of history) {
    if (!isRecord(item)) return null;
    if (!isChatRole(item.role) || typeof item.content !== "string") return null;
    parsed.push({ role: item.role, content: item.content });
  }
  return parsed;
}

function isChatRole(value: unknown): value is ChatRole {
  return value === "user" || value === "assistant" || value === "tool";
}

function parseModelChoice(value: unknown): ChatModelChoice | null {
  if (value === undefined) return "auto";
  if (value === "auto" || value === "free" || value === "pro") return value;
  return null;
}

function latestUserContent(history: ChatMessage[]): string {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (message?.role === "user") return message.content;
  }
  return "";
}

async function generateReply(input: {
  context: unknown;
  edgeFetch: typeof fetch;
  edgeToken?: string;
  history: ChatMessage[];
  nowMs: number;
  resolvedModel: ResolvedModel;
  agentMode?: AgentMode;
  paused?: boolean;
}): Promise<GeneratedReply> {
  if (input.resolvedModel.tier === "pro") {
    const proConfig = readProModelConfig(input.resolvedModel.model);
    if (proConfig) {
      try {
        const proReply = await runToolLoop(input, proConfig);
        if (proReply.reply || proReply.actions.length > 0) {
          return { ...proReply, resolved: input.resolvedModel };
        }
      } catch {
        // Pro routing failures fall back to the raw DeepSeek free lane.
      }
    }
  }

  const freeConfig = readFreeModelConfig();
  if (!freeConfig) {
    return {
      reply: null,
      toolFacts: [],
      resolved: FREE_RESOLVED_MODEL,
      actions: [],
    };
  }
  const freeReply = await runToolLoop(input, freeConfig);
  return { ...freeReply, resolved: FREE_RESOLVED_MODEL };
}

async function runToolLoop(
  input: {
    context: unknown;
    edgeFetch: typeof fetch;
    edgeToken?: string;
    history: ChatMessage[];
    nowMs: number;
    agentMode?: AgentMode;
    paused?: boolean;
  },
  config: ChatModelConfig,
): Promise<{ reply: string | null; toolFacts: string[]; actions: QueuedAction[] }> {
  const agentEnabled = input.agentMode !== undefined;
  const tools: ToolDef[] = agentEnabled
    ? [...CHAT_TOOLS, ...AGENT_ACTION_TOOLS]
    : CHAT_TOOLS;
  const messages: DeepSeekMessage[] = buildMessages(
    input.context,
    input.history,
    input.nowMs,
    agentEnabled
      ? { agentMode: input.agentMode, paused: input.paused }
      : undefined,
  );
  const toolFacts: string[] = [];
  const actions: QueuedAction[] = [];
  let lastContent = "";

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await callChatModel({
      url: config.url,
      apiKey: config.apiKey,
      model: config.model,
      messages,
      tools,
      maxTokens: agentEnabled ? AGENT_MAX_TOKENS : CHAT_MAX_TOKENS,
    });
    if (!response) {
      return {
        reply: lastContent.trim() || null,
        toolFacts,
        actions,
      };
    }
    lastContent = response.content;

    const toolCalls = parseToolCalls(response.tool_calls);
    if (toolCalls.length === 0) {
      return response.content.trim()
        ? { reply: response.content.trim(), toolFacts, actions }
        : { reply: lastContent.trim() || null, toolFacts, actions };
    }

    messages.push({
      role: "assistant",
      content: response.content,
      tool_calls: toolCalls,
    });

    for (const toolCall of toolCalls) {
      if (agentEnabled && isAgentActionName(toolCall.function.name)) {
        actions.push({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: '{"status":"queued_for_client"}',
        });
        toolFacts.push('{"status":"queued_for_client"}');
        continue;
      }
      const result = await resolveToolCall(
        toolCall,
        input.edgeFetch,
        input.edgeToken,
      );
      messages.push(result.message);
      toolFacts.push(result.facts);
    }

    // Once we have client actions, one more model turn is enough for narration.
    if (actions.length > 0 && round === MAX_TOOL_ROUNDS - 1) {
      break;
    }
  }

  return {
    reply: lastContent.trim() || null,
    toolFacts,
    actions,
  };
}

async function callChatModel(input: {
  url: string;
  apiKey: string;
  model: string;
  messages: DeepSeekMessage[];
  tools: ToolDef[];
  maxTokens: number;
}): Promise<{ content: string; tool_calls: unknown } | null> {
  const response = await globalThis.fetch(input.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      max_tokens: input.maxTokens,
      messages: input.messages,
      tools: input.tools.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    }),
  });
  if (!response.ok) return null;

  const data = (await response.json()) as DeepSeekResponse;
  const message = data.choices?.[0]?.message;
  if (!message) return null;
  return {
    content: typeof message.content === "string" ? message.content : "",
    tool_calls: message.tool_calls,
  };
}

function readFreeModelConfig(): ChatModelConfig | null {
  const apiKey = privateEnv.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  return { url: DEEPSEEK_URL, apiKey, model: FREE_MODEL };
}

function readProModelConfig(model: string): ChatModelConfig | null {
  const apiKey = privateEnv.AI_GATEWAY_API_KEY;
  if (!apiKey) return null;
  return { url: AI_GATEWAY_URL, apiKey, model };
}

function parseToolCalls(value: unknown): ToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: ToolCall[] = [];
  for (const item of value) {
    if (!isRecord(item) || !isRecord(item.function)) continue;
    const id = item.id;
    const name = item.function.name;
    const args = item.function.arguments;
    if (typeof id !== "string" || typeof name !== "string") continue;
    calls.push({
      id,
      type: "function",
      function: { name, arguments: typeof args === "string" ? args : "{}" },
    });
  }
  return calls;
}

async function resolveToolCall(
  toolCall: ToolCall,
  edgeFetch: typeof fetch,
  edgeToken: string | undefined,
): Promise<ToolResult> {
  const unavailable = (): ToolResult => ({
    message: {
      role: "tool",
      tool_call_id: toolCall.id,
      content: '{"status":"unavailable"}',
    },
    facts: '{"status":"unavailable"}',
  });

  const path = toolToEdgePath(toolCall.function.name);
  if (!path) return unavailable();

  try {
    const headers: HeadersInit = edgeToken
      ? { authorization: `Bearer ${edgeToken}` }
      : {};
    const response = await edgeFetch(
      `${privateEnv.EDGE_API_BASE ?? ""}${path}`,
      {
        headers,
        signal: AbortSignal.timeout(TOOL_TIMEOUT_MS),
      },
    );
    if (!response.ok) return unavailable();
    const content = (await response.text()).slice(0, TOOL_RESULT_CAP);
    return {
      message: { role: "tool", tool_call_id: toolCall.id, content },
      facts: content,
    };
  } catch {
    return unavailable();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
