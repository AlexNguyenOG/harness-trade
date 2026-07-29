<script lang="ts">
  // Shared agent chat surface — dock (Cursor side) or full page (pre-v3 Chat).
  import {
    chatState,
    closeChat,
    sendChatMessage,
    setModelChoice,
  } from "$lib/chat";
  import { PRO_LABEL, type ChatModelChoice } from "$lib/chat-models";
  import { AGENT_MODE_LABEL, type AgentMode } from "$lib/agent/modes";
  import {
    acceptAllPending,
    acceptProposal,
    rejectProposal,
  } from "$lib/agent/runtime";
  import {
    agentState,
    setAgentMode,
    setAgentPaused,
  } from "$lib/agent/state";

  let {
    buildContext,
    onRequestAuth,
    accountMode = "paper",
    layout = "dock",
    onExpand = undefined,
    onClose = undefined,
  }: {
    buildContext: () => Record<string, unknown>;
    onRequestAuth: () => void;
    accountMode?: "live" | "paper";
    layout?: "dock" | "page";
    onExpand?: () => void;
    onClose?: () => void;
  } = $props();

  let draft = $state("");
  let scrollEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLTextAreaElement | null = $state(null);

  const modelChoices: { value: ChatModelChoice; label: string }[] = [
    { value: "auto", label: "Auto" },
    { value: "free", label: "Free" },
    { value: "pro", label: "Pro" },
  ];
  const agentModes: AgentMode[] = ["observe", "ask", "auto"];

  const pendingAsk = $derived(
    $agentState.proposals.filter(
      (proposal) =>
        proposal.status === "pending" && proposal.verdict.decision === "ask",
    ),
  );

  const activeProposals = $derived(
    $agentState.proposals.filter(
      (proposal) =>
        proposal.status === "pending" ||
        proposal.status === "running" ||
        proposal.status === "failed" ||
        proposal.status === "done" ||
        proposal.status === "skipped" ||
        proposal.status === "rejected",
    ),
  );

  $effect(() => {
    if (!scrollEl) return;
    void $chatState.messages.length;
    void $chatState.phase;
    void $agentState.proposals.length;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const text = draft;
    draft = "";
    void sendChatMessage(text, buildContext(), { accountMode });
    inputEl?.focus();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if ($chatState.phase === "waiting" || draft.trim().length === 0) return;
      const text = draft;
      draft = "";
      void sendChatMessage(text, buildContext(), { accountMode });
    }
  }

  function handleClose(): void {
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
      <div class="picker model" role="radiogroup" aria-label="Chat model">
        {#each modelChoices as choice (choice.value)}
          <button
            class:active={$chatState.modelChoice === choice.value}
            type="button"
            aria-pressed={$chatState.modelChoice === choice.value}
            onclick={() => setModelChoice(choice.value)}
          >
            {choice.label}
          </button>
        {/each}
      </div>
      <button
        class="ghost"
        class:pause-on={$agentState.paused}
        type="button"
        title="Money-PAUSE"
        onclick={() => setAgentPaused(!$agentState.paused)}
      >
        {$agentState.paused ? "Resume" : "Pause"}
      </button>
      {#if layout === "dock" && onExpand}
        <button class="ghost" type="button" onclick={onExpand} title="Full page">
          Expand
        </button>
      {/if}
      {#if layout === "dock"}
        <button class="ghost" type="button" onclick={handleClose}>Close</button>
      {/if}
    </div>
  </header>

  {#if pendingAsk.length > 0}
    <div class="agent-banner">
      <span>{pendingAsk.length} action(s) need approval</span>
      <button
        class="secondary"
        type="button"
        onclick={() => void acceptAllPending(accountMode)}
      >
        Accept all
      </button>
    </div>
  {/if}

  <div class="agent-scroll" bind:this={scrollEl}>
    <div class="agent-thread">
      {#if $chatState.messages.length === 0 && $chatState.phase === "idle" && activeProposals.length === 0}
        <div class="agent-empty">
          <h2>Chat with the desk</h2>
          <p>
            {$agentState.mode === "auto"
              ? "Auto mode — allowed trades run immediately."
              : $agentState.mode === "observe"
                ? "Observe — research only, no orders."
                : "Ask mode — review each money action before it runs."}
          </p>
          <ul>
            <li>long SOL $50 @ 3x market</li>
            <li>what’s my paper book?</li>
            <li>move stop to break-even on SOL</li>
          </ul>
        </div>
      {/if}

      {#each $chatState.messages as message, index (index)}
        <div class="msg {message.role}">
          {#if message.role === "assistant" && message.proLabel}
            <span class="pro-tag">{PRO_LABEL}</span>
          {/if}
          {message.content}
        </div>
      {/each}

      {#each activeProposals as proposal (proposal.id)}
        <div
          class="proposal"
          class:ask={proposal.verdict.decision === "ask"}
          class:done={proposal.status === "done"}
          class:failed={proposal.status === "failed" ||
            proposal.status === "skipped"}
          class:running={proposal.status === "running"}
        >
          <div class="proposal-head">
            <span>{proposal.risk}</span>
            <span>{proposal.status}</span>
          </div>
          <p class="proposal-summary">{proposal.summary}</p>
          <p class="proposal-reason">{proposal.verdict.reason}</p>
          {#if proposal.error}
            <p class="proposal-error">{proposal.error}</p>
          {/if}
          {#if proposal.status === "pending" && proposal.verdict.decision === "ask"}
            <div class="proposal-actions">
              <button
                class="primary"
                type="button"
                onclick={() => void acceptProposal(proposal.id, accountMode)}
              >
                Accept
              </button>
              <button
                class="ghost"
                type="button"
                onclick={() => void rejectProposal(proposal.id, accountMode)}
              >
                Reject
              </button>
            </div>
          {/if}
        </div>
      {/each}

      {#if $chatState.phase === "waiting"}
        <div class="skeleton" aria-hidden="true">
          <i></i>
          <i></i>
        </div>
      {/if}

      {#if $chatState.phase === "auth"}
        <div class="state">
          <p>Sign in to talk to the agent.</p>
          <button class="primary" type="button" onclick={onRequestAuth}>
            Sign in
          </button>
        </div>
      {:else if $chatState.phase === "limit"}
        <p class="state">Daily limit reached — resets at UTC midnight.</p>
      {:else if $chatState.phase === "error"}
        <p class="state error">{$chatState.error ?? "chat-error"}</p>
      {/if}
    </div>
  </div>

  <form class="composer" onsubmit={submit}>
    <label class="sr-only" for="agent-input">Message the agent</label>
    <textarea
      id="agent-input"
      class="composer-input"
      bind:this={inputEl}
      bind:value={draft}
      rows={layout === "page" ? 3 : 2}
      placeholder="e.g. long SOL $50 @ 3x market…"
      disabled={$chatState.phase === "waiting"}
      onkeydown={onKeydown}
    ></textarea>
    <div class="composer-bar">
      <span class="composer-hint">Enter to send · Shift+Enter newline</span>
      <button
        class="secondary"
        type="submit"
        disabled={$chatState.phase === "waiting" || draft.trim().length === 0}
      >
        Send
      </button>
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
    width: var(--agent-dock-w, min(42vw, 28rem));
    height: calc(
      100dvh - var(--topbar-h, 3rem) - var(--status-h, 1.9rem)
    );
    border-left: 1px solid var(--line);
    z-index: 25;
  }

  .layout-page {
    flex: 1;
    width: 100%;
    height: 100%;
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

  .picker.model button {
    min-width: 3.1rem;
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

  .agent-banner {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.9rem;
    border-bottom: 1px solid var(--line-soft);
    background: var(--surface-2);
    font-size: 0.72rem;
    color: var(--amber);
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
    border-left: 2px solid var(--accent);
    padding-left: 0.65rem;
  }

  .pro-tag {
    display: block;
    width: fit-content;
    margin-bottom: 0.25rem;
    color: var(--accent);
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .proposal {
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
    padding: 0.55rem 0.65rem;
    display: grid;
    gap: 0.3rem;
  }

  .proposal.ask {
    border-color: var(--amber);
  }
  .proposal.done {
    border-color: var(--up);
  }
  .proposal.failed {
    border-color: var(--red);
  }
  .proposal.running {
    border-color: var(--accent);
  }

  .proposal-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .proposal-summary {
    margin: 0;
    font-size: 0.82rem;
  }

  .proposal-reason,
  .proposal-error {
    margin: 0;
    font-size: 0.7rem;
    color: var(--muted);
  }

  .proposal-error {
    color: var(--red);
  }

  .proposal-actions {
    display: flex;
    gap: 0.35rem;
  }

  .skeleton {
    border-left: 2px solid var(--accent);
    padding-left: 0.5rem;
    display: grid;
    gap: 0.45rem;
  }

  .skeleton i {
    display: block;
    height: 0.5rem;
    background-color: var(--surface-2);
    background-image: linear-gradient(
      90deg,
      transparent 25%,
      var(--accent-soft) 50%,
      transparent 75%
    );
    background-size: 280% 100%;
    animation: shimmer 2.2s ease-in-out infinite;
  }

  .skeleton i:last-child {
    width: 62%;
  }

  @keyframes shimmer {
    0% {
      background-position: 150% 0;
    }
    100% {
      background-position: -150% 0;
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
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.7rem 0.9rem 0.85rem;
    border-top: 1px solid var(--line-soft);
    background: var(--surface);
  }

  .layout-page .composer {
    max-width: 48rem;
    width: 100%;
    margin: 0 auto;
    padding: 0.85rem 1.5rem 1.25rem;
    border-top: 1px solid var(--line-soft);
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
      width: auto;
      height: calc(
        100dvh - var(--topbar-h, 3rem) - var(--status-h, 1.9rem)
      );
      z-index: 30;
      border-left: none;
    }
  }
</style>
