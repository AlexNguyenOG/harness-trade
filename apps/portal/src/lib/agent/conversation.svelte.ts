import {
  Client,
  type HandleMessageStreamEvent,
  isCurrentTurnBoundaryEvent,
  type SessionState,
} from "eve/client";
import {
  type EveDynamicToolPart,
  type EveMessagePart,
  useEveAgent,
} from "eve/svelte";
import { onMount } from "svelte";
import { getPrivyAccessToken } from "$lib/privy-auth";
import { AGENT_ACTION_META, type AgentActionName } from "./actions";
import { type AgentActionResult, executeAgentAction } from "./host";
import { getAgentPolicy } from "./state";
import {
  type AgentThreadSnapshot,
  type AgentThreadStorage,
  clearAgentThread,
  loadAgentThread,
  prepareAgentThreadForResume,
  saveAgentThread,
} from "./thread-cache";

export type AgentConversationOptions = {
  accountMode: () => "live" | "paper";
  buildContext: () => Record<string, unknown>;
  storage?: AgentThreadStorage;
};

/**
 * Owns the browser side of one durable agent Conversation.
 *
 * Views render its projection and issue commands. EVE transport, cursor
 * recovery, persistence, approval replies, and replay-safe paper Receipts stay
 * behind this interface.
 */
