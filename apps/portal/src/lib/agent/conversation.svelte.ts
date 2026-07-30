import {
  Client,
  type HandleMessageStreamEvent,
  isCurrentTurnBoundaryEvent,
  type SendTurnPayload,
  type SessionState,
} from "eve/client";
import {
  type EveDynamicToolPart,
  type EveMessagePart,
  useEveAgent,
} from "eve/svelte";
import { onMount } from "svelte";
import { AGENT_ACTION_META, type AgentActionName } from "./actions";
import type { AgentActionExecutor, AgentActionResult } from "./host";
import {
  type AgentThreadSnapshot,
  type AgentThreadStorage,
  clearAgentThread,
  loadAgentThread,
  prepareAgentThreadForResume,
  saveAgentThread,
} from "./thread-cache";

export type AgentConversationOptions = {
  buildClientContext: () => AgentClientContext;
  executePaperAction: AgentActionExecutor;
  headers: () => Promise<Record<string, string>>;
  isPaper: () => boolean;
  storage?: AgentThreadStorage;
};

export type AgentClientContext = NonNullable<SendTurnPayload["clientContext"]>;

export type AgentConversationPart =
  | {
      type: "text";
      text: string;
    }
  | AgentConversationToolPart;

export type AgentConversationToolPart = {
  type: "tool";
  toolCallId: string;
  toolName: string;
  state: string;
  input: unknown;
  output: unknown;
  errorText?: string;
  approvalPending: boolean;
};

export type AgentConversationMessage = {
  role: string;
  parts: AgentConversationPart[];
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
  const messages = $derived(eve.data.messages.map(projectConversationMessage));
  const pendingRequestCount = $derived(
    messages.reduce(
      (count, message) =>
        count +
        message.parts.filter(
          (part) => part.type === "tool" && part.approvalPending,
        ).length,
      0,
    ),
  );

  $effect(() => {
    if (!options.storage) return;
    persistCurrent();
  });

  $effect(() => {
    if (!options.storage || !options.isPaper()) return;
    const parts = eve.data.messages.flatMap((message) =>
      message.parts.filter(isDynamicToolPart),
    );
    for (const part of parts) {
      const action = paperActionFromPart(part);
      if (!action || paperActionRuns.has(part.toolCallId)) continue;
      paperActionRuns.add(part.toolCallId);
      persistCurrent();
      void options
        .executePaperAction(action.name, action.args)
        .then((receipt) => {
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
      headers: options.headers,
      onFinish(snapshot) {
        persistSnapshot(snapshot.session, snapshot.events);
      },
    });
  }

  async function recover(
    thread: AgentThreadSnapshot,
    signal: AbortSignal,
  ): Promise<void> {
    if (!isSessionState(thread.session)) {
      reconnecting = false;
      return;
    }

    const session = new Client({ host: "", headers: options.headers }).session(
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
      clientContext: options.buildClientContext(),
    });
  }

  function respond(requestId: string, approved: boolean): Promise<void> {
    return eve.send({
      inputResponses: [{ requestId, optionId: approved ? "approve" : "deny" }],
    });
  }

  function respondToTool(toolCallId: string, approved: boolean): Promise<void> {
    const requestId = eve.data.messages
      .flatMap((message) => message.parts.filter(isDynamicToolPart))
      .find((part) => part.toolCallId === toolCallId)?.toolMetadata?.eve
      ?.inputRequest?.requestId;
    return requestId ? respond(requestId, approved) : Promise.resolve();
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
      return messages;
    },
    get pendingRequestCount() {
      return pendingRequestCount;
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
    respondToTool,
    send,
  };
}

function projectConversationMessage(message: {
  role: string;
  parts: readonly EveMessagePart[];
}): AgentConversationMessage {
  return {
    role: message.role,
    parts: message.parts.flatMap(projectConversationPart),
  };
}

function projectConversationPart(
  part: EveMessagePart,
): AgentConversationPart[] {
  if (part.type === "text") {
    return [{ type: "text", text: part.text }];
  }
  if (!isDynamicToolPart(part)) return [];
  return [
    {
      type: "tool",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      state: part.state,
      input: part.input,
      output: part.output,
      ...(part.errorText ? { errorText: part.errorText } : {}),
      approvalPending: Boolean(part.toolMetadata?.eve?.inputRequest),
    },
  ];
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
