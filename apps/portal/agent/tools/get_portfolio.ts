import { defineTool } from "eve/tools";
import { z } from "zod";
import { getPortfolio } from "../lib/trading";
import { transactionLedger } from "../lib/ledger";

export default defineTool({
  description:
    "Read the authenticated user's server-signing status, wallet balance, Phoenix collateral, positions, open orders, and durable transaction history. Use before modifying existing exposure.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const portfolio = await getPortfolio(ctx);
    return {
      ...portfolio,
      recentServerTransactions: transactionLedger.get().slice(-20),
    };
  },
});
