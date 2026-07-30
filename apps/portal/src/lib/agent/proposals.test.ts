import { describe, expect, test } from "bun:test";
import {
  buildProposals,
  partitionProposals,
  summarizeAction,
} from "./proposals";

describe("buildProposals", () => {
  test("builds allow proposals in auto mode", () => {
    const proposals = buildProposals(
      [
        {
          id: "c1",
          name: "place_perp_order",
          argumentsJson: JSON.stringify({
            symbol: "SOL",
            side: "buy",
            sizeUsd: 100,
            leverage: 5,
            orderType: "market",
          }),
        },
      ],
      { mode: "auto", paused: false, rules: [] },
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.verdict.decision).toBe("allow");
    expect(proposals[0]?.summary).toContain("perp");
  });

  test("ignores unknown tools", () => {
    const proposals = buildProposals(
      [{ id: "x", name: "macro_signals", argumentsJson: "{}" }],
      { mode: "auto", paused: false, rules: [] },
    );
    expect(proposals).toHaveLength(0);
  });

  test("partition separates ask vs auto vs deny", () => {
    const proposals = buildProposals(
      [
        {
          id: "a",
          name: "switch_market",
          argumentsJson: JSON.stringify({ symbol: "BTC" }),
        },
        {
          id: "b",
          name: "place_perp_order",
          argumentsJson: JSON.stringify({
            symbol: "SOL",
            side: "buy",
            sizeUsd: 100,
          }),
        },
      ],
      { mode: "ask", paused: false, rules: [] },
    );
    const parts = partitionProposals(proposals);
    expect(parts.auto.some((p) => p.name === "switch_market")).toBe(true);
    expect(parts.needsAccept.some((p) => p.name === "place_perp_order")).toBe(
      true,
    );
  });
});

describe("summarizeAction", () => {
  test("break even", () => {
    expect(summarizeAction("set_break_even", { symbol: "eth" })).toContain(
      "ETH",
    );
  });
});
