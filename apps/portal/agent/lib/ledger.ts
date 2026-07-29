import { defineState } from "eve/context";

export type AgentLedgerEntry = {
  id: string;
  at: string;
  operation: string;
  summary: string;
  signatures: string[];
};

export const transactionLedger = defineState<AgentLedgerEntry[]>(
  "harness.transaction-ledger.v1",
  () => [],
);

export function appendTransaction(entry: AgentLedgerEntry): void {
  transactionLedger.update((current) => [...current.slice(-99), entry]);
}
