export type RecentPricePoint = {
  observedAt: string;
  priceUsd: number;
};

export type PriceQuoteModel = {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  changeUsd: number | null;
  changePct: number | null;
  timeframe: "1m";
  recent: RecentPricePoint[];
  source: string;
  observedAt: string;
  expiresAt: string | null;
};

export function projectPriceQuote(input: {
  toolName?: string;
  state?: string;
  output?: unknown;
}): PriceQuoteModel | null {
  if (
    input.toolName !== "get_market_price" ||
    input.state !== "output-available"
  ) {
    return null;
  }
  const output = asRecord(input.output);
  if (!output) return null;
  const presentation = asRecord(output.presentation);
  if (
    presentation?.schema === "harness.presentation.v2" &&
    presentation.component === "price_quote"
  ) {
    return fromV2(presentation);
  }
  return fromLegacy(output);
}

function fromV2(presentation: Record<string, unknown>): PriceQuoteModel | null {
  const data = asRecord(presentation.data);
  const provenance = asRecord(presentation.provenance);
  const symbol = normalizedSymbol(data?.symbol);
  const priceUsd = finitePositive(data?.priceUsd);
  const source = text(provenance?.source);
  const observedAt = isoDate(provenance?.observedAt);
  if (!symbol || priceUsd === null || !source || !observedAt) return null;
  const recent = recentPoints(data?.recent);
  const changeUsd = finiteNumber(data?.changeUsd);
  const changePct = finiteNumber(data?.changePct);
  return {
    id: text(presentation.id) ?? `price:${symbol}:${observedAt}`,
    symbol,
    name: text(data?.name) ?? symbol,
    priceUsd,
    changeUsd,
    changePct,
    timeframe: "1m",
    recent: recent.length > 0 ? recent : [{ observedAt, priceUsd }],
    source,
    observedAt,
    expiresAt: isoDate(provenance?.expiresAt),
  };
}

function fromLegacy(output: Record<string, unknown>): PriceQuoteModel | null {
  const symbol = normalizedSymbol(output.symbol);
  const priceUsd = finitePositive(output.priceUsd);
  const source = text(output.source);
  const observedAt = isoDate(output.observedAt) ?? isoDate(output.fetchedAt);
  if (!symbol || priceUsd === null || !source || !observedAt) return null;
  return {
    id: `price:${symbol}:${observedAt}`,
    symbol,
    name: assetName(symbol),
    priceUsd,
    changeUsd: null,
    changePct: null,
    timeframe: "1m",
    recent: [{ observedAt, priceUsd }],
    source,
    observedAt,
    expiresAt: null,
  };
}

function recentPoints(value: unknown): RecentPricePoint[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-6).flatMap((row): RecentPricePoint[] => {
    const record = asRecord(row);
    const priceUsd = finitePositive(record?.priceUsd);
    const observedAt = isoDate(record?.observedAt);
    return priceUsd !== null && observedAt ? [{ priceUsd, observedAt }] : [];
  });
}

function assetName(symbol: string): string {
  if (symbol === "SOL") return "Solana";
  if (symbol === "BTC") return "Bitcoin";
  if (symbol === "ETH") return "Ethereum";
  return symbol;
}

function normalizedSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value
    .trim()
    .toUpperCase()
    .replace(/-PERP$/, "");
  return /^[A-Z0-9._-]{1,16}$/.test(symbol) ? symbol : null;
}

function finitePositive(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return value;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
