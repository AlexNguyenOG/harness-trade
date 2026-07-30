<script lang="ts">
  import { shortAddress } from "$lib/terminal/account-format";
  import {
    formatDisplayMoney,
    formatDisplayMoneySigned,
    type DisplayCurrencyCode,
  } from "$lib/terminal/display-currency";
  import {
    formatClockInZone,
    type DisplayTimezoneId,
  } from "$lib/terminal/display-timezone";
  import { formatNumber } from "$lib/utils";

  // Fixed footer — one already-derived model object per tick from the page.
  // The tx stage text arrives pre-rendered (txStageText stays in the page
  // with the signing pipeline; the ticket's order stage uses it too).
  type StatusModel = {
    clockMs: number;
    symbol: string;
    selectedSymbol: string;
    sessionNote: string;
    streamHealth: "connecting" | "live" | "stale" | "offline";
    rpcLatencyMs: number | null;
    apiSlotLag: number | null;
    lastTx: { label: string; failed: boolean; text: string } | null;
    armedHotkey: { key: "c" | "x"; until: number } | null;
    showMoney: boolean;
    paperMode: boolean;
    equityUsd: number;
    upnlUsd: number;
    /** Day P&L vs UTC-day equity baseline (null until first sample). */
    sessionPnlUsd: number | null;
    freeCollateralUsd: number;
    fundingPercent: number | null;
    walletAddress: string;
    displayCurrency: DisplayCurrencyCode;
    fxRate: number;
    displayTimezone: DisplayTimezoneId;
  };

  let {
    status,
    onshowshortcuts,
    onjumptopositions,
    onreconnect,
  }: {
    status: StatusModel;
    onshowshortcuts: () => void;
    onjumptopositions: () => void;
    onreconnect?: () => void;
  } = $props();

  const streamNeedsHelp = $derived(
    status.streamHealth === "offline" || status.streamHealth === "stale",
  );
</script>

