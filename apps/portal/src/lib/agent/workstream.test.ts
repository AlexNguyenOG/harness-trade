import { describe, expect, test } from "bun:test";
import { projectHarnessTool } from "./workstream";

describe("projectHarnessTool", () => {
  test("projects a standardized memory envelope", () => {
    const card = projectHarnessTool({
      toolName: "remember",
      state: "output-available",
      output: {
        presentation: {
          schema: "harness.presentation.v1",
          kind: "memory",
          title: "Risk preference remembered",
          summary: "Prefer Ask mode above $2,000 notional.",
          scope: "principal",
          confidence: 1,
          expiresAt: "2027-01-01T00:00:00.000Z",
        },
      },
    });

    expect(card.kind).toBe("memory");
    expect(card.status).toBe("success");
    expect(card.facts).toContainEqual({ label: "Confidence", value: "100%" });
  });

  test("projects legacy transaction URLs as receipts", () => {
    const card = projectHarnessTool({
      toolName: "execute_trade",
      state: "output-available",
      output: {
        summary: "Opened SOL long.",
        explorerUrls: ["https://solscan.io/tx/signature"],
      },
    });

    expect(card.kind).toBe("execution");
    expect(card.receipts).toHaveLength(1);
    expect(card.receipts[0]?.href).toBe("https://solscan.io/tx/signature");
  });

  test("navigation remains context mutation even with a bad execution hint", () => {
    const card = projectHarnessTool({
      toolName: "switch_market",
      state: "output-available",
      input: { operation: "market.select", symbol: "BTC" },
      output: {
        explorerUrls: ["https://solscan.io/tx/should-not-render"],
        presentation: {
          kind: "execution",
          title: "Select BTC",
          stages: [{ label: "Signed transaction", status: "confirmed" }],
        },
      },
    });

    expect(card.kind).toBe("context");
    expect(card.eyebrow).toBe("Context");
    expect(card.statusLabel).toBe("updated");
    expect(card.receipts).toHaveLength(0);
    expect(card.steps).toHaveLength(0);
  });

  test("labels an unknown Receipt as reconciliation required", () => {
    const card = projectHarnessTool({
      toolName: "execute_trade",
      state: "output-available",
      output: {
        presentation: {
          schema: "harness.presentation.v1",
          kind: "receipt",
          title: "Paper action outcome unknown",
          summary: "Check the paper portfolio before retrying.",
          status: "waiting",
        },
      },
    });

    expect(card.kind).toBe("receipt");
    expect(card.status).toBe("waiting");
    expect(card.statusLabel).toBe("reconciliation needed");
  });
});
