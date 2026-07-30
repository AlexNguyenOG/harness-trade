<script lang="ts">
  import type { PriceQuoteModel } from "$lib/agent/price-presentation";

  let {
    quote,
    layout = "dock",
  }: {
    quote: PriceQuoteModel;
    layout?: "dock" | "page";
  } = $props();

  const stale = $derived(
    quote.expiresAt !== null && Date.parse(quote.expiresAt) < Date.now(),
  );
  const direction = $derived(
    quote.changePct === null
      ? "flat"
      : quote.changePct > 0
        ? "up"
        : quote.changePct < 0
          ? "down"
          : "flat",
  );

  function formatPrice(value: number): string {
    const digits = value >= 1 ? 2 : value >= 0.01 ? 4 : 6;
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  function formatChange(value: number | null): string {
    if (value === null) return "Latest";
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}%`;
  }

  function formatUtc(value: string): string {
    const date = new Date(value);
    return `${String(date.getUTCHours()).padStart(2, "0")}:${String(
      date.getUTCMinutes(),
    ).padStart(2, "0")}`;
  }
</script>

<section
  class="price-quote"
  class:layout-page={layout === "page"}
  class:stale
  aria-label={`${quote.name} market price`}
>
  <header class="quote-head">
    <div class="asset">
      <span class="asset-mark" aria-hidden="true">{quote.symbol.slice(0, 1)}</span>
      <div>
        <strong>{quote.symbol}</strong>
        <span>{quote.name}</span>
      </div>
    </div>
    <div class="quote-tags" aria-label="Price provenance">
      <span>{quote.source}</span>
      <span>{quote.timeframe}</span>
      <span class:stale-tag={stale}>
        {stale ? "stale" : `${formatUtc(quote.observedAt)} UTC`}
      </span>
    </div>
  </header>

  <div class="quote-primary">
    <strong>{formatPrice(quote.priceUsd)}</strong>
    <span class:up={direction === "up"} class:down={direction === "down"}>
      {formatChange(quote.changePct)}
      {#if quote.changePct !== null}
        <small>1m</small>
      {/if}
    </span>
  </div>

  <div class="recent-label">
    <span>Recent closes</span>
    <span>UTC</span>
  </div>
  <div class="recent-prices" aria-label="Recent one-minute closes">
    {#each quote.recent as point, index (`${point.observedAt}:${point.priceUsd}`)}
      <div class:latest={index === quote.recent.length - 1}>
        <span>{formatUtc(point.observedAt)}</span>
        <strong>{formatPrice(point.priceUsd)}</strong>
      </div>
    {/each}
  </div>
</section>

<style>
  .price-quote {
    display: grid;
    gap: 0.7rem;
    padding: 0.75rem;
    border: 1px solid var(--line);
    border-left: 2px solid var(--accent);
    background: var(--surface-2);
    color: var(--ink);
    white-space: normal;
  }

  .price-quote.stale {
    border-left-color: var(--amber);
  }

  .quote-head,
  .quote-primary,
  .recent-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .asset {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
  }

  .asset-mark {
    display: grid;
    flex: 0 0 auto;
    width: 1.75rem;
    height: 1.75rem;
    place-items: center;
    border: 1px solid var(--accent);
    color: var(--accent);
    font-size: 0.72rem;
    font-weight: 800;
  }

  .asset div {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    min-width: 0;
  }

  .asset strong {
    color: var(--ink);
    font-size: 0.82rem;
    letter-spacing: 0.04em;
  }

  .asset div span {
    overflow: hidden;
    color: var(--muted);
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quote-tags {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.25rem;
  }

  .quote-tags span {
    padding: 0.12rem 0.28rem;
    border: 1px solid var(--line-soft);
    color: var(--faint);
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .quote-tags .stale-tag {
    color: var(--amber);
    border-color: var(--amber);
  }

  .quote-primary {
    align-items: flex-end;
    border-top: 1px solid var(--line-soft);
    padding-top: 0.65rem;
  }

  .quote-primary > strong {
    font-size: clamp(1.4rem, 5vw, 2rem);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.035em;
    line-height: 1;
  }

  .quote-primary > span {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    color: var(--muted);
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .quote-primary > span.up {
    color: var(--up);
  }

  .quote-primary > span.down {
    color: var(--red);
  }

  .quote-primary small {
    color: var(--faint);
    font-size: 0.55rem;
    text-transform: uppercase;
  }

  .recent-label {
    color: var(--faint);
    font-size: 0.54rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .recent-prices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(5.25rem, 1fr));
    gap: 0.3rem;
  }

  .recent-prices div {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
    padding: 0.32rem 0.38rem;
    border: 1px solid var(--line-soft);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }

  .recent-prices div.latest {
    border-color: var(--accent);
    color: var(--ink);
  }

  .recent-prices span {
    color: var(--faint);
    font-size: 0.52rem;
  }

  .recent-prices strong {
    overflow: hidden;
    font-size: 0.66rem;
    text-overflow: ellipsis;
  }

  .layout-page {
    padding: 0.9rem 1rem;
  }

  .layout-page .quote-primary > strong {
    font-size: clamp(1.8rem, 4vw, 2.45rem);
  }

  @media (max-width: 520px) {
    .quote-head {
      align-items: flex-start;
    }

    .asset div {
      display: grid;
      gap: 0.05rem;
    }

    .recent-prices {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
</style>
