import { describe, expect, test } from "bun:test";
import { parseAccountMode } from "../../../agent/lib/auth";
import {
  liveAccessOwnerHash,
  liveAccessPathForOwner,
} from "../../../agent/lib/live-access-store";

describe("live-access paths", () => {
  test("partitions by owner hash", () => {
    const a = liveAccessOwnerHash("did:privy:alice");
    const b = liveAccessOwnerHash("did:privy:bob");
    expect(a).not.toBe(b);
    expect(liveAccessPathForOwner("did:privy:alice")).toContain(a);
    expect(liveAccessPathForOwner("did:privy:alice")).toContain(
      "agent-state/v1/live-access/",
    );
  });
});

describe("account mode clamp", () => {
  test("live without liveAccess flag becomes paper", () => {
    expect(parseAccountMode("live", "false")).toBe("paper");
    expect(parseAccountMode("live", false)).toBe("paper");
    expect(parseAccountMode("live", undefined)).toBe("paper");
  });

  test("live with liveAccess flag stays live", () => {
    expect(parseAccountMode("live", "true")).toBe("live");
    expect(parseAccountMode("live", true)).toBe("live");
  });

  test("paper stays paper", () => {
    expect(parseAccountMode("paper", "true")).toBe("paper");
  });
});
