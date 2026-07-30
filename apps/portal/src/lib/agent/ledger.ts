// Append-only decision ledger for agent actions (Phase 3 groundwork).
// Persisted client-side; never claims on-chain finality.

export type LedgerEntry = {
  id: string;
  ts: number;
  action: string;
  summary: string;
  decision:
    | "allow"
    | "ask"
    | "deny"
    | "accepted"
    | "rejected"
    | "auto"
    | "failed";
  reason: string;
  mode: string;
  accountMode: "live" | "paper";
  result?: string;
};

export const AGENT_LEDGER_KEY = "harness.agent.ledger.v1";
export const AGENT_LEDGER_CAP = 200;

export function appendLedger(
  entries: readonly LedgerEntry[],
  entry: LedgerEntry,
): LedgerEntry[] {
  return [...entries, entry].slice(-AGENT_LEDGER_CAP);
}

export function parseLedger(value: unknown): LedgerEntry[] {
  if (!Array.isArray(value)) return [];
  const out: LedgerEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.ts !== "number") continue;
    if (typeof row.action !== "string" || typeof row.summary !== "string") {
      continue;
    }
    out.push({
      id: row.id,
      ts: row.ts,
      action: row.action,
      summary: row.summary,
      decision: (row.decision as LedgerEntry["decision"]) ?? "allow",
      reason: typeof row.reason === "string" ? row.reason : "",
      mode: typeof row.mode === "string" ? row.mode : "",
      accountMode: row.accountMode === "live" ? "live" : "paper",
      ...(typeof row.result === "string" ? { result: row.result } : {}),
    });
  }
  return out.slice(-AGENT_LEDGER_CAP);
}

export function loadLedger(storage?: Storage | null): LedgerEntry[] {
  if (!storage) return [];
  try {
    return parseLedger(JSON.parse(storage.getItem(AGENT_LEDGER_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function saveLedger(
  entries: readonly LedgerEntry[],
  storage?: Storage | null,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      AGENT_LEDGER_KEY,
      JSON.stringify(entries.slice(-AGENT_LEDGER_CAP)),
    );
  } catch {
    // best-effort
  }
}

export function makeLedgerId(nowMs: number, index: number): string {
  return `led-${nowMs.toString(36)}-${index.toString(36)}`;
}
