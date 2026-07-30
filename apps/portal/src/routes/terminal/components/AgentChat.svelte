<script lang="ts">
  import { browser } from "$app/environment";
  import {
    type EveDynamicToolPart,
    type EveMessagePart,
  } from "eve/svelte";
  import { closeChat } from "$lib/chat";
  import { createAgentConversation } from "$lib/agent/conversation.svelte";
  import { AGENT_MODE_LABEL, type AgentMode } from "$lib/agent/modes";
  import { agentState, setAgentMode, setAgentPaused } from "$lib/agent/state";
  import {
    projectHarnessTool,
    type WorkstreamCard,
  } from "$lib/agent/workstream";
  import { privyAuth } from "$lib/privy-auth";
  import { projectPriceQuote } from "$lib/agent/price-presentation";
  import MarkdownMessage from "./MarkdownMessage.svelte";
  import PriceQuoteCard from "./PriceQuoteCard.svelte";
  import ToolActivity from "./ToolActivity.svelte";

  let {
    buildContext,
    onRequestAuth,
    accountMode = "paper",
    layout = "dock",
    focusComposerRequest = 0,
    onExpand = undefined,
    onClose = undefined,
  }: {
    buildContext: () => Record<string, unknown>;
    onRequestAuth: () => void;
    accountMode?: "live" | "paper";
    layout?: "dock" | "page";
    focusComposerRequest?: number;
    onExpand?: () => void;
    onClose?: () => void;
  } = $props();

  let draft = $state("");
  let scrollEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);
  let handledFocusComposerRequest = 0;
  const agentModes: AgentMode[] = ["observe", "ask", "auto"];
  const conversation = createAgentConversation({
    accountMode: () => accountMode,
    buildContext: () => buildContext(),
    storage: browser ? localStorage : undefined,
  });

  const agentWorking = $derived(conversation.working);
  const busy = $derived(conversation.busy);
  const pendingRequests = $derived(conversation.pendingRequests);
  const hasActiveTool = $derived(
    conversation.messages
      .flatMap((message) => message.parts.filter(isDynamicToolPart))
      .some((part) =>
        ["pending", "running", "waiting"].includes(projectPart(part).status),
      ),
  );

  $effect(() => {
    if (!scrollEl) return;
    void conversation.messages.length;
    void conversation.status;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  });

  $effect(() => {
    if (
      focusComposerRequest <= handledFocusComposerRequest ||
      !inputEl ||
      !$privyAuth.authenticated ||
      busy
    ) {
      return;
    }
    handledFocusComposerRequest = focusComposerRequest;
    inputEl.focus();
  });

  function sendMessage(value: string): void {
    const text = value.trim();
    if (!text || busy) return;
    draft = "";
    void conversation.send(text);
    inputEl?.focus();
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    sendMessage(inputEl?.value ?? draft);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    (event.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
  }

  function isDynamicToolPart(part: EveMessagePart): part is EveDynamicToolPart {
    return part.type === "dynamic-tool";
  }

  function partText(part: EveMessagePart): string {
    if (part.type === "text") return part.text;
    return "";
  }

  function projectPart(part: EveDynamicToolPart): WorkstreamCard {
    const paperReceipt = conversation.paperReceipt(part.toolCallId);
    return projectHarnessTool({
      toolName: part.toolName,
      state: part.state,
      input: part.input,
      output: paperReceipt
        ? {
            presentation: {
              schema: "harness.presentation.v1",
              kind: "receipt",
              title: paperReceipt.ok
                ? "Paper action confirmed"
                : "Paper action failed",
              summary: paperReceipt.message,
              status: paperReceipt.ok ? "success" : "failed",
            },
          }
        : part.output,
      errorText: part.errorText,
      approvalPending: Boolean(part.toolMetadata?.eve?.inputRequest),
    });
  }

  function messageToolParts(
    parts: readonly EveMessagePart[],
  ): EveDynamicToolPart[] {
    return parts.filter(isDynamicToolPart);
  }

  function isFirstToolPart(
    parts: readonly EveMessagePart[],
    part: EveDynamicToolPart,
  ): boolean {
    return messageToolParts(parts)[0]?.toolCallId === part.toolCallId;
  }

  function toolActivityItems(parts: readonly EveMessagePart[]) {
    return messageToolParts(parts).map((part) => ({
      id: part.toolCallId,
      toolName: part.toolName,
      card: projectPart(part),
      approvalPending: Boolean(part.toolMetadata?.eve?.inputRequest),
    }));
  }

  function answerTool(
    parts: readonly EveMessagePart[],
    toolCallId: string,
    approved: boolean,
  ): void {
    const part = messageToolParts(parts).find(
      (candidate) => candidate.toolCallId === toolCallId,
    );
    if (part) answerPart(part, approved);
  }

  function answerPart(part: EveDynamicToolPart, approved: boolean): void {
    const request = part.toolMetadata?.eve?.inputRequest;
    if (request) void conversation.respond(request.requestId, approved);
  }

  function resetSession(): void {
    conversation.reset();
  }

  function handleExpand(): void {
    conversation.persist();
    onExpand?.();
  }

  function handleClose(): void {
    conversation.persist();
    if (onClose) onClose();
    else closeChat();
  }
</script>

<div
  class="agent-chat"
  class:layout-dock={layout === "dock"}
  class:layout-page={layout === "page"}
  role="complementary"
  aria-label="Agent chat"
>
  <header class="agent-head">
    <div class="agent-head-left">
      <div class="agent-title-row">
        <span class="agent-title">Agent</span>
        <span class="tag durable">
          DURABLE{pendingRequests.length ? ` · ${pendingRequests.length}` : ""}
        </span>
        {#if $agentState.paused}
          <span class="tag pause" title="Money-PAUSE engaged">PAUSE</span>
        {/if}
        {#if accountMode === "paper"}
          <span class="tag paper">PAPER</span>
        {/if}
      </div>
      <div class="picker" role="radiogroup" aria-label="Approval mode">
        {#each agentModes as mode (mode)}
          <button
            class:active={$agentState.mode === mode}
            class:auto={mode === "auto"}
            type="button"
            aria-pressed={$agentState.mode === mode}
            title={mode === "auto"
              ? "Full auto-approve"
              : mode === "observe"
                ? "Read-only"
                : "Ask before money actions"}
            onclick={() => setAgentMode(mode)}
          >
            {AGENT_MODE_LABEL[mode]}
          </button>
        {/each}
      </div>
    </div>
    <div class="agent-head-right">
      <button
        class="ghost"
        class:pause-on={$agentState.paused}
        type="button"
        title="Money-PAUSE"
        onclick={() => setAgentPaused(!$agentState.paused)}
      >
        {$agentState.paused ? "Resume" : "Pause"}
      </button>
      <button class="ghost" type="button" onclick={resetSession} title="New durable session">
        New
      </button>
      {#if layout === "dock" && onExpand}
        <button class="ghost" type="button" onclick={handleExpand} title="Full page">
          Expand
        </button>
      {/if}
      {#if layout === "dock"}
        <button class="ghost" type="button" onclick={handleClose}>Close</button>
      {/if}
    </div>
  </header>

  <div class="agent-scroll" bind:this={scrollEl}>
    <div class="agent-thread">
      {#if conversation.messages.length === 0 && conversation.status === "ready"}
        <div class="agent-empty">
          <h2>Your persistent trading agent</h2>
          <p>
            {$agentState.mode === "auto"
              ? "Auto mode — server-approved trades continue durably."
              : $agentState.mode === "observe"
                ? "Observe — research only, no orders."
                : "Ask mode — every transaction waits for your approval."}
          </p>
          <ul>
            <li>show my wallet address and balance</li>
            <li>long SOL $50 @ 3x market</li>
            <li>show my live positions and open orders</li>
            <li>move stop to break-even on SOL</li>
          </ul>
        </div>
      {/if}

      {#each conversation.messages as message, index (index)}
        <div class="msg {message.role}">
          {#each message.parts as part}
            {#if part.type === "text" && partText(part)}
              {#if message.role === "assistant"}
                <MarkdownMessage source={partText(part)} />
              {:else}
                <span>{partText(part)}</span>
              {/if}
            {:else if isDynamicToolPart(part)}
              {#if isFirstToolPart(message.parts, part)}
                <ToolActivity
                  items={toolActivityItems(message.parts)}
                  onAnswer={(toolCallId, approved) =>
                    answerTool(
                      message.parts,
                      toolCallId,
                      approved,
                    )}
                />
              {/if}
              {@const quote = projectPriceQuote({
                toolName: part.toolName,
                state: part.state,
                output: part.output,
              })}
              {#if quote}
                <PriceQuoteCard {quote} {layout} />
              {/if}
            {/if}
          {/each}
        </div>
      {/each}

      {#if agentWorking && !hasActiveTool}
        <div class="thinking" aria-live="polite">
          <i aria-hidden="true"></i>
          <span>Thinking</span>
        </div>
      {/if}

      {#if conversation.reconnecting}
        <div class="state" aria-live="polite">
          <p>Reconnecting this conversation…</p>
        </div>
      {:else if conversation.recoveryError}
        <div class="state error">
          <p>Conversation recovery failed. Start a new session before sending.</p>
        </div>
      {:else if $privyAuth.status === "loading"}
        <div class="state">
          <p>Restoring your session…</p>
        </div>
      {:else if !$privyAuth.authenticated}
        <div class="state">
          <p>Sign in to talk to the agent.</p>
          <button class="primary" type="button" onclick={onRequestAuth}>
            Sign in
          </button>
        </div>
      {:else if conversation.status === "error"}
        <p class="state error">{conversation.error?.message ?? "agent-transport-error"}</p>
      {/if}
    </div>
  </div>

  <form class="composer" onsubmit={submit}>
    <div class="composer-shell">
      {#if $agentState.paused}
        <p class="money-paused">Money actions paused · research remains available</p>
      {/if}
      <label class="sr-only" for="agent-input">Message the agent</label>
      <textarea
        id="agent-input"
        class="composer-input"
        bind:this={inputEl}
        bind:value={draft}
        rows={layout === "page" ? 3 : 2}
        placeholder="e.g. long SOL $50 @ 3x market…"
        disabled={busy || !$privyAuth.authenticated}
        onkeydown={onKeydown}
      ></textarea>
      <div class="composer-bar">
        <span class="composer-hint">Enter to send · Shift+Enter newline</span>
        <button
          class="secondary"
          type="submit"
          disabled={busy || !$privyAuth.authenticated || draft.trim().length === 0}
        >
          Send
        </button>
      </div>
    </div>
  </form>
</div>

<style>
  .agent-chat {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface);
    color: var(--ink);
  }

  .layout-dock {
    /* Full height under the topbar and above the fixed status line so the
       composer is never clipped by the bottom nav. */
    position: fixed;
    right: 0;
    top: var(--topbar-h, 3rem);
    bottom: var(--status-h, 1.9rem);
    width: var(--agent-dock-w, min(42vw, 28rem));
    height: auto;
    border-left: 1px solid var(--line);
    z-index: 25;
  }

  .layout-page {
    flex: 1;
    width: 100%;
    height: auto;
    overflow: hidden;
    border: 0;
  }

  .agent-head {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.9rem;
    border-bottom: 1px solid var(--line-soft);
    /* Avoid reflow when mode/model pills toggle active styles. */
    min-height: 2.75rem;
  }

  .layout-page .agent-head {
    padding: 0.85rem 1.25rem;
    min-height: 3.1rem;
  }

  .layout-dock .agent-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "title actions"
      "modes modes";
    align-items: center;
    gap: 0.45rem;
    padding: 0.55rem 0.7rem;
  }

  .layout-dock .agent-head-left {
    display: contents;
  }

  .layout-dock .agent-title-row {
    grid-area: title;
    min-width: 0;
  }

  .layout-dock .picker {
    grid-area: modes;
    width: 100%;
  }

  .layout-dock .picker button {
    flex: 1 1 0;
    min-width: 0;
  }

  .layout-dock .agent-head-right {
    grid-area: actions;
  }

  .layout-dock .agent-head-right .ghost {
    min-width: 0;
  }

  .agent-head-left,
  .agent-head-right {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  .agent-title-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .agent-title {
    color: var(--accent);
    font-size: 0.62rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .tag {
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.1rem 0.28rem;
    border: 1px solid var(--line-soft);
  }

  .tag.pause {
    color: var(--red);
    border-color: var(--red);
  }

  .tag.paper {
    color: var(--amber);
  }

  .tag.durable {
    color: var(--up);
  }

  .picker {
    display: inline-flex;
    flex: 0 0 auto;
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
  }

  .picker button {
    box-sizing: border-box;
    color: var(--muted);
    font: inherit;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    /* Equal slots — OBSERVE is the longest label; prevents shift on mode change. */
    min-width: 4.75rem;
    padding: 0.22rem 0.35rem;
    border: 0;
    border-right: 1px solid var(--line-soft);
    background: transparent;
    cursor: pointer;
    text-align: center;
  }

  .picker button:last-child {
    border-right: 0;
  }

  .picker button.active {
    color: var(--accent);
    background: var(--surface);
  }

  .picker button.auto.active {
    color: var(--up);
  }

  .ghost {
    box-sizing: border-box;
    color: var(--muted);
    font: inherit;
    font-size: 0.7rem;
    font-weight: 600;
    /* Pause / Resume same width so toggling PAUSE doesn't nudge the row. */
    min-width: 4.25rem;
    padding: 0.28rem 0.45rem;
    border: 1px solid var(--line-soft);
    background: transparent;
    cursor: pointer;
    text-align: center;
  }

  .ghost:hover {
    color: var(--ink);
  }

  .ghost.pause-on {
    color: var(--red);
  }

  .agent-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .agent-thread {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.85rem;
    max-width: 100%;
  }

  .layout-page .agent-thread {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.25rem 1.5rem 2rem;
    width: 100%;
  }

  .agent-empty {
    margin: 2.5rem auto;
    text-align: center;
    color: var(--muted);
    max-width: 22rem;
  }

  .agent-empty h2 {
    margin: 0 0 0.5rem;
    color: var(--ink);
    font-size: 1.05rem;
    font-weight: 700;
  }

  .agent-empty p {
    margin: 0 0 1rem;
    font-size: 0.82rem;
    line-height: 1.45;
    /* Mode copy lengths differ — lock height so Observe→Ask doesn't jump. */
    min-height: 2.6em;
  }

  .agent-empty ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.35rem;
  }

  .agent-empty li {
    font-size: 0.76rem;
    color: var(--faint);
    border: 1px solid var(--line-soft);
    padding: 0.4rem 0.55rem;
    text-align: left;
  }

  .msg {
    font-size: 0.88rem;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .layout-page .msg {
    font-size: 0.95rem;
    line-height: 1.55;
  }

  .msg.user {
    align-self: flex-end;
    max-width: 85%;
    padding: 0.55rem 0.7rem;
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
  }

  .msg.assistant {
    display: grid;
    gap: 0.48rem;
    border-left: 2px solid var(--accent);
    padding-left: 0.65rem;
  }

  .money-paused {
    margin: 0;
    padding: 0.35rem 0.65rem;
    border-bottom: 1px solid var(--line-soft);
    color: var(--red);
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .thinking {
    display: flex;
    align-items: center;
    gap: 0.38rem;
    min-height: 1.65rem;
    color: var(--faint);
    font-size: 0.69rem;
  }

  .thinking i {
    display: block;
    box-sizing: border-box;
    width: 0.65rem;
    height: 0.65rem;
    border: 1px solid var(--line-soft);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .state {
    margin: 1rem auto;
    text-align: center;
    color: var(--muted);
    font-size: 0.82rem;
  }

  .state.error {
    color: var(--red);
  }

  .composer {
    flex: 0 0 auto;
    padding: 0.7rem 0.9rem 0.85rem;
    border-top: 1px solid var(--line-soft);
    background: var(--surface);
  }

  .composer-shell {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 100%;
  }

  .layout-page .composer {
    position: sticky;
    z-index: 3;
    bottom: 0;
    width: 100%;
    padding: 0.75rem 1.5rem max(1rem, env(safe-area-inset-bottom));
    border-top: 1px solid var(--line-soft);
    background: var(--surface);
  }

  .layout-page .composer-shell {
    max-width: 48rem;
    margin: 0 auto;
  }

  .composer-input {
    resize: none;
    width: 100%;
    color: var(--ink);
    font: inherit;
    font-size: 0.88rem;
    line-height: 1.45;
    padding: 0.65rem 0.75rem;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }

  .layout-page .composer-input {
    font-size: 0.95rem;
    min-height: 5rem;
  }

  .composer-input:focus {
    border-color: var(--accent);
    outline: 1px solid var(--accent);
  }

  .composer-input::placeholder {
    color: var(--faint);
  }

  .composer-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .composer-hint {
    font-size: 0.65rem;
    color: var(--faint);
  }

  /* Local button skins — full page may not load terminal.css utilities. */
  .primary,
  .secondary {
    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.32rem 0.55rem;
    cursor: pointer;
    border: 1px solid var(--line);
  }

  .primary {
    color: var(--accent-contrast);
    background: var(--accent);
    border-color: var(--accent);
  }

  .secondary {
    color: var(--ink);
    background: var(--surface-2);
  }

  .secondary:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 1100px) {
    .layout-dock {
      /* Narrow: full-width sheet under topbar, still above status line. */
      position: fixed;
      right: 0;
      left: 0;
      top: var(--topbar-h, 3rem);
      bottom: var(--status-h, 1.9rem);
      width: auto;
      height: auto;
      z-index: 30;
      border-left: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .thinking i {
      animation: none;
    }
  }
</style>
