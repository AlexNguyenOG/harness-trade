// Permission resolution for agent proposals.
//
// Order of authority (highest first):
// 1. money-PAUSE → deny all write
// 2. matching rule with decision "deny"
// 3. agent mode "observe" → deny all write (nav/read ok)
// 4. matching rule "allow" → allow even in ask mode
// 5. matching rule "ask" → ask (even in auto — explicit caution)
// 6. mode "auto" → allow (full auto-approve)
// 7. mode "ask" → ask
//
// Nav/low-risk actions auto-run in ask mode (Cursor: navigation is free).

import {
  type AgentActionKind,
  type AgentActionName,
  type AgentRisk,
  agentActionMeta,
  isWriteAction,
} from "./actions";
import type { AgentMode } from "./modes";

export type RuleDecision = "allow" | "ask" | "deny";

export type PermissionRule = {
  id: string;
  /** Action name or "*" */
  action: AgentActionName | "*";
  /** Symbol or "*" */
  market: string | "*";
  side: "buy" | "sell" | "*";
  /** When set, rule matches only if notional is at or below this. */
  maxNotionalUsd?: number;
  /** When set, rule matches only if leverage is at or below this. */
  maxLeverage?: number;
  decision: RuleDecision;
};

export type PolicyContext = {
  mode: AgentMode;
  paused: boolean;
  rules: readonly PermissionRule[];
  /** Notional of the proposed action when known. */
  notionalUsd?: number | null;
  leverage?: number | null;
  symbol?: string | null;
  side?: "buy" | "sell" | null;
};

export type PolicyVerdict =
  | { decision: "allow"; reason: string }
  | { decision: "ask"; reason: string }
  | { decision: "deny"; reason: string };

/** Empty by default — mode (observe/ask/auto) is the baseline.
 * Users/settings can add deny/allow/ask overrides later. */
export const DEFAULT_PERMISSION_RULES: readonly PermissionRule[] = [];

/** Hard ceiling: proposals above this always require ask even in Auto. */
export const AUTO_NOTIONAL_ASK_USD = 5_000;
export const AUTO_LEVERAGE_ASK = 20;

export function resolvePolicy(
  actionName: string,
  ctx: PolicyContext,
): PolicyVerdict {
  const meta = agentActionMeta(actionName);
  const kind: AgentActionKind = meta?.kind ?? "write";
  const risk: AgentRisk = meta?.risk ?? "high";

  if (
    ctx.paused &&
    isWriteAction(actionName) &&
    actionName !== "set_agent_pause"
  ) {
    return { decision: "deny", reason: "money-PAUSE engaged" };
  }

  // Pause control itself: always allow so the agent can unpause only via
  // set_agent_pause with paused=false — still subject to mode for engage.
  if (actionName === "set_agent_pause") {
    if (ctx.mode === "observe") {
      return { decision: "deny", reason: "observe mode is read-only" };
    }
    // Engaging pause is always free; releasing pause asks unless auto.
    return {
      decision: ctx.mode === "auto" ? "allow" : "ask",
      reason: "pause control",
    };
  }

  if (kind === "write" && ctx.mode === "observe") {
    return { decision: "deny", reason: "observe mode is read-only" };
  }

  const matching = matchRules(actionName, ctx);
  for (const rule of matching) {
    if (rule.decision === "deny") {
      return { decision: "deny", reason: `rule ${rule.id}` };
    }
  }
  for (const rule of matching) {
    if (rule.decision === "allow") {
      return { decision: "allow", reason: `rule ${rule.id}` };
    }
  }
  for (const rule of matching) {
    if (rule.decision === "ask") {
      return { decision: "ask", reason: `rule ${rule.id}` };
    }
  }

  // Nav is free in ask/auto (Cursor seamlessness).
  if (kind === "nav" || risk === "low") {
    if (ctx.mode === "observe" && kind === "write") {
      return { decision: "deny", reason: "observe mode is read-only" };
    }
    return { decision: "allow", reason: "nav/low-risk" };
  }

  // Soft caps: large tickets never fully auto.
  if (ctx.mode === "auto") {
    if (
      ctx.notionalUsd != null &&
      Number.isFinite(ctx.notionalUsd) &&
      ctx.notionalUsd > AUTO_NOTIONAL_ASK_USD
    ) {
      return {
        decision: "ask",
        reason: `notional > $${AUTO_NOTIONAL_ASK_USD} soft cap`,
      };
    }
    if (
      ctx.leverage != null &&
      Number.isFinite(ctx.leverage) &&
      ctx.leverage > AUTO_LEVERAGE_ASK
    ) {
      return {
        decision: "ask",
        reason: `leverage > ${AUTO_LEVERAGE_ASK}x soft cap`,
      };
    }
    return { decision: "allow", reason: "auto mode full approve" };
  }

  // ask mode (default)
  return { decision: "ask", reason: "ask mode" };
}

function matchRules(actionName: string, ctx: PolicyContext): PermissionRule[] {
  const symbol = (ctx.symbol ?? "*").toUpperCase();
  const side = ctx.side ?? null;
  return ctx.rules.filter((rule) => {
    if (rule.action !== "*" && rule.action !== actionName) return false;
    if (rule.market !== "*" && rule.market.toUpperCase() !== symbol)
      return false;
    if (rule.side !== "*" && side !== null && rule.side !== side) return false;
    if (
      rule.maxNotionalUsd != null &&
      ctx.notionalUsd != null &&
      ctx.notionalUsd > rule.maxNotionalUsd
    ) {
      return false;
    }
    if (
      rule.maxLeverage != null &&
      ctx.leverage != null &&
      ctx.leverage > rule.maxLeverage
    ) {
      return false;
    }
    return true;
  });
}
