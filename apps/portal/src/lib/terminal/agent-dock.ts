export const AGENT_DOCK_STORAGE_KEY = "harness.agent-dock-width.v1";
export const AGENT_DOCK_DEFAULT_WIDTH = 448;
export const AGENT_DOCK_MIN_WIDTH = 360;
export const AGENT_DOCK_MAX_WIDTH = 640;
export const AGENT_DOCK_MIN_TERMINAL_WIDTH = 560;

export type AgentDockWidthBounds = {
  min: number;
  max: number;
};

export function agentDockWidthBounds(
  viewportWidth: number,
): AgentDockWidthBounds {
  const available = Math.floor(viewportWidth - AGENT_DOCK_MIN_TERMINAL_WIDTH);
  return {
    min: AGENT_DOCK_MIN_WIDTH,
    max: Math.max(
      AGENT_DOCK_MIN_WIDTH,
      Math.min(AGENT_DOCK_MAX_WIDTH, available),
    ),
  };
}

export function clampAgentDockWidth(
  preferredWidth: number,
  viewportWidth: number,
): number {
  const bounds = agentDockWidthBounds(viewportWidth);
  const finiteWidth = Number.isFinite(preferredWidth)
    ? preferredWidth
    : AGENT_DOCK_DEFAULT_WIDTH;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, finiteWidth)));
}

export function parseAgentDockWidth(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const width = Number(value);
  return Number.isFinite(width) && width > 0 ? width : null;
}
