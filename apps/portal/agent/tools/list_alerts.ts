import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireAgentPrincipal } from "../lib/auth";
import { routineStore } from "../lib/routine-store";

export default defineTool({
  description:
    "List private alerts produced by the authenticated user's observe-only routines.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(100).default(50),
  }),
  async execute({ limit }, ctx) {
    const principal = requireAgentPrincipal(ctx);
    return { alerts: await routineStore.listAlerts(principal.userId, limit) };
  },
});
