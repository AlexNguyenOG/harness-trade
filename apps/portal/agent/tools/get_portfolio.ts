import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireAgentPrincipal } from "../lib/auth";
import { transactionLedger } from "../lib/ledger";
import { getPortfolio } from "../lib/trading";

export default defineTool({
  description:
    "Read the authenticated user's live EVE wallet, Phoenix collateral, positions, open orders, and durable transaction history. Do not use in paper mode: the current local paper portfolio is already supplied in client context.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    if (requireAgentPrincipal(ctx).accountMode === "paper") {
      return {
        accountMode: "paper" as const,
        source: "client-context" as const,
        summary:
          "Use the current paper positions, orders, and equity from client context.",
      };
    }
    const portfolio = await getPortfolio(ctx);
    return {
      ...portfolio,
      recentServerTransactions: transactionLedger.get().slice(-20),
    };
  },
});
