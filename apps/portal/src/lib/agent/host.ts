// Host interface the terminal page implements so the agent can act
// without the agent modules importing the 7k-line page.

import type { AgentActionName } from "./actions";

export type AgentActionResult = {
  ok: boolean;
  message: string;
};

export type AgentActionExecutor = (
  name: AgentActionName,
  args: Record<string, unknown>,
) => Promise<AgentActionResult>;

export type AgentHostHandlers = {
  [K in AgentActionName]?: (
    args: Record<string, unknown>,
  ) => Promise<AgentActionResult> | AgentActionResult;
};

let host: AgentHostHandlers | null = null;

export function registerAgentHost(handlers: AgentHostHandlers): void {
  host = handlers;
}

export function unregisterAgentHost(): void {
  host = null;
}

export async function executeAgentAction(
  name: AgentActionName,
  args: Record<string, unknown>,
): Promise<AgentActionResult> {
  if (!host) {
    return { ok: false, message: "agent host not registered" };
  }
  return executeAgentHostAction(host, name, args);
}

export async function executeAgentHostAction(
  handlers: AgentHostHandlers,
  name: AgentActionName,
  args: Record<string, unknown>,
): Promise<AgentActionResult> {
  const handler = handlers[name];
  if (!handler) {
    return { ok: false, message: `action not wired: ${name}` };
  }
  try {
    return await handler(args);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "action-failed",
    };
  }
}
