<script lang="ts">
  // Dock shell — presentation lives in AgentChat (shared with full-page).
  import { goto } from "$app/navigation";
  import AgentChat from "./AgentChat.svelte";

  let {
    buildContext,
    onRequestAuth,
    accountMode = "paper",
  }: {
    buildContext: () => Record<string, unknown>;
    onRequestAuth: () => void;
    accountMode?: "live" | "paper";
  } = $props();

  function expand(): void {
    void goto(`/terminal/agent?account=${accountMode}`);
  }
</script>

<AgentChat
  {buildContext}
  {onRequestAuth}
  {accountMode}
  layout="dock"
  onExpand={expand}
/>
