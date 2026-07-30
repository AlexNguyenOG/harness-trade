import { describe, expect, test } from "bun:test";
import {
  type AgentThreadStorage,
  clearAgentThread,
  loadAgentThread,
  saveAgentThread,
} from "./thread-cache";

function memoryStorage(): AgentThreadStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("agent thread cache", () => {
  test("restores the exact EVE thread saved before changing views", () => {
    const storage = memoryStorage();
    const thread = {
      session: { sessionId: "eve-session-42", cursor: "event-7" },
      events: [
        { type: "user-message", id: "event-6", text: "Long SOL in paper mode" },
        { type: "assistant-message", id: "event-7", text: "Plan ready" },
      ],
    };

    saveAgentThread(storage, thread);

    expect(loadAgentThread(storage)).toEqual(thread);
  });

  test("restores conversations saved by the previous two-key cache", () => {
    const storage = memoryStorage();
    const session = { sessionId: "existing-session", cursor: "event-2" };
    const events = [{ type: "assistant-message", id: "event-2" }];
    storage.setItem("harness.eve.session.v1", JSON.stringify(session));
    storage.setItem("harness.eve.events.v1", JSON.stringify(events));

    expect(loadAgentThread(storage)).toEqual({ session, events });
  });

  test("new thread clears both current and legacy conversations", () => {
    const storage = memoryStorage();
    saveAgentThread(storage, { session: { sessionId: "new" }, events: [] });
    storage.setItem(
      "harness.eve.session.v1",
      JSON.stringify({ sessionId: "old" }),
    );
    storage.setItem("harness.eve.events.v1", "[]");

    clearAgentThread(storage);

    expect(loadAgentThread(storage)).toBeNull();
  });
});
