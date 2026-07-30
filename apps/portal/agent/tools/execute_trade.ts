import { type ApprovalContext, defineTool } from "eve/tools";
import { z } from "zod";
import { transactionApproval } from "../lib/auth";
import { executeTrade } from "../lib/trading";

const symbol = z
  .string()
  .min(1)
  .max(16)
  .describe("Venue symbol without -PERP, for example SOL or BTC.");
const subaccountIndex = z.number().int().min(0).max(255).optional();

const inputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("place_perp"),
    symbol,
    side: z.enum(["buy", "sell"]),
    orderType: z.enum(["market", "limit"]),
    sizeUsd: z.number().positive().max(1_000_000),
    leverage: z.number().min(1).max(100),
    limitPrice: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
    reduceOnly: z.boolean().optional(),
  }),
  z.object({
    operation: z.literal("place_spot"),
    symbol,
    side: z.enum(["buy", "sell"]),
    orderType: z.enum(["market", "limit"]),
    sizeUsd: z.number().positive().max(1_000_000),
    limitPrice: z.number().positive().optional(),
    slippageBps: z.number().int().min(1).max(500).optional(),
  }),
  z.object({
    operation: z.literal("cancel_order"),
    venue: z.enum(["perp", "spot"]),
    orderId: z.string().min(1).max(128),
  }),
  z.object({
    operation: z.literal("cancel_symbol_orders"),
    symbol,
    side: z.enum(["buy", "sell", "both"]).optional(),
  }),
  z.object({
    operation: z.literal("close_position"),
    symbol,
    subaccountIndex,
  }),
  z.object({
    operation: z.literal("close_position_fraction"),
    symbol,
    fraction: z.number().positive().max(1),
    subaccountIndex,
  }),
  z.object({ operation: z.literal("close_all_positions") }),
  z.object({
    operation: z.literal("set_tp_sl"),
    symbol,
    takeProfit: z.number().positive().nullable().optional(),
    stopLoss: z.number().positive().nullable().optional(),
    subaccountIndex,
  }),
  z.object({
    operation: z.literal("set_break_even"),
    symbol,
    subaccountIndex,
  }),
  z.object({
    operation: z.literal("reverse_position"),
    symbol,
    subaccountIndex,
  }),
  z.object({
    operation: z.literal("add_margin"),
    symbol,
    amountUsd: z.number().positive().max(1_000_000),
    subaccountIndex,
  }),
]);

type Input = z.infer<typeof inputSchema>;

export default defineTool({
  description:
    "Execute an authenticated live trade, cancellation, close, reversal, TP/SL update, or margin action. The server resolves the signed-in user's isolated EVE wallet, builds and simulates the transaction, then signs and broadcasts inside the server runtime. Never accepts wallet ids, keys, or transactions from the model.",
  inputSchema,
  approval: (ctx: ApprovalContext<Input>) =>
    transactionApproval(
      ctx as unknown as ApprovalContext<Record<string, unknown>>,
    ),
  execute: executeTrade,
});
