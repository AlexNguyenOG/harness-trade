import { defineTool, type ApprovalContext } from "eve/tools";
import { z } from "zod";
import { requireAgentPrincipal } from "../lib/auth";
import { routineStore } from "../lib/routine-store";

const symbol = z.string().min(1).max(16);
const check = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("market_snapshot"),
    symbols: z.array(symbol).min(1).max(8),
  }),
  z.object({
    kind: z.enum(["price_above", "price_below"]),
    symbol,
    priceUsd: z.number().positive().max(10_000_000),
  }),
]);

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("create"),
    name: z.string().min(1).max(100),
    check,
    everyMinutes: z.number().int().min(5).max(525_600),
    timezone: z.string().min(1).max(80),
    firstRunAt: z.string().datetime({ offset: true }),
  }),
  z.object({
    action: z.literal("update"),
    id: z.string().uuid(),
    name: z.string().min(1).max(100).optional(),
    check: check.optional(),
    everyMinutes: z.number().int().min(5).max(525_600).optional(),
    timezone: z.string().min(1).max(80).optional(),
    nextRunAt: z.string().datetime({ offset: true }).optional(),
  }),
  z.object({
    action: z.enum(["pause", "resume", "delete"]),
    id: z.string().uuid(),
  }),
]);

type Input = z.infer<typeof inputSchema>;

export default defineTool({
  description:
    "List or manage authenticated user-owned recurring market checks. Routines are strictly observe-and-alert only: they read public Phoenix prices and save private alerts, and can never sign, broadcast, approve, or execute transactions. Confirm timezone and first run before creation.",
  inputSchema,
  approval(ctx: ApprovalContext<Input>) {
    if (ctx.toolInput?.action === "list") {
      return {
        type: "approved" as const,
        reason: "Listing owner-scoped observe-only routines is read-only.",
      };
    }
    return "user-approval" as const;
  },
  async execute(input, ctx) {
    const principal = requireAgentPrincipal(ctx);
    if (input.action === "list") {
      return { routines: await routineStore.list(principal.userId) };
    }
    if (input.action === "create") {
      return {
        routine: await routineStore.create(principal.userId, {
          name: input.name,
          check: input.check,
          everyMinutes: input.everyMinutes,
          timezone: input.timezone,
          firstRunAt: input.firstRunAt,
        }),
      };
    }
    if (input.action === "update") {
      const { action: _action, id, ...patch } = input;
      return {
        routine: await routineStore.update(principal.userId, id, patch),
      };
    }
    const status =
      input.action === "pause"
        ? "paused"
        : input.action === "resume"
          ? "active"
          : "deleted";
    return {
      routine: await routineStore.update(principal.userId, input.id, {
        status,
      }),
    };
  },
});
