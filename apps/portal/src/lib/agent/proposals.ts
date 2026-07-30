// Parse + summarize model tool calls into client-executable proposals.

import {
  type AgentActionName,
  type AgentRisk,
  agentActionMeta,
  isAgentActionName,
} from "./actions";
import type { AgentMode } from "./modes";
import {
  type PermissionRule,
  type PolicyVerdict,
  resolvePolicy,
} from "./permissions";

export type AgentProposal = {
  id: string;
  name: AgentActionName;
  args: Record<string, unknown>;
  risk: AgentRisk;
  summary: string;
  verdict: PolicyVerdict;
  status: "pending" | "running" | "done" | "rejected" | "failed" | "skipped";
  error?: string;
};

export type RawToolCall = {
  id: string;
  name: string;
  argumentsJson: string;
};

export function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return {};
}

export function summarizeAction(
  name: AgentActionName,
  args: Record<string, unknown>,
): string {
  const symbol =
    typeof args.symbol === "string" ? args.symbol.toUpperCase() : null;
  const side = typeof args.side === "string" ? args.side : null;
  const size =
    typeof args.sizeUsd === "number" && Number.isFinite(args.sizeUsd)
      ? `$${args.sizeUsd}`
      : null;
  const lev =
    typeof args.leverage === "number" && Number.isFinite(args.leverage)
      ? `${args.leverage}x`
      : null;

  switch (name) {
    case "switch_market":
      return `Switch market → ${symbol ?? "?"}`;
    case "set_timeframe":
      return `Timeframe → ${String(args.timeframe ?? "?")}`;
    case "set_ticket":
      return `Draft ticket ${side ?? ""} ${size ?? ""} ${lev ?? ""}`.trim();
    case "place_perp_order":
      return `Place perp ${side ?? "?"} ${size ?? ""} ${symbol ?? ""} ${lev ?? ""}`.trim();
    case "place_spot_order":
      return `Place spot ${side ?? "?"} ${size ?? ""}`.trim();
    case "cancel_order":
      return `Cancel order ${String(args.orderId ?? "").slice(0, 12)}`;
    case "cancel_symbol_orders":
      return `Cancel ${symbol ?? "?"} orders${side && side !== "both" ? ` (${side})` : ""}`;
    case "close_position":
      return `Close ${symbol ?? "?"} position`;
    case "close_position_fraction":
      return `Close ${Math.round(Number(args.fraction) * 100)}% of ${symbol ?? "?"}`;
    case "close_all_positions":
      return "Close all positions";
    case "set_tp_sl":
      return `Set TP/SL on ${symbol ?? "?"}`;
    case "set_break_even":
      return `Break-even stop on ${symbol ?? "?"}`;
    case "reverse_position":
      return `Reverse ${symbol ?? "?"}`;
    case "add_margin":
      return `Add margin $${String(args.amountUsd ?? "?")} → ${symbol ?? "?"}`;
    case "watchlist_add":
      return `Watchlist + ${symbol ?? "?"}`;
    case "watchlist_remove":
      return `Watchlist − ${symbol ?? "?"}`;
    case "set_agent_pause":
      return args.paused === true
        ? "Engage money-PAUSE"
        : "Release money-PAUSE";
    default:
      return name;
  }
}

export function buildProposals(
  calls: readonly RawToolCall[],
  policy: {
    mode: AgentMode;
    paused: boolean;
    rules: readonly PermissionRule[];
  },
): AgentProposal[] {
  const proposals: AgentProposal[] = [];
  for (const call of calls) {
    if (!isAgentActionName(call.name)) continue;
    const meta = agentActionMeta(call.name);
    if (!meta) continue;
    const args = parseToolArgs(call.argumentsJson);
    const notionalUsd =
      typeof args.sizeUsd === "number"
        ? args.sizeUsd
        : typeof args.amountUsd === "number"
          ? args.amountUsd
          : null;
    const leverage = typeof args.leverage === "number" ? args.leverage : null;
    const symbol = typeof args.symbol === "string" ? args.symbol : null;
    const side = args.side === "buy" || args.side === "sell" ? args.side : null;
    const verdict = resolvePolicy(call.name, {
      mode: policy.mode,
      paused: policy.paused,
      rules: policy.rules,
      notionalUsd,
      leverage,
      symbol,
      side,
    });
    proposals.push({
      id: call.id,
      name: call.name,
      args,
      risk: meta.risk,
      summary: summarizeAction(call.name, args),
      verdict,
      status:
        verdict.decision === "deny"
          ? "skipped"
          : verdict.decision === "allow"
            ? "pending"
            : "pending",
      ...(verdict.decision === "deny" ? { error: verdict.reason } : {}),
    });
  }
  return proposals;
}

/** Split proposals into auto-run vs needs-accept vs blocked. */
export function partitionProposals(proposals: readonly AgentProposal[]): {
  auto: AgentProposal[];
  needsAccept: AgentProposal[];
  denied: AgentProposal[];
} {
  const auto: AgentProposal[] = [];
  const needsAccept: AgentProposal[] = [];
  const denied: AgentProposal[] = [];
  for (const proposal of proposals) {
    if (proposal.verdict.decision === "deny") denied.push(proposal);
    else if (proposal.verdict.decision === "allow") auto.push(proposal);
    else needsAccept.push(proposal);
  }
  return { auto, needsAccept, denied };
}
