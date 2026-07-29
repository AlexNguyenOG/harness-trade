<script lang="ts">
  // Full-page agent chat — Cursor pre-v3 style: conversation is the app.
  import "../terminal.css";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import AgentChat from "../components/AgentChat.svelte";
  import {
    buildPaperDeskContext,
    registerPaperAgentHost,
  } from "$lib/agent/paper-host";
  import { chatState } from "$lib/chat";
  import { initializePrivyAuth, privyAuth } from "$lib/privy-auth";

  // Keep dock closed while on full page — one surface.
  $effect(() => {
    if ($chatState.open) {
      chatState.update((state) => ({ ...state, open: false }));
    }
  });

  onMount(() => {
    void initializePrivyAuth();
    const stop = registerPaperAgentHost();
    return () => stop();
  });

  function requestAuth(): void {
    // Full-page chat reuses terminal auth modal.
    void goto("/terminal?auth=1");
  }
</script>

<div class="agent-page">
  <nav class="agent-nav">
    <a class="brand" href="/terminal">Harness</a>
    <span class="sep">/</span>
    <span class="here">Agent</span>
    <div class="nav-spacer"></div>
    <button class="ghost" type="button" onclick={() => void goto("/terminal")}>
      Terminal
    </button>
    {#if !$privyAuth.authenticated}
      <button class="secondary" type="button" onclick={requestAuth}>
        Sign in
      </button>
    {/if}
  </nav>

  <main class="agent-main">
    <AgentChat
      buildContext={buildPaperDeskContext}
      onRequestAuth={requestAuth}
      accountMode="paper"
      layout="page"
    />
  </main>
</div>

<style>
  .agent-page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    color: var(--ink);
  }

  .agent-nav {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.55rem 1rem;
    border-bottom: 1px solid var(--line);
    background: var(--surface);
  }

  .brand {
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .sep {
    color: var(--faint);
  }

  .here {
    color: var(--muted);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .nav-spacer {
    flex: 1;
  }

  .ghost,
  .secondary {
    font: inherit;
    font-size: 0.72rem;
    font-weight: 700;
    padding: 0.3rem 0.55rem;
    cursor: pointer;
  }

  .ghost {
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line-soft);
  }

  .secondary {
    color: var(--ink);
    background: var(--surface-2);
    border: 1px solid var(--line);
  }

  .agent-main {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
