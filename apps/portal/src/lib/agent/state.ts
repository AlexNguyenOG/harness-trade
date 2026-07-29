// Agent client state: mode, PAUSE, pending proposals, decision ledger.

import { get, type Writable, writable } from "svelte/store";
import {
  appendLedger,
  type LedgerEntry,
  loadLedger,
  makeLedgerId,
  saveLedger,
} from "./ledger";
import { type AgentMode, parseAgentMode } from "./modes";
import { DEFAULT_PERMISSION_RULES, type PermissionRule } from "./permissions";
import type { AgentProposal } from "./proposals";

const AGENT_PREFS_KEY = "harness.agent.prefs.v1";

export type AgentPrefs = {
  mode: AgentMode;
  paused: boolean;
  /** When true, terminal chrome simplifies toward AI harness. */
  harnessUi: boolean;
};

export type AgentState = AgentPrefs & {
  proposals: AgentProposal[];
  ledger: LedgerEntry[];
  rules: PermissionRule[];
  lastError: string | null;
};

function readPrefs(): AgentPrefs {
  const fallback: AgentPrefs = {
    mode: "ask",
    paused: false,
    harnessUi: true,
  };
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(AGENT_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;
    const row = parsed as Record<string, unknown>;
    return {
      mode: parseAgentMode(row.mode, fallback.mode),
      paused: row.paused === true,
      harnessUi: row.harnessUi !== false,
    };
  } catch {
    return fallback;
  }
}

const initialPrefs = readPrefs();

export const agentState: Writable<AgentState> = writable({
  ...initialPrefs,
  proposals: [],
  ledger: typeof localStorage !== "undefined" ? loadLedger(localStorage) : [],
  rules: [...DEFAULT_PERMISSION_RULES],
  lastError: null,
});

if (typeof localStorage !== "undefined") {
  agentState.subscribe((state) => {
    try {
      localStorage.setItem(
        AGENT_PREFS_KEY,
        JSON.stringify({
          mode: state.mode,
          paused: state.paused,
          harnessUi: state.harnessUi,
        }),
      );
    } catch {
      // best-effort
    }
    saveLedger(state.ledger, localStorage);
  });
}

export function setAgentMode(mode: AgentMode): void {
  agentState.update((state) => ({ ...state, mode }));
}

export function setAgentPaused(paused: boolean): void {
  agentState.update((state) => ({ ...state, paused }));
}

export function setHarnessUi(harnessUi: boolean): void {
  agentState.update((state) => ({ ...state, harnessUi }));
}

export function setProposals(proposals: AgentProposal[]): void {
  agentState.update((state) => ({ ...state, proposals }));
}

export function updateProposal(
  id: string,
  patch: Partial<AgentProposal>,
): void {
  agentState.update((state) => ({
    ...state,
    proposals: state.proposals.map((proposal) =>
      proposal.id === id ? { ...proposal, ...patch } : proposal,
    ),
  }));
}

export function clearFinishedProposals(): void {
  agentState.update((state) => ({
    ...state,
    proposals: state.proposals.filter(
      (proposal) =>
        proposal.status === "pending" || proposal.status === "running",
    ),
  }));
}

export function recordLedger(
  entry: Omit<LedgerEntry, "id"> & { id?: string },
): void {
  agentState.update((state) => {
    const id = entry.id ?? makeLedgerId(entry.ts, state.ledger.length);
    const next = appendLedger(state.ledger, { ...entry, id });
    return { ...state, ledger: next };
  });
}

export function getAgentPolicy(): {
  mode: AgentMode;
  paused: boolean;
  rules: PermissionRule[];
} {
  const state = get(agentState);
  return { mode: state.mode, paused: state.paused, rules: state.rules };
}
