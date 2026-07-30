import { defineTool } from "eve/tools";
import { z } from "zod";
import { currentPhoenixPrice } from "../lib/trading";

export default defineTool({
  description:
    "Fetch a fresh public Phoenix market price. Use for current-price questions and before planning a paper trade; this read does not require a wallet.",
  inputSchema: z.object({
    symbol: z
      .string()
      .min(1)
      .max(16)
      .describe("Venue symbol without -PERP, for example SOL or BTC."),
  }),
  async execute(input) {
    const priceUsd = await currentPhoenixPrice(input.symbol);
    return {
      symbol: input.symbol.trim().toUpperCase(),
      priceUsd,
      source: "phoenix",
      fetchedAt: new Date().toISOString(),
    };
  },
});
