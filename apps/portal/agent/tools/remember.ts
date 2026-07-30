import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireAgentPrincipal } from "../lib/auth";
import { memoryStore } from "../lib/memory-store";

export default defineTool({
  description:
    "Save one explicit, stable fact or preference for the authenticated user across EVE sessions. Never store secrets, credentials, wallet material, serialized transactions, one-time codes, approvals, or short-lived market data.",
  inputSchema: z.object({
    key: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9_.-]+$/),
    kind: z.enum(["fact", "preference", "decision", "lesson"]),
    value: z.string().min(1).max(1_500),
    provenance: z
      .string()
      .min(1)
      .max(300)
      .describe("Why this is durable and where the user stated it."),
  }),
  async execute(input, ctx) {
    const principal = requireAgentPrincipal(ctx);
    const memory = await memoryStore.remember(principal.userId, input);
    return {
      saved: true,
      memory: {
        id: memory.id,
        key: memory.key,
        kind: memory.kind,
        value: memory.value,
        updatedAt: memory.updatedAt,
      },
    };
  },
});