<footer class="status-line" aria-label="Terminal status">
  <span class="mono sl-clock"
    >{formatClockInZone(status.clockMs, status.displayTimezone)}</span
  >
  <span class="sl-sep" aria-hidden="true"></span>
  <span class="sl-session">{status.symbol} · {status.sessionNote}</span>
  <span class="sl-sep" aria-hidden="true"></span>
  {#if streamNeedsHelp && onreconnect}
    <button
      type="button"
      class="sl-reconnect sl-stream warn-txt"
      title="Reconnect market data"
      onclick={onreconnect}
    >
      WS {status.streamHealth} · retry
    </button>
  {:else}
    <span
      class="sl-stream"
      class:positive={status.streamHealth === "live"}
      class:warn-txt={status.streamHealth !== "live"}
    >WS {status.streamHealth}</span>
  {/if}
  <span class="sl-rpc">RPC {status.rpcLatencyMs !== null ? `${status.rpcLatencyMs}ms` : "--"}</span>
  {#if status.apiSlotLag !== null}
    <span
      class="sl-sync"
      class:warn-txt={status.apiSlotLag > 150}
      title="Phoenix indexer slots behind the chain tip"
    >
      SYNC −{status.apiSlotLag}
    </span>
  {/if}
  {#if status.lastTx}
    <span class="sl-sep" aria-hidden="true"></span>
    <span class="mono sl-transient" class:warn-txt={status.lastTx.failed}>
      TX {status.lastTx.label} · {status.lastTx.text}
    </span>
  {/if}
  {#if status.armedHotkey}
    <span class="sl-sep" aria-hidden="true"></span>
    <span class="sl-transient warn-txt">
      {status.armedHotkey.key === "c"
        ? `press C again to market-close ${status.selectedSymbol}`
        : `press X again to cancel ${status.selectedSymbol} orders`}
    </span>
  {/if}
  <span class="sl-grow" aria-hidden="true"></span>
  {#if status.showMoney}
    <!-- Money at a glance, always: the segment jumps to the perp desk. -->
    <div class="sl-money-scroll">
      <button
        type="button"
        class="sl-money"
        title="Jump to positions"
        onclick={onjumptopositions}
      >
        <span
          class="paper-badge"
          class:on={status.paperMode}
          title={status.paperMode ? "Simulated balance on live prices" : undefined}
          aria-hidden={!status.paperMode}
        >
          PAPER
        </span>
        <span
          >EQ {formatDisplayMoney(
            status.equityUsd,
            status.displayCurrency,
            status.fxRate,
            0,
          )}</span
        >
        {#if status.sessionPnlUsd !== null}
          <span
            class:positive={status.sessionPnlUsd >= 0}
            class:negative={status.sessionPnlUsd < 0}
            title="Today vs UTC-day equity baseline"
          >
            Today {formatDisplayMoneySigned(
              status.sessionPnlUsd,
              status.displayCurrency,
              status.fxRate,
              2,
            )}
          </span>
        {/if}
        <span class:positive={status.upnlUsd >= 0} class:negative={status.upnlUsd < 0}>
          uPNL {formatDisplayMoneySigned(
            status.upnlUsd,
            status.displayCurrency,
            status.fxRate,
            2,
          )}
        </span>
        <span
          >FREE {formatDisplayMoney(
            status.freeCollateralUsd,
            status.displayCurrency,
            status.fxRate,
            0,
          )}</span
        >
        {#if status.fundingPercent !== null}
          <span>FUND {status.fundingPercent >= 0 ? "+" : ""}{formatNumber(status.fundingPercent, 3)}%/8h</span>
        {/if}
      </button>
    </div>
    <span class="sl-sep" aria-hidden="true"></span>
  {/if}
  {#if status.walletAddress}
    <span class="mono sl-wallet">{shortAddress(status.walletAddress)}</span>
    <span class="sl-sep" aria-hidden="true"></span>
  {/if}
  <button
    type="button"
    class="sl-help"
    aria-label="Keyboard shortcuts"
    onclick={onshowshortcuts}
  >? shortcuts</button>
</footer>

<style>
  /* ── Status line ─────────────────────────────────────────────────── */
  .status-line {
    position: fixed;
    inset: auto 0 0 0;
    /* Stop under the agent dock when open so the line doesn't cover the
       composer (shell sets --agent-dock-w only while chat-open). */
    right: var(--agent-dock-w, 0px);
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.9rem;
    height: var(--status-h, 1.9rem);
    padding: 0 1rem;
    border-top: 1px solid var(--line);
    background: rgba(8, 10, 13, 0.92);
    backdrop-filter: blur(10px);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 0.66rem;
    color: var(--muted);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    scrollbar-width: none;
  }

  .status-line::-webkit-scrollbar { display: none; }

  .sl-sep { width: 1px; height: 0.9rem; background: var(--line-soft); }
  .sl-grow { flex: 1; }
  .warn-txt { color: var(--amber); }

  .sl-help {
    border: 1px solid var(--line);
    background: transparent;
    color: var(--muted);
    font: inherit;
    padding: 0.06rem 0.4rem;
    cursor: pointer;
  }

  .sl-help:hover { color: var(--ink); }

  .sl-reconnect {
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    padding: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .sl-reconnect:hover {
    color: var(--ink);
  }

  /* Account money in the fixed line: equity/uPnL/free/funding, one click
     from the perp desk. */
  .sl-money-scroll {
    display: flex;
    min-width: 0;
  }

  .sl-money {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    border: 0;
    background: transparent;
    color: var(--muted);
    font: inherit;
    padding: 0;
    cursor: pointer;
  }

  .sl-money:hover { color: var(--ink); }

  .paper-badge {
    display: inline-block;
    min-width: 2.6rem;
    color: var(--accent);
    font-weight: 800;
    letter-spacing: 0.04em;
    opacity: 0;
    transition: opacity 160ms ease;
  }

  .paper-badge.on {
    opacity: 1;
  }

  /* The agent becomes a full-width sheet at this breakpoint, so the footer
     belongs to the full viewport instead of retaining the desktop dock gutter. */
  @media (max-width: 1100px) {
    .status-line {
      right: 0;
    }
  }

  @media (max-width: 720px) {
    .status-line {
      gap: 0.45rem;
      padding: 0 0.5rem;
      overflow: hidden;
      white-space: nowrap;
    }

    /* Keep live health and transaction warnings visible; move secondary
       desktop telemetry out of the scarce phone footer. */
    .sl-clock,
    .sl-session,
    .sl-rpc,
    .sl-sync,
    .sl-wallet,
    .sl-sep,
    .sl-grow {
      display: none;
    }

    .sl-stream,
    .sl-transient,
    .sl-help {
      flex: 0 0 auto;
    }

    .sl-transient {
      max-width: 34vw;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Account data gets the remaining width and its own discoverable swipe
       lane. This preserves every metric without widening the document. */
    .sl-money-scroll {
      flex: 1 1 auto;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scrollbar-width: none;
    }

    .sl-money-scroll::-webkit-scrollbar {
      display: none;
    }

    .sl-money {
      min-width: max-content;
      gap: 0.6rem;
    }

    .paper-badge {
      min-width: auto;
    }

    .paper-badge:not(.on) {
      display: none;
    }

    .sl-help {
      width: 1.6rem;
      height: 1.4rem;
      margin-left: auto;
      padding: 0;
      font-size: 0;
    }

    .sl-help::before {
      content: "?";
      font-size: 0.66rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .paper-badge {
      transition: none !important;
    }
  }

  @media (max-width: 1100px) {
    .status-line {
      right: 0;
    }
  }
</style>
