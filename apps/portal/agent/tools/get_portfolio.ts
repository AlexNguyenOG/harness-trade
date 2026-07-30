import { defineTool } from "eve/tools";
import { z } from "zod";
import { transactionLedger } from "../lib/ledger";
import { getPortfolio } from "../lib/trading";

export default defineTool({
  description:
    "Read the authenticated user's persistent EVE wallet address, server-signing status, balance, Phoenix collateral, positions, open orders, and durable transaction history. Use before modifying existing exposure.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const portfolio = await getPortfolio(ctx);
    return {
      ...portfolio,
      recentServerTransactions: transactionLedger.get().slice(-20),
    };
  },
});
