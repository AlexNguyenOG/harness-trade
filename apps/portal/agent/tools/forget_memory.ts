import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { requireAgentPrincipal } from "../lib/auth";
import { memoryStore } from "../lib/memory-store";

export default defineTool({
  description:
    "Forget one cross-session memory belonging to the authenticated user. List memories first when the target is ambiguous.",
  inputSchema: z.object({
    id: z.string().regex(/^[0-9a-f]{32}$/i),
  }),
  approval: always(),
  async execute({ id }, ctx) {
    const principal = requireAgentPrincipal(ctx);
    return { forgotten: await memoryStore.forget(principal.userId, id) };
  },
});
