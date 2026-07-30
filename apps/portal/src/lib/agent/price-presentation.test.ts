import { describe, expect, test } from "bun:test";
import { projectPriceQuote } from "./price-presentation";

describe("projectPriceQuote", () => {
  test("projects a validated v2 price quote", () => {
    const card = projectPriceQuote({
      toolName: "get_market_price",
      state: "output-available",
      output: {
        presentation: {
          schema: "harness.presentation.v2",
          id: "price:SOL:2026-07-30T14:42:00.000Z",
          component: "price_quote",
          data: {
            symbol: "SOL",
            name: "Solana",
            priceUsd: 74.71,
            changeUsd: 0.11,
            changePct: 0.1474,
            timeframe: "1m",
            recent: [
              {
                observedAt: "2026-07-30T14:41:00.000Z",
                priceUsd: 74.6,
              },
              {
                observedAt: "2026-07-30T14:42:00.000Z",
                priceUsd: 74.71,
              },
            ],
          },
          provenance: {
            source: "phoenix",
            observedAt: "2026-07-30T14:42:00.000Z",
            expiresAt: "2026-07-30T14:43:30.000Z",
          },
        },
      },
    });

    expect(card).toMatchObject({
      symbol: "SOL",
      name: "Solana",
      priceUsd: 74.71,
      changePct: 0.1474,
      source: "phoenix",
    });
    expect(card?.recent).toHaveLength(2);
  });

  test("projects cached legacy price output safely", () => {
    const card = projectPriceQuote({
      toolName: "get_market_price",
      state: "output-available",
      output: {
        symbol: "SOL",
        priceUsd: 74.71,
        source: "phoenix",
        fetchedAt: "2026-07-30T14:42:00.000Z",
      },
    });

    expect(card?.name).toBe("Solana");
    expect(card?.recent).toEqual([
      {
        observedAt: "2026-07-30T14:42:00.000Z",
        priceUsd: 74.71,
      },
    ]);
  });

  test("rejects malformed or non-price tool output", () => {
    expect(
      projectPriceQuote({
        toolName: "execute_trade",
        state: "output-available",
        output: { priceUsd: 74.71 },
      }),
    ).toBeNull();
    expect(
      projectPriceQuote({
        toolName: "get_market_price",
        state: "output-available",
        output: { symbol: "SOL", priceUsd: Number.NaN },
      }),
    ).toBeNull();
  });
});
