// Agent approval modes — the autonomy slider for the in-terminal agent.
//
// observe: read-only. Narrate, never mutate.
// ask:     every write needs an explicit Accept (Cursor-style review).
// auto:    full auto-approve. Writes run immediately when policy allows.
//
// Deny rules and the money-PAUSE kill switch always win over auto.

export type AgentMode = "observe" | "ask" | "auto";

export const AGENT_MODES: readonly AgentMode[] = ["observe", "ask", "auto"];

export const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  observe: "Observe",
  ask: "Ask",
  auto: "Auto",
};

export function isAgentMode(value: unknown): value is AgentMode {
  return value === "observe" || value === "ask" || value === "auto";
}

export function parseAgentMode(
  value: unknown,
  fallback: AgentMode = "ask",
): AgentMode {
  return isAgentMode(value) ? value : fallback;
}
