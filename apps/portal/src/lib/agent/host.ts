// Host interface the terminal page implements so the agent can act
// without the agent modules importing the 7k-line page.

import type { AgentActionName } from "./actions";

export type AgentActionResult = {
  outcome: "confirmed" | "rejected";
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
    return { outcome: "rejected", message: "agent host not registered" };
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
    return { outcome: "rejected", message: `action not wired: ${name}` };
  }
  try {
    return await handler(args);
  } catch (error) {
    return {
      outcome: "rejected",
      message: error instanceof Error ? error.message : "action-failed",
    };
  }
}
