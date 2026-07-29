<script lang="ts">
  // Agent harness dock — Desk chat + approval modes (observe / ask / auto).
  // Summon-only; zero weight when closed (page lazy-mounts on first open).
  import {
    chatState,
    closeChat,
    sendChatMessage,
    setModelChoice,
  } from "$lib/chat";
  import { PRO_LABEL, type ChatModelChoice } from "$lib/chat-models";
  import {
    AGENT_MODE_LABEL,
    type AgentMode,
  } from "$lib/agent/modes";
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
  }: {
    buildContext: () => Record<string, unknown>;
    onRequestAuth: () => void;
    accountMode?: "live" | "paper";
  } = $props();

  let draft = $state("");
  let scrollEl: HTMLDivElement | null = $state(null);

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

  // Pin the conversation to its newest turn whenever the list grows or the
  // phase flips to the waiting skeleton.
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
  }

  function onMode(mode: AgentMode): void {
    setAgentMode(mode);
  }
</script>

<div class="desk-dock" role="complementary" aria-label="Agent desk">
  <header class="desk-head">
    <div class="desk-title-col">
      <div class="desk-title-row">
        <span class="desk-title">Agent</span>
        {#if $agentState.paused}
          <span class="desk-pause-tag" title="Money-PAUSE engaged">PAUSE</span>
        {/if}
        {#if accountMode === "paper"}
          <span class="desk-paper-tag">PAPER</span>
        {/if}
      </div>
      <div class="desk-mode-picker" role="radiogroup" aria-label="Approval mode">
        {#each agentModes as mode (mode)}
          <button
            class:active={$agentState.mode === mode}
            class:auto={mode === "auto"}
            type="button"
            aria-pressed={$agentState.mode === mode}
            title={mode === "auto"
              ? "Full auto-approve — agent executes allowed actions"
              : mode === "observe"
                ? "Read-only — agent cannot trade"
                : "Ask before each money action"}
            onclick={() => onMode(mode)}
          >
            {AGENT_MODE_LABEL[mode]}
          </button>
        {/each}
      </div>
    </div>
    <div class="desk-head-actions">
      <button
        class="ghost"
        class:pause-on={$agentState.paused}
        type="button"
        title="Money-PAUSE kill switch"
        onclick={() => setAgentPaused(!$agentState.paused)}
      >
        {$agentState.paused ? "Resume" : "Pause"}
      </button>
      <button class="ghost" type="button" onclick={closeChat}>Close</button>
    </div>
  </header>

  <div class="desk-subhead">
    <div class="desk-model-picker" role="radiogroup" aria-label="Chat model">
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
    {#if pendingAsk.length > 0}
      <button
        class="secondary desk-accept-all"
        type="button"
        onclick={() => void acceptAllPending(accountMode)}
      >
        Accept all ({pendingAsk.length})
      </button>
    {/if}
  </div>

  <div class="desk-scroll" bind:this={scrollEl}>
    {#if $chatState.messages.length === 0 && $chatState.phase === "idle" && activeProposals.length === 0}
      <div class="desk-empty">
        <p>Agent harness — trade from chat.</p>
        <p class="desk-empty-hint">
          {$agentState.mode === "auto"
            ? "Auto: allowed actions run immediately."
            : $agentState.mode === "observe"
              ? "Observe: research only, no trades."
              : "Ask: review each money action before it runs."}
        </p>
      </div>
    {/if}

    {#each $chatState.messages as message, index (index)}
      <div class="desk-msg {message.role}">
        {#if message.role === "assistant" && message.proLabel}<span
            class="desk-pro-tag">{PRO_LABEL}</span
          >{/if}{message.content}
      </div>
    {/each}

    {#each activeProposals as proposal (proposal.id)}
      <div
        class="desk-proposal"
        class:ask={proposal.verdict.decision === "ask"}
        class:done={proposal.status === "done"}
        class:failed={proposal.status === "failed" || proposal.status === "skipped"}
        class:running={proposal.status === "running"}
      >
        <div class="desk-proposal-head">
          <span class="desk-proposal-risk">{proposal.risk}</span>
          <span class="desk-proposal-status">{proposal.status}</span>
        </div>
        <p class="desk-proposal-summary">{proposal.summary}</p>
        <p class="desk-proposal-reason">{proposal.verdict.reason}</p>
        {#if proposal.error}
          <p class="desk-proposal-error">{proposal.error}</p>
        {/if}
        {#if proposal.status === "pending" && proposal.verdict.decision === "ask"}
          <div class="desk-proposal-actions">
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
      <div class="desk-skeleton" aria-hidden="true">
        <i></i>
        <i></i>
      </div>
    {/if}

    {#if $chatState.phase === "auth"}
      <div class="desk-state">
        <p>Sign in to talk to the agent.</p>
        <button class="primary desk-state-action" type="button" onclick={onRequestAuth}>
          Sign in
        </button>
      </div>
    {:else if $chatState.phase === "limit"}
      <p class="desk-state">Daily limit reached — resets at UTC midnight.</p>
    {:else if $chatState.phase === "error"}
      <p class="desk-state desk-state-error">{$chatState.error ?? "chat-error"}</p>
    {/if}
  </div>

  <form class="desk-form" onsubmit={submit}>
    <label class="desk-input-label" for="desk-input">Message the agent</label>
    <textarea
      id="desk-input"
      class="desk-input"
      bind:value={draft}
      rows="2"
      placeholder={$agentState.mode === "auto"
        ? "e.g. long SOL $100 @ 3x market…"
        : "Message the agent…"}
      disabled={$chatState.phase === "waiting"}
    ></textarea>
    <button
      class="secondary desk-send"
      type="submit"
      disabled={$chatState.phase === "waiting" || draft.trim().length === 0}
    >
      Send
    </button>
  </form>
</div>

<style>
  .desk-dock {
    position: fixed;
    right: 0;
    top: var(--anchor-top, 3rem);
    width: 380px;
    height: calc(100dvh - var(--anchor-top, 3rem));
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--surface);
    border-left: 1px solid var(--line);
    z-index: 15;
  }

  .desk-head {
    flex: 0 0 auto;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.55rem 0.75rem;
    border-bottom: 1px solid var(--line-soft);
  }

  .desk-title-col {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .desk-title-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .desk-title {
    color: var(--accent);
    font-size: 0.6rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  .desk-pause-tag,
  .desk-paper-tag {
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.1rem 0.28rem;
    border: 1px solid var(--line-soft);
  }

  .desk-pause-tag {
    color: var(--red);
    border-color: var(--red);
  }

  .desk-paper-tag {
    color: var(--amber);
  }

  .desk-mode-picker,
  .desk-model-picker {
    display: inline-flex;
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
  }

  .desk-mode-picker button,
  .desk-model-picker button {
    color: var(--muted);
    font: inherit;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 0.22rem 0.35rem;
    border: 0;
    border-right: 1px solid var(--line-soft);
    background: transparent;
    cursor: pointer;
  }

  .desk-mode-picker button:last-child,
  .desk-model-picker button:last-child {
    border-right: 0;
  }

  .desk-mode-picker button.active,
  .desk-model-picker button.active {
    color: var(--accent);
    background: var(--surface);
  }

  .desk-mode-picker button.auto.active {
    color: var(--up);
  }

  .desk-head-actions {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .desk-head-actions .pause-on {
    color: var(--red);
  }

  .desk-subhead {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--line-soft);
  }

  .desk-accept-all {
    font-size: 0.62rem;
    padding: 0.2rem 0.4rem;
  }

  .desk-scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .desk-empty {
    margin: auto;
    color: var(--faint);
    font-size: 0.76rem;
    line-height: 1.45;
    text-align: center;
  }

  .desk-empty p {
    margin: 0;
  }

  .desk-empty-hint {
    margin-top: 0.35rem;
    color: var(--muted);
    font-size: 0.7rem;
  }

  .desk-msg {
    color: var(--ink);
    font-size: 0.8rem;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .desk-pro-tag {
    display: block;
    width: fit-content;
    margin-bottom: 0.25rem;
    color: var(--accent);
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .desk-msg.user {
    align-self: flex-end;
    max-width: 85%;
    padding: 0.45rem 0.6rem;
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
  }

  .desk-msg.assistant {
    border-left: 2px solid var(--accent);
    padding-left: 0.5rem;
  }

  .desk-proposal {
    border: 1px solid var(--line-soft);
    background: var(--surface-2);
    padding: 0.5rem 0.55rem;
    display: grid;
    gap: 0.3rem;
  }

  .desk-proposal.ask {
    border-color: var(--amber);
  }

  .desk-proposal.done {
    border-color: var(--up);
  }

  .desk-proposal.failed {
    border-color: var(--red);
  }

  .desk-proposal.running {
    border-color: var(--accent);
  }

  .desk-proposal-head {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .desk-proposal-summary {
    margin: 0;
    color: var(--ink);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .desk-proposal-reason,
  .desk-proposal-error {
    margin: 0;
    font-size: 0.68rem;
    color: var(--muted);
  }

  .desk-proposal-error {
    color: var(--red);
  }

  .desk-proposal-actions {
    display: flex;
    gap: 0.35rem;
    margin-top: 0.15rem;
  }

  .desk-skeleton {
    border-left: 2px solid var(--accent);
    padding-left: 0.5rem;
    display: grid;
    gap: 0.45rem;
  }

  .desk-skeleton i {
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
    animation: desk-shimmer 2.2s ease-in-out infinite;
  }

  .desk-skeleton i:last-child {
    width: 62%;
    animation-delay: 180ms;
  }

  @keyframes desk-shimmer {
    0% {
      background-position: 150% 0;
    }
    100% {
      background-position: -150% 0;
    }
  }

  .desk-state {
    margin: auto;
    display: grid;
    gap: 0.5rem;
    justify-items: center;
    color: var(--muted);
    font-size: 0.78rem;
    line-height: 1.45;
    text-align: center;
  }

  .desk-state p {
    margin: 0;
  }

  .desk-state-error {
    color: var(--red);
  }

  .desk-form {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem 0.75rem;
    border-top: 1px solid var(--line-soft);
  }

  .desk-input-label {
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

  .desk-input {
    resize: none;
    width: 100%;
    color: var(--ink);
    font: inherit;
    font-size: 0.8rem;
    padding: 0.45rem 0.55rem;
    background: var(--surface-2);
    border: 1px solid var(--line);
  }

  .desk-input:focus {
    border-color: var(--accent);
    outline: 1px solid var(--accent);
    outline-offset: 0;
  }

  .desk-input::placeholder {
    color: var(--faint);
  }

  .desk-send {
    align-self: flex-end;
  }

  @media (max-width: 1100px) {
    .desk-dock {
      position: fixed;
      inset: 0;
      top: var(--anchor-top, 3rem);
      width: auto;
      height: auto;
      grid-column: auto;
      grid-row: auto;
      z-index: 30;
      border-left: none;
    }
  }
</style>