export function createAgentConversation(options: AgentConversationOptions) {
  const cachedThread = options.storage
    ? loadAgentThread(options.storage)
    : null;
  const restoredThread = cachedThread
    ? prepareAgentThreadForResume(cachedThread)
    : null;
  let paperActionReceipts = $state<Record<string, AgentActionResult>>({
    ...(restoredThread?.paperActionReceipts ?? {}),
  });
  const paperActionRuns = new Set<string>(
    restoredThread?.paperActionRuns ??
      Object.keys(restoredThread?.paperActionReceipts ?? {}),
  );
  let reconnecting = $state(isSessionState(restoredThread?.session));
  let recoveryError = $state("");
  let eve = $state.raw(createAgent(restoredThread));

  const working = $derived(
    eve.status === "submitted" || eve.status === "streaming",
  );
  const busy = $derived(reconnecting || recoveryError.length > 0 || working);
  const pendingRequests = $derived(
    eve.data.messages.flatMap((message) =>
      message.parts
        .filter(isDynamicToolPart)
        .map((part) => part.toolMetadata?.eve?.inputRequest)
        .filter((request) => request !== undefined),
    ),
  );

  $effect(() => {
    if (!options.storage) return;
    persistCurrent();
  });

  $effect(() => {
    if (!options.storage || options.accountMode() !== "paper") return;
    const parts = eve.data.messages.flatMap((message) =>
      message.parts.filter(isDynamicToolPart),
    );
    for (const part of parts) {
      const action = paperActionFromPart(part);
      if (!action || paperActionRuns.has(part.toolCallId)) continue;
      paperActionRuns.add(part.toolCallId);
      persistCurrent();
      void executeAgentAction(action.name, action.args).then((receipt) => {
        paperActionReceipts = {
          ...paperActionReceipts,
          [part.toolCallId]: receipt,
        };
        persistCurrent();
      });
    }
  });

  onMount(() => {
    if (!reconnecting || !restoredThread) return;
    const controller = new AbortController();
    void recover(restoredThread, controller.signal);
    return () => controller.abort();
  });

  function createAgent(thread: AgentThreadSnapshot | null) {
    return useEveAgent({
      initialSession: thread?.session as never,
      initialEvents: thread?.events as never,
      headers: resolveHeaders,
      onFinish(snapshot) {
        persistSnapshot(snapshot.session, snapshot.events);
      },
    });
  }

  async function resolveHeaders(): Promise<Record<string, string>> {
    const token = await getPrivyAccessToken();
    const policy = getAgentPolicy();
    return {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "x-harness-agent-mode": policy.mode,
      "x-harness-agent-paused": String(policy.paused),
      "x-harness-account-mode": options.accountMode(),
    };
  }

  function buildClientContext(): NonNullable<
    Parameters<typeof eve.send>[0]["clientContext"]
  > {
    const policy = getAgentPolicy();
    return {
      ...options.buildContext(),
      agentPolicy: {
        mode: policy.mode,
        paused: policy.paused,
        accountMode: options.accountMode(),
      },
    } as NonNullable<Parameters<typeof eve.send>[0]["clientContext"]>;
  }

  async function recover(
    thread: AgentThreadSnapshot,
    signal: AbortSignal,
  ): Promise<void> {
    if (!isSessionState(thread.session)) {
      reconnecting = false;
      return;
    }

    const session = new Client({ host: "", headers: resolveHeaders }).session(
      thread.session,
    );
    const recoveredEvents: HandleMessageStreamEvent[] = [];

    try {
      for await (const event of session.stream({ follow: false, signal })) {
        recoveredEvents.push(event);
      }

      const lastKnownEvent =
        recoveredEvents.at(-1) ??
        (thread.events.at(-1) as HandleMessageStreamEvent | undefined);
      if (
        session.state.sessionId &&
        (!lastKnownEvent || !isCurrentTurnBoundaryEvent(lastKnownEvent))
      ) {
        for await (const event of session.stream({ signal })) {
          recoveredEvents.push(event);
          if (isCurrentTurnBoundaryEvent(event)) break;
        }
      }

      if (signal.aborted) return;
      const recoveredThread = prepareAgentThreadForResume({
        ...thread,
        session: session.state,
        events: [...thread.events, ...recoveredEvents],
      });
      persistSnapshot(recoveredThread.session, recoveredThread.events);
      eve.stop();
      eve = createAgent(recoveredThread);
      reconnecting = false;
    } catch (error) {
      if (signal.aborted) return;
      recoveryError =
        error instanceof Error ? error.message : "conversation-recovery-error";
      reconnecting = false;
    }
  }

  function persistSnapshot(session: unknown, events: readonly unknown[]): void {
    if (!options.storage) return;
    try {
      saveAgentThread(options.storage, {
        session,
        events,
        paperActionRuns: [...paperActionRuns],
        paperActionReceipts,
      });
    } catch {
      // A private browser or exhausted quota should not break the Conversation.
    }
  }

  function persistCurrent(): void {
    persistSnapshot(eve.session, eve.events);
  }

  function send(message: string): Promise<void> {
    return eve.send({
      message,
      clientContext: buildClientContext(),
    });
  }

  function respond(requestId: string, approved: boolean): Promise<void> {
    return eve.send({
      inputResponses: [{ requestId, optionId: approved ? "approve" : "deny" }],
    });
  }

  function reset(): void {
    paperActionRuns.clear();
    paperActionReceipts = {};
    recoveryError = "";
    reconnecting = false;
    eve.reset();
    if (options.storage) clearAgentThread(options.storage);
  }

  return {
    get busy() {
      return busy;
    },
    get error() {
      return eve.error;
    },
    get messages() {
      return eve.data.messages;
    },
    get pendingRequests() {
      return pendingRequests;
    },
    get reconnecting() {
      return reconnecting;
    },
    get recoveryError() {
      return recoveryError;
    },
    get status() {
      return eve.status;
    },
    get working() {
      return working;
    },
    paperReceipt(toolCallId: string) {
      return paperActionReceipts[toolCallId];
    },
    persist: persistCurrent,
    reset,
    respond,
    send,
  };
}

function isDynamicToolPart(part: EveMessagePart): part is EveDynamicToolPart {
  return part.type === "dynamic-tool";
}

function paperActionFromPart(
  part: EveDynamicToolPart,
): { name: AgentActionName; args: Record<string, unknown> } | null {
  if (part.state !== "output-available") return null;
  const output = asRecord(part.output);
  const action = asRecord(output?.paperAction);
  const name = action?.name;
  const args = asRecord(action?.args);
  if (
    typeof name !== "string" ||
    !AGENT_ACTION_META.some((entry) => entry.name === name) ||
    !args
  ) {
    return null;
  }
  return { name: name as AgentActionName, args };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isSessionState(value: unknown): value is SessionState {
  return (
    typeof value === "object" &&
    value !== null &&
    "sessionId" in value &&
    typeof value.sessionId === "string" &&
    "streamIndex" in value &&
    typeof value.streamIndex === "number"
  );
}
