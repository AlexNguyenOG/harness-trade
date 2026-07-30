export interface AgentThreadStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AgentThreadSnapshot {
  session: unknown;
  events: readonly unknown[];
  paperActionRuns?: readonly string[];
  paperActionReceipts?: Record<string, AgentPaperActionReceipt>;
}

export interface AgentPaperActionReceipt {
  ok: boolean;
  message: string;
}

const THREAD_KEY = "harness.eve.thread.v2";
const LEGACY_SESSION_KEY = "harness.eve.session.v1";
const LEGACY_EVENTS_KEY = "harness.eve.events.v1";

export function loadAgentThread(
  storage: AgentThreadStorage,
): AgentThreadSnapshot | null {
  const current = readJson(storage, THREAD_KEY);
  if (isThreadSnapshot(current)) {
    return {
      session: current.session,
      events: current.events,
      ...(Array.isArray(current.paperActionRuns)
        ? { paperActionRuns: current.paperActionRuns }
        : {}),
      ...(isReceiptMap(current.paperActionReceipts)
        ? { paperActionReceipts: current.paperActionReceipts }
        : {}),
    };
  }

  const session = readJson(storage, LEGACY_SESSION_KEY);
  const events = readJson(storage, LEGACY_EVENTS_KEY);
  return session !== null && Array.isArray(events) ? { session, events } : null;
}

function readJson(storage: AgentThreadStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function saveAgentThread(
  storage: AgentThreadStorage,
  thread: AgentThreadSnapshot,
): void {
  storage.setItem(
    THREAD_KEY,
    JSON.stringify({
      version: 2,
      session: thread.session,
      events: thread.events,
      paperActionRuns: thread.paperActionRuns,
      paperActionReceipts: thread.paperActionReceipts,
    }),
  );
}

function isReceiptMap(
  value: unknown,
): value is Record<string, AgentPaperActionReceipt> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (receipt) =>
      typeof receipt === "object" &&
      receipt !== null &&
      "ok" in receipt &&
      typeof receipt.ok === "boolean" &&
      "message" in receipt &&
      typeof receipt.message === "string",
  );
}

export function clearAgentThread(storage: AgentThreadStorage): void {
  storage.removeItem(THREAD_KEY);
  storage.removeItem(LEGACY_SESSION_KEY);
  storage.removeItem(LEGACY_EVENTS_KEY);
}

function isThreadSnapshot(value: unknown): value is AgentThreadSnapshot {
  return (
    typeof value === "object" &&
    value !== null &&
    "session" in value &&
    "events" in value &&
    Array.isArray(value.events)
  );
}
