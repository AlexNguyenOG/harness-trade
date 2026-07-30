import { defineTool } from "eve/tools";
import { z } from "zod";
import { recentPhoenixPrices } from "../lib/trading";

const symbolSchema = z
  .string()
  .min(1)
  .max(16)
  .describe("Venue symbol without -PERP, for example SOL or BTC.");

const pricePointSchema = z.object({
  observedAt: z.string(),
  priceUsd: z.number().positive(),
});

const priceQuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  priceUsd: z.number().positive(),
  changeUsd: z.number(),
  changePct: z.number(),
  timeframe: z.literal("1m"),
  recent: z.array(pricePointSchema).min(1).max(6),
});

const outputSchema = z.object({
  symbol: z.string(),
  priceUsd: z.number().positive(),
  source: z.literal("phoenix"),
  observedAt: z.string(),
  fetchedAt: z.string(),
  presentation: z.object({
    schema: z.literal("harness.presentation.v2"),
    id: z.string(),
    component: z.literal("price_quote"),
    data: priceQuoteSchema,
    provenance: z.object({
      source: z.literal("phoenix"),
      observedAt: z.string(),
      expiresAt: z.string(),
    }),
  }),
});

const ASSET_NAMES: Readonly<Record<string, string>> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
};

function normalizedSymbol(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/-PERP$/, "");
}

export default defineTool({
  description:
    "Fetch a fresh public Phoenix market price. Use for current-price questions and before planning a paper trade; this read does not require a wallet.",
  inputSchema: z.object({
    symbol: symbolSchema,
  }),
  outputSchema,
  async execute(input) {
    const symbol = normalizedSymbol(input.symbol);
    const recent = await recentPhoenixPrices(symbol, 6);
    const latest = recent.at(-1);
    if (!latest) throw new Error("phoenix-price-malformed");
    const previous = recent.at(-2) ?? latest;
    const changeUsd = latest.priceUsd - previous.priceUsd;
    const changePct = (changeUsd / previous.priceUsd) * 100;
    const fetchedAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(fetchedAt) + 90_000).toISOString();
    const data = {
      symbol,
      name: ASSET_NAMES[symbol] ?? symbol,
      priceUsd: latest.priceUsd,
      changeUsd,
      changePct,
      timeframe: "1m" as const,
      recent,
    };
    return {
      symbol,
      priceUsd: latest.priceUsd,
      source: "phoenix",
      observedAt: latest.observedAt,
      fetchedAt,
      presentation: {
        schema: "harness.presentation.v2" as const,
        id: `price:${symbol}:${latest.observedAt}`,
        component: "price_quote" as const,
        data,
        provenance: {
          source: "phoenix" as const,
          observedAt: latest.observedAt,
          expiresAt,
        },
      },
    };
  },
  toModelOutput(output) {
    return {
      type: "json" as const,
      value: {
        symbol: output.symbol,
        priceUsd: output.priceUsd,
        source: output.source,
        observedAt: output.observedAt,
        changePct: output.presentation.data.changePct,
      },
    };
  },
});
