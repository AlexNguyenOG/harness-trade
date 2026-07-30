// Stable action catalog for terminal agent tools.
// Read tools stay on the server (macro edge). Write tools are client-only
// (paper ledger + wallet sign path) and return as proposals from /api/chat.

import type { ToolDef } from "$lib/chat-core";

export type AgentActionName =
  | "switch_market"
  | "set_timeframe"
  | "set_ticket"
  | "place_perp_order"
  | "place_spot_order"
  | "cancel_order"
  | "cancel_symbol_orders"
  | "close_position"
  | "close_position_fraction"
  | "close_all_positions"
  | "set_tp_sl"
  | "set_break_even"
  | "reverse_position"
  | "add_margin"
  | "watchlist_add"
  | "watchlist_remove"
  | "set_agent_pause";

export type AgentRisk = "low" | "med" | "high";

export type AgentActionKind = "read" | "nav" | "write";

export type AgentActionMeta = {
  name: AgentActionName;
  kind: AgentActionKind;
  risk: AgentRisk;
  description: string;
  parameters: object;
};

const SYMBOL = {
  type: "string",
  description: "Market symbol, e.g. SOL or BTC (no -PERP suffix).",
} as const;

const SIDE = {
  type: "string",
  enum: ["buy", "sell"],
  description: "Ticket side: buy=long/bid, sell=short/ask.",
} as const;

/** Client-executed write/nav tools. Server never runs these. */
export const AGENT_ACTION_META: readonly AgentActionMeta[] = [
  {
    name: "switch_market",
    kind: "nav",
    risk: "low",
    description: "Switch the active chart/ticket market symbol.",
    parameters: {
      type: "object",
      properties: { symbol: SYMBOL },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "set_timeframe",
    kind: "nav",
    risk: "low",
    description: "Set chart timeframe (1m, 5m, 15m, 1h, 4h, 1d).",
    parameters: {
      type: "object",
      properties: {
        timeframe: {
          type: "string",
          enum: ["1m", "5m", "15m", "1h", "4h", "1d"],
        },
      },
      required: ["timeframe"],
      additionalProperties: false,
    },
  },
  {
    name: "set_ticket",
    kind: "nav",
    risk: "low",
    description:
      "Fill the trade ticket without submitting. Use before place_perp_order when the user wants a draft.",
    parameters: {
      type: "object",
      properties: {
        side: SIDE,
        orderType: { type: "string", enum: ["market", "limit"] },
        sizeUsd: { type: "number", description: "Notional size in USD." },
        leverage: { type: "number" },
        limitPrice: { type: "number" },
        takeProfit: { type: "number" },
        stopLoss: { type: "number" },
        reduceOnly: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "place_perp_order",
    kind: "write",
    risk: "high",
    description:
      "Submit a perp order (paper or live). Prefer explicit fields; missing fields use the current ticket.",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        side: SIDE,
        orderType: { type: "string", enum: ["market", "limit"] },
        sizeUsd: { type: "number" },
        leverage: { type: "number" },
        limitPrice: { type: "number" },
        takeProfit: { type: "number" },
        stopLoss: { type: "number" },
        reduceOnly: { type: "boolean" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "place_spot_order",
    kind: "write",
    risk: "high",
    description:
      "Submit a spot market or limit order for the active spot asset.",
    parameters: {
      type: "object",
      properties: {
        side: SIDE,
        orderType: { type: "string", enum: ["market", "limit"] },
        sizeUsd: { type: "number" },
        limitPrice: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "cancel_order",
    kind: "write",
    risk: "med",
    description: "Cancel one open order by orderSequenceNumber / order key.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        venue: { type: "string", enum: ["perp", "spot"] },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
  {
    name: "cancel_symbol_orders",
    kind: "write",
    risk: "med",
    description: "Cancel open perp orders for a symbol (optionally one side).",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        side: { type: "string", enum: ["buy", "sell", "both"] },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "close_position",
    kind: "write",
    risk: "high",
    description: "Close an entire open perp position at market.",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        subaccountIndex: { type: "number" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "close_position_fraction",
    kind: "write",
    risk: "high",
    description: "Close a fraction of a position (0–1].",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        fraction: { type: "number" },
        subaccountIndex: { type: "number" },
      },
      required: ["symbol", "fraction"],
      additionalProperties: false,
    },
  },
  {
    name: "close_all_positions",
    kind: "write",
    risk: "high",
    description: "Market-close every open perp position.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "set_tp_sl",
    kind: "write",
    risk: "med",
    description: "Set or clear take-profit / stop-loss on an open position.",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        takeProfit: { type: ["number", "null"] },
        stopLoss: { type: ["number", "null"] },
        subaccountIndex: { type: "number" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "set_break_even",
    kind: "write",
    risk: "med",
    description: "Move stop-loss to the position entry price (break-even).",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        subaccountIndex: { type: "number" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "reverse_position",
    kind: "write",
    risk: "high",
    description:
      "Close the position and open the opposite side at the same notional.",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        subaccountIndex: { type: "number" },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "add_margin",
    kind: "write",
    risk: "med",
    description: "Add isolated margin USD to a position.",
    parameters: {
      type: "object",
      properties: {
        symbol: SYMBOL,
        amountUsd: { type: "number" },
        subaccountIndex: { type: "number" },
      },
      required: ["symbol", "amountUsd"],
      additionalProperties: false,
    },
  },
  {
    name: "watchlist_add",
    kind: "nav",
    risk: "low",
    description: "Add a symbol to the watchlist.",
    parameters: {
      type: "object",
      properties: { symbol: SYMBOL },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "watchlist_remove",
    kind: "nav",
    risk: "low",
    description: "Remove a symbol from the watchlist.",
    parameters: {
      type: "object",
      properties: { symbol: SYMBOL },
      required: ["symbol"],
      additionalProperties: false,
    },
  },
  {
    name: "set_agent_pause",
    kind: "write",
    risk: "low",
    description:
      "Engage or release the money-PAUSE kill switch. When paused, all write actions are denied.",
    parameters: {
      type: "object",
      properties: { paused: { type: "boolean" } },
      required: ["paused"],
      additionalProperties: false,
    },
  },
];

export const AGENT_ACTION_TOOLS: ToolDef[] = AGENT_ACTION_META.map((meta) => ({
  name: meta.name,
  description: meta.description,
  parameters: meta.parameters,
}));

const META_BY_NAME = new Map(
  AGENT_ACTION_META.map((meta) => [meta.name, meta] as const),
);

export function isAgentActionName(value: string): value is AgentActionName {
  return META_BY_NAME.has(value as AgentActionName);
}

export function agentActionMeta(name: string): AgentActionMeta | null {
  return META_BY_NAME.get(name as AgentActionName) ?? null;
}

export function isWriteAction(name: string): boolean {
  return agentActionMeta(name)?.kind === "write";
}
