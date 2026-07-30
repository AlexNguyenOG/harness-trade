import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireAgentPrincipal } from "../lib/auth";
import { memoryStore } from "../lib/memory-store";

export default defineTool({
  description:
    "List active cross-session memories belonging to the authenticated user.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(100).default(50),
  }),
  async execute({ limit }, ctx) {
    const principal = requireAgentPrincipal(ctx);
    const memories = await memoryStore.list(principal.userId, { limit });
    return {
      memories: memories.map(
        ({ id, key, kind, value, provenance, updatedAt, version }) => ({
          id,
          key,
          kind,
          value,
          provenance,
          updatedAt,
          version,
        }),
      ),
    };
  },
});
