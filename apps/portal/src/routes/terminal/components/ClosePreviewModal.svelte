<script lang="ts">
  import type { PhoenixPosition } from "$lib/phoenix-trade";
  import {
    formatDisplayMoney,
    formatDisplayMoneySigned,
    type DisplayCurrencyCode,
  } from "$lib/terminal/display-currency";
  import { formatNumber, formatPrice } from "$lib/utils";
  import { onMount } from "svelte";

  let {
    position,
    mark,
    fraction = 1,
    paperMode = false,
    displayCurrency = "USD",
    fxRate = 1,
    busy = false,
    onconfirm,
    onclose,
  }: {
    position: PhoenixPosition;
    mark: number | null;
    fraction?: number;
    paperMode?: boolean;
    displayCurrency?: DisplayCurrencyCode;
    fxRate?: number;
    busy?: boolean;
    onconfirm: () => void;
    onclose: () => void;
  } = $props();

  let panel: HTMLElement | undefined = $state();

  const closeSize = $derived(Math.abs(position.size) * fraction);
  const side = $derived(position.size > 0 ? "Long" : "Short");
  const entry = $derived(position.entryPrice);
  const estPnl = $derived(
    entry !== null && mark !== null
      ? (mark - entry) * position.size * fraction
      : position.unrealizedPnl !== null
        ? position.unrealizedPnl * fraction
        : null,
  );
  const pctLabel = $derived(
    fraction >= 0.999 ? "Full" : `${Math.round(fraction * 100)}%`,
  );

  onMount(() => {
    panel?.focus();
  });

  function onWinKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onclose();
  }

  function onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      onclose();
      return;
    }
    event.stopPropagation();
  }
</script>

<svelte:window onkeydown={onWinKeydown} />

<div class="modal-backdrop" role="presentation" onclick={() => onclose()}>
  <div
    bind:this={panel}
    class="modal close-preview"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm close"
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
    onkeydown={onPanelKeydown}
  >
    <div class="panel-head">
      <div>
        <p>{paperMode ? "PAPER_CLOSE" : "CLOSE"}</p>
        <h2>{pctLabel} close · {position.symbol}</h2>
      </div>
      <button class="modal-close" type="button" aria-label="Cancel" onclick={() => onclose()}
        >×</button
      >
    </div>

    <div class="modal-body mono">
      <div class="row">
        <span>Side</span>
        <b class:positive={position.size > 0} class:negative={position.size < 0}>{side}</b>
      </div>
      <div class="row">
        <span>Size</span>
        <b>{formatNumber(closeSize, 4)}</b>
      </div>
      <div class="row">
        <span>Entry → mark</span>
        <b>
          {formatPrice(entry)}
          →
          {formatPrice(mark)}
        </b>
      </div>
      <div class="row pnl">
        <span>Est. P&amp;L</span>
        {#if estPnl !== null}
          <b class:positive={estPnl >= 0} class:negative={estPnl < 0}>
            {formatDisplayMoneySigned(estPnl, displayCurrency, fxRate, 2)}
          </b>
        {:else}
          <b>--</b>
        {/if}
      </div>
    </div>

    <div class="modal-actions">
      <button class="secondary" type="button" onclick={() => onclose()}>Cancel</button>
      <button class="primary" type="button" disabled={busy} onclick={() => onconfirm()}>
        {#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
        {busy ? "Closing…" : paperMode ? "Confirm paper close" : "Confirm close"}
      </button>
    </div>
  </div>
</div>

<style>
  .close-preview {
    max-width: 22rem;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 0.85rem 1rem 0.4rem;
  }

  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    color: var(--muted);
    font-size: 0.78rem;
  }

  .row b {
    color: var(--ink);
    font-weight: 700;
  }

  .row.pnl b {
    font-size: 0.95rem;
  }

  .positive {
    color: var(--up);
  }

  .negative {
    color: var(--down);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding: 0.75rem 1rem 1rem;
  }
</style>
