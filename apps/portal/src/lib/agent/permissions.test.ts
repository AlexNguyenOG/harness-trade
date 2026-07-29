import { describe, expect, test } from "bun:test";
import { resolvePolicy, type PermissionRule } from "./permissions";

const emptyRules: PermissionRule[] = [];

describe("resolvePolicy", () => {
  test("observe denies write tools", () => {
    const verdict = resolvePolicy("place_perp_order", {
      mode: "observe",
      paused: false,
      rules: emptyRules,
      notionalUsd: 100,
      leverage: 5,
      symbol: "SOL",
      side: "buy",
    });
    expect(verdict.decision).toBe("deny");
  });

  test("observe allows nav", () => {
    const verdict = resolvePolicy("switch_market", {
      mode: "observe",
      paused: false,
      rules: emptyRules,
      symbol: "BTC",
    });
    expect(verdict.decision).toBe("allow");
  });

  test("ask mode asks on high-risk write", () => {
    const verdict = resolvePolicy("place_perp_order", {
      mode: "ask",
      paused: false,
      rules: emptyRules,
      notionalUsd: 100,
      leverage: 5,
      symbol: "SOL",
      side: "buy",
    });
    expect(verdict.decision).toBe("ask");
  });

  test("auto mode full-approves normal write", () => {
    const verdict = resolvePolicy("place_perp_order", {
      mode: "auto",
      paused: false,
      rules: emptyRules,
      notionalUsd: 250,
      leverage: 5,
      symbol: "SOL",
      side: "buy",
    });
    expect(verdict.decision).toBe("allow");
    expect(verdict.reason).toContain("auto");
  });

  test("auto still asks above soft notional cap", () => {
    const verdict = resolvePolicy("place_perp_order", {
      mode: "auto",
      paused: false,
      rules: emptyRules,
      notionalUsd: 12_000,
      leverage: 3,
      symbol: "SOL",
      side: "buy",
    });
    expect(verdict.decision).toBe("ask");
  });

  test("PAUSE denies writes", () => {
    const verdict = resolvePolicy("close_position", {
      mode: "auto",
      paused: true,
      rules: emptyRules,
      symbol: "SOL",
    });
    expect(verdict.decision).toBe("deny");
    expect(verdict.reason).toContain("PAUSE");
  });

  test("explicit deny rule wins over auto", () => {
    const rules: PermissionRule[] = [
      {
        id: "no-meme",
        action: "*",
        market: "WIF",
        side: "*",
        decision: "deny",
      },
    ];
    const verdict = resolvePolicy("place_perp_order", {
      mode: "auto",
      paused: false,
      rules,
      notionalUsd: 50,
      leverage: 2,
      symbol: "WIF",
      side: "buy",
    });
    expect(verdict.decision).toBe("deny");
  });

  test("explicit allow rule skips ask in ask mode", () => {
    const rules: PermissionRule[] = [
      {
        id: "sol-ok",
        action: "place_perp_order",
        market: "SOL",
        side: "*",
        decision: "allow",
      },
    ];
    const verdict = resolvePolicy("place_perp_order", {
      mode: "ask",
      paused: false,
      rules,
      notionalUsd: 100,
      leverage: 5,
      symbol: "SOL",
      side: "buy",
    });
    expect(verdict.decision).toBe("allow");
  });
});
