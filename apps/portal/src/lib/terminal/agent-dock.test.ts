import { describe, expect, test } from "bun:test";
import {
  AGENT_DOCK_DEFAULT_WIDTH,
  AGENT_DOCK_MAX_WIDTH,
  AGENT_DOCK_MIN_WIDTH,
  agentDockWidthBounds,
  clampAgentDockWidth,
  parseAgentDockWidth,
} from "./agent-dock";

describe("agent dock width", () => {
  test("uses fixed product bounds on a wide viewport", () => {
    expect(agentDockWidthBounds(1600)).toEqual({
      min: AGENT_DOCK_MIN_WIDTH,
      max: AGENT_DOCK_MAX_WIDTH,
    });
    expect(clampAgentDockWidth(320, 1600)).toBe(AGENT_DOCK_MIN_WIDTH);
    expect(clampAgentDockWidth(720, 1600)).toBe(AGENT_DOCK_MAX_WIDTH);
  });

  test("preserves usable terminal space on smaller desktop viewports", () => {
    expect(agentDockWidthBounds(1180)).toEqual({
      min: AGENT_DOCK_MIN_WIDTH,
      max: 620,
    });
    expect(clampAgentDockWidth(640, 1180)).toBe(620);
  });

  test("falls back for non-finite widths and rounds pixel values", () => {
    expect(clampAgentDockWidth(Number.NaN, 1600)).toBe(
      AGENT_DOCK_DEFAULT_WIDTH,
    );
    expect(clampAgentDockWidth(487.6, 1600)).toBe(488);
  });

  test("parses persisted widths without accepting empty or invalid values", () => {
    expect(parseAgentDockWidth("512")).toBe(512);
    expect(parseAgentDockWidth(" 480.5 ")).toBe(480.5);
    expect(parseAgentDockWidth(null)).toBeNull();
    expect(parseAgentDockWidth("")).toBeNull();
    expect(parseAgentDockWidth("nope")).toBeNull();
    expect(parseAgentDockWidth("-20")).toBeNull();
  });
});
