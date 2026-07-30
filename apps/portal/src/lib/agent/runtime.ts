// Run proposals against policy + host. Used after chat returns actions.

import { get } from "svelte/store";
import { executeAgentAction } from "./host";
import type { AgentProposal } from "./proposals";
import { partitionProposals } from "./proposals";
import {
  agentState,
  getAgentPolicy,
  recordLedger,
  setAgentPaused,
  updateProposal,
} from "./state";

export type RunOptions = {
  accountMode: "live" | "paper";
  /** When true, only run allow-verdict items (auto path). */
  autoOnly?: boolean;
  /** Specific proposal ids to run (Accept click). */
  onlyIds?: readonly string[];
};

export async function runProposals(
  proposals: readonly AgentProposal[],
  options: RunOptions,
): Promise<void> {
  const policy = getAgentPolicy();
  const { auto, needsAccept, denied } = partitionProposals(proposals);

  for (const proposal of denied) {
    updateProposal(proposal.id, {
      status: "skipped",
      error: proposal.verdict.reason,
    });
    recordLedger({
      ts: Date.now(),
      action: proposal.name,
      summary: proposal.summary,
      decision: "deny",
      reason: proposal.verdict.reason,
      mode: policy.mode,
      accountMode: options.accountMode,
    });
  }

  const queue: AgentProposal[] = [];
  if (options.onlyIds) {
    const idSet = new Set(options.onlyIds);
    for (const proposal of proposals) {
      if (idSet.has(proposal.id) && proposal.verdict.decision !== "deny") {
        queue.push(proposal);
      }
    }
  } else if (options.autoOnly) {
    queue.push(...auto);
  } else {
    queue.push(...auto);
    // needsAccept wait for user — do not run here
    for (const proposal of needsAccept) {
      updateProposal(proposal.id, { status: "pending" });
    }
  }

  for (const proposal of queue) {
    updateProposal(proposal.id, { status: "running" });
    // Pause tool mutates agent state before host
    if (proposal.name === "set_agent_pause") {
      const paused = proposal.args.paused === true;
      setAgentPaused(paused);
    }
    const result = await executeAgentAction(proposal.name, proposal.args);
    updateProposal(proposal.id, {
      status: result.outcome === "confirmed" ? "done" : "failed",
      error: result.outcome === "confirmed" ? undefined : result.message,
    });
    recordLedger({
      ts: Date.now(),
      action: proposal.name,
      summary: proposal.summary,
      decision: options.onlyIds ? "accepted" : "auto",
      reason: proposal.verdict.reason,
      mode: get(agentState).mode,
      accountMode: options.accountMode,
      result: result.message,
    });
  }
}

export async function acceptProposal(
  id: string,
  accountMode: "live" | "paper",
): Promise<void> {
  const state = get(agentState);
  const proposal = state.proposals.find((row) => row.id === id);
  if (!proposal) return;
  await runProposals([proposal], { accountMode, onlyIds: [id] });
}

export async function rejectProposal(
  id: string,
  accountMode: "live" | "paper",
): Promise<void> {
  const state = get(agentState);
  const proposal = state.proposals.find((row) => row.id === id);
  if (!proposal) return;
  updateProposal(id, { status: "rejected" });
  recordLedger({
    ts: Date.now(),
    action: proposal.name,
    summary: proposal.summary,
    decision: "rejected",
    reason: "user rejected",
    mode: state.mode,
    accountMode,
  });
}

export async function acceptAllPending(
  accountMode: "live" | "paper",
): Promise<void> {
  const state = get(agentState);
  const ids = state.proposals
    .filter(
      (proposal) =>
        proposal.status === "pending" && proposal.verdict.decision === "ask",
    )
    .map((proposal) => proposal.id);
  if (ids.length === 0) return;
  await runProposals(state.proposals, { accountMode, onlyIds: ids });
}
