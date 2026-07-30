import type { ApprovalContext, ToolContext } from "eve/tools";

export type AgentMode = "observe" | "ask" | "auto";
export type AccountMode = "paper" | "live";

export type AgentPrincipal = {
  userId: string;
  agentMode: AgentMode;
  accountMode: AccountMode;
  paused: boolean;
};

type EveContext = ToolContext | ApprovalContext<unknown>;

function attributes(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function parseMode(value: unknown): AgentMode {
  return value === "observe" || value === "auto" ? value : "ask";
}

function parseAccountMode(value: unknown): AccountMode {
  return value === "live" ? "live" : "paper";
}

export function requireAgentPrincipal(ctx: EveContext): AgentPrincipal {
  const current = ctx.session.auth.current;
  const initiator = ctx.session.auth.initiator;
  if (
    !current ||
    !initiator ||
    current.principalType !== "user" ||
    initiator.principalType !== "user" ||
    current.principalId !== initiator.principalId
  ) {
    throw new Error("agent-session-owner-mismatch");
  }
  const attrs = attributes(current.attributes);
  return {
    userId: current.principalId,
    agentMode: parseMode(attrs.agentMode),
    accountMode: parseAccountMode(attrs.accountMode),
    paused: attrs.paused === true || attrs.paused === "true",
  };
}

export function transactionApproval(
  ctx: ApprovalContext<Record<string, unknown>>,
) {
  let principal: AgentPrincipal;
  try {
    principal = requireAgentPrincipal(ctx);
  } catch {
    return { type: "denied" as const, reason: "Session owner mismatch." };
  }
  if (principal.paused) {
    return { type: "denied" as const, reason: "Money-PAUSE is engaged." };
  }
  if (principal.agentMode === "observe") {
    return { type: "denied" as const, reason: "Observe mode is read-only." };
  }
  if (principal.agentMode === "ask") return "user-approval" as const;
  if (principal.accountMode === "paper") {
    return {
      type: "approved" as const,
      reason: "Auto mode permits paper execution.",
    };
  }

  const input = ctx.toolInput ?? {};
  const notional = Number(input.sizeUsd ?? input.amountUsd ?? 0);
  const leverage = Number(input.leverage ?? 0);
  if (
    (Number.isFinite(notional) && notional > 5_000) ||
    (Number.isFinite(leverage) && leverage > 20)
  ) {
    return "user-approval" as const;
  }
  return {
    type: "approved" as const,
    reason: "Auto mode within the server risk envelope.",
  };
}
