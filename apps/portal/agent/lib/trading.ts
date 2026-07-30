import {
  PublicKey,
  type TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import type { ToolContext } from "eve/tools";
import { SOL_MINT, USDC_MINT } from "../../src/lib/funding";
import {
  buildAddIsolatedMarginIxs,
  buildCancelAllIxs,
  buildCancelSingleOrderIxs,
  buildPlaceOrderPlan,
  buildSetPositionTpSlIxs,
  buildSignableTransaction,
  createSolanaConnection,
  ensureTraderRegisteredIxs,
  fetchPhoenixTraderState,
  type PhoenixOpenOrder,
  type PhoenixPosition,
  type PhoenixSide,
} from "../../src/lib/phoenix-trade";
import { appendTransaction } from "./ledger";
import {
  getServerWallet,
  type ServerWalletProfile,
  signAndSendWithServerWallet,
} from "./server-wallet";

const JUPITER_API = "https://lite-api.jup.ag";
const TOKENS_API = "https://api.tokens.xyz/v1";

export type TradeResult = {
  ok: true;
  operation: string;
  summary: string;
  signatures: string[];
  explorerUrls: string[];
};

type SpotAsset = {
  symbol: string;
  mint: string;
  decimals: number;
  price: number | null;
};

function rpcUrl(): string {
  const value = String(
    process.env.PUBLIC_SOLANA_RPC_URL ??
      process.env.SOLANA_RPC_URL ??
      "https://api.mainnet-beta.solana.com",
  ).trim();
  if (!value.startsWith("https://")) throw new Error("solana-rpc-invalid");
  return value;
}

function normalizeSymbol(value: string): string {
  const symbol = value
    .trim()
    .toUpperCase()
    .replace(/-PERP$/, "");
  if (!/^[A-Z0-9._-]{1,16}$/.test(symbol)) {
    throw new Error("market-symbol-invalid");
  }
  return symbol;
}

function finitePositive(value: number, name: string, max = 1_000_000): number {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(`${name}-invalid`);
  }
  return value;
}

function findPosition(
  positions: PhoenixPosition[],
  symbol: string,
  subaccountIndex?: number,
): PhoenixPosition {
  const normalized = normalizeSymbol(symbol);
  const position = positions.find(
    (row) =>
      row.symbol === normalized &&
      (subaccountIndex === undefined ||
        row.subaccountIndex === subaccountIndex),
  );
  if (!position || position.size === 0) {
    throw new Error(`phoenix-position-not-found-${normalized}`);
  }
  return position;
}

async function currentPhoenixPrice(symbol: string): Promise<number> {
  const params = new URLSearchParams({
    symbol: normalizeSymbol(symbol),
    timeframe: "1m",
    limit: "2",
  });
  const response = await fetch(
    `https://perp-api.phoenix.trade/candles?${params}`,
  );
  if (!response.ok) throw new Error(`phoenix-price-${response.status}`);
  const rows = (await response.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error("phoenix-price-malformed");
  const latest = rows.at(-1);
  const price =
    typeof latest === "object" && latest !== null
      ? Number((latest as Record<string, unknown>).close)
      : NaN;
  return finitePositive(price, "phoenix-price");
}

function validateWalletTransaction(
  transaction: VersionedTransaction,
  wallet: ServerWalletProfile,
): void {
  if (transaction.message.header.numRequiredSignatures !== 1) {
    throw new Error("transaction-extra-signers-rejected");
  }
  const feePayer = transaction.message.staticAccountKeys[0]?.toBase58();
  if (feePayer !== wallet.address) {
    throw new Error("transaction-fee-payer-mismatch");
  }
}

async function sendVersioned(
  _ctx: ToolContext,
  wallet: ServerWalletProfile,
  transaction: VersionedTransaction,
  _suffix: string,
): Promise<string> {
  validateWalletTransaction(transaction, wallet);
  const connection = createSolanaConnection(rpcUrl());
  const simulation = await connection.simulateTransaction(transaction, {
    sigVerify: false,
  });
  if (simulation.value.err) {
    throw new Error(
      `transaction-simulation-failed:${JSON.stringify(simulation.value.err)}`,
    );
  }
  return signAndSendWithServerWallet({
    wallet,
    transaction,
    connection,
  });
}

async function sendInstructions(
  ctx: ToolContext,
  wallet: ServerWalletProfile,
  instructions: TransactionInstruction[],
  suffix: string,
): Promise<string> {
  if (instructions.length === 0) throw new Error("transaction-empty");
  const { transaction } = await buildSignableTransaction(
    rpcUrl(),
    wallet.address,
    instructions,
  );
  return sendVersioned(ctx, wallet, transaction, suffix);
}

function result(
  ctx: ToolContext,
  operation: string,
  summary: string,
  signatures: string[],
): TradeResult {
  const entry = {
    id: `${ctx.session.id}:${ctx.callId}`,
    at: new Date().toISOString(),
    operation,
    summary,
    signatures,
  };
  appendTransaction(entry);
  return {
    ok: true,
    operation,
    summary,
    signatures,
    explorerUrls: signatures.map(
      (signature) => `https://solscan.io/tx/${signature}`,
    ),
  };
}

async function serverContext(ctx: ToolContext) {
  const principal = ctx.session.auth.current;
  if (
    !principal ||
    principal.principalType !== "user" ||
    principal.principalId !== ctx.session.auth.initiator?.principalId
  ) {
    throw new Error("agent-session-owner-mismatch");
  }
  const wallet = getServerWallet(principal.principalId);
  return { wallet, trader: await fetchPhoenixTraderState(wallet.address) };
}

export type ExecuteTradeInput =
  | {
      operation: "place_perp";
      symbol: string;
      side: "buy" | "sell";
      orderType: "market" | "limit";
      sizeUsd: number;
      leverage: number;
      limitPrice?: number;
      takeProfit?: number;
      stopLoss?: number;
      reduceOnly?: boolean;
    }
  | {
      operation: "place_spot";
      symbol: string;
      side: "buy" | "sell";
      orderType: "market" | "limit";
      sizeUsd: number;
      limitPrice?: number;
      slippageBps?: number;
    }
  | {
      operation: "cancel_order";
      venue: "perp" | "spot";
      orderId: string;
    }
  | {
      operation: "cancel_symbol_orders";
      symbol: string;
      side?: "buy" | "sell" | "both";
    }
  | {
      operation: "close_position" | "close_position_fraction";
      symbol: string;
      fraction?: number;
      subaccountIndex?: number;
    }
  | { operation: "close_all_positions" }
  | {
      operation: "set_tp_sl";
      symbol: string;
      takeProfit?: number | null;
      stopLoss?: number | null;
      subaccountIndex?: number;
    }
  | {
      operation: "set_break_even" | "reverse_position";
      symbol: string;
      subaccountIndex?: number;
    }
  | {
      operation: "add_margin";
      symbol: string;
      amountUsd: number;
      subaccountIndex?: number;
    };

export async function executeTrade(
  input: ExecuteTradeInput,
  ctx: ToolContext,
): Promise<TradeResult> {
  if (input.operation === "place_spot") return placeSpot(input, ctx);
  if (input.operation === "cancel_order" && input.venue === "spot") {
    return cancelSpot(input.orderId, ctx);
  }
  const { wallet, trader } = await serverContext(ctx);

  if (input.operation === "place_perp") {
    const symbol = normalizeSymbol(input.symbol);
    const sizeUsd = finitePositive(input.sizeUsd, "size-usd", 1_000_000);
    const leverage = finitePositive(input.leverage, "leverage", 100);
    const price =
      input.orderType === "limit"
        ? finitePositive(Number(input.limitPrice), "limit-price")
        : await currentPhoenixPrice(symbol);
    const quantity = sizeUsd / price;
    const registration = await ensureTraderRegisteredIxs(
      wallet.address,
      trader.registered,
    );
    const plan = await buildPlaceOrderPlan({
      authority: wallet.address,
      symbol,
      side: input.side === "buy" ? "bid" : "ask",
      orderType: input.orderType,
      quantity,
      ...(input.orderType === "limit" ? { price } : {}),
      marginUsd: input.reduceOnly ? 0 : sizeUsd / leverage,
      takeProfitPrice: input.takeProfit,
      stopLossPrice: input.stopLoss,
      reduceOnly: input.reduceOnly,
    });
    const signature = await sendInstructions(
      ctx,
      wallet,
      [...registration, ...plan.instructions],
      "place-perp",
    );
    return result(
      ctx,
      input.operation,
      `${input.side.toUpperCase()} ${symbol} ${input.orderType} $${sizeUsd.toFixed(2)} @ ${leverage}x`,
      [signature],
    );
  }

  if (input.operation === "cancel_order") {
    const order = trader.orders.find(
      (row) => row.orderSequenceNumber === input.orderId,
    );
    if (!order) throw new Error("phoenix-order-not-found");
    const signature = await sendInstructions(
      ctx,
      wallet,
      await buildCancelSingleOrderIxs(wallet.address, order),
      "cancel-perp-order",
    );
    return result(
      ctx,
      input.operation,
      `Cancelled perp order ${input.orderId}`,
      [signature],
    );
  }

  if (input.operation === "cancel_symbol_orders") {
    const symbol = normalizeSymbol(input.symbol);
    const sides: PhoenixSide[] =
      input.side === "buy"
        ? ["bid"]
        : input.side === "sell"
          ? ["ask"]
          : ["bid", "ask"];
    const instructions = (
      await Promise.all(
        sides.map((side) => buildCancelAllIxs(wallet.address, symbol, side)),
      )
    ).flat();
    const signature = await sendInstructions(
      ctx,
      wallet,
      instructions,
      "cancel-symbol-orders",
    );
    return result(ctx, input.operation, `Cancelled ${symbol} open orders`, [
      signature,
    ]);
  }

  if (
    input.operation === "close_position" ||
    input.operation === "close_position_fraction"
  ) {
    const position = findPosition(
      trader.positions,
      input.symbol,
      input.subaccountIndex,
    );
    const fraction =
      input.operation === "close_position"
        ? 1
        : finitePositive(Number(input.fraction), "fraction", 1);
    const plan = await closePlan(wallet.address, position, fraction);
    const signature = await sendInstructions(
      ctx,
      wallet,
      plan.instructions,
      "close-position",
    );
    return result(
      ctx,
      input.operation,
      `Closed ${(fraction * 100).toFixed(0)}% of ${position.symbol}`,
      [signature],
    );
  }

  if (input.operation === "close_all_positions") {
    if (trader.positions.length === 0) throw new Error("no-open-positions");
    const signatures: string[] = [];
    for (const [index, position] of trader.positions.entries()) {
      const plan = await closePlan(wallet.address, position, 1);
      signatures.push(
        await sendInstructions(
          ctx,
          wallet,
          plan.instructions,
          `close-all-${index}`,
        ),
      );
    }
    return result(
      ctx,
      input.operation,
      `Closed ${trader.positions.length} position(s)`,
      signatures,
    );
  }

  if (input.operation === "set_tp_sl") {
    const position = findPosition(
      trader.positions,
      input.symbol,
      input.subaccountIndex,
    );
    if (input.takeProfit === undefined && input.stopLoss === undefined) {
      throw new Error("tp-sl-update-required");
    }
    const signature = await sendInstructions(
      ctx,
      wallet,
      await buildSetPositionTpSlIxs(wallet.address, position, {
        takeProfitPrice: input.takeProfit,
        stopLossPrice: input.stopLoss,
      }),
      "set-tp-sl",
    );
    return result(ctx, input.operation, `Updated ${position.symbol} TP/SL`, [
      signature,
    ]);
  }

  if (input.operation === "set_break_even") {
    const position = findPosition(
      trader.positions,
      input.symbol,
      input.subaccountIndex,
    );
    if (!position.entryPrice) throw new Error("position-entry-price-missing");
    const signature = await sendInstructions(
      ctx,
      wallet,
      await buildSetPositionTpSlIxs(wallet.address, position, {
        stopLossPrice: position.entryPrice,
      }),
      "break-even",
    );
    return result(
      ctx,
      input.operation,
      `Moved ${position.symbol} stop to ${position.entryPrice}`,
      [signature],
    );
  }

  if (input.operation === "add_margin") {
    const position = findPosition(
      trader.positions,
      input.symbol,
      input.subaccountIndex,
    );
    const amountUsd = finitePositive(input.amountUsd, "amount-usd", 1_000_000);
    const signature = await sendInstructions(
      ctx,
      wallet,
      await buildAddIsolatedMarginIxs(wallet.address, position, amountUsd),
      "add-margin",
    );
    return result(
      ctx,
      input.operation,
      `Added $${amountUsd.toFixed(2)} margin to ${position.symbol}`,
      [signature],
    );
  }

  const position = findPosition(
    trader.positions,
    input.symbol,
    input.subaccountIndex,
  );
  const notional = Math.abs(
    position.positionValue ??
      position.size *
        (position.entryPrice ?? (await currentPhoenixPrice(position.symbol))),
  );
  const leverage =
    position.marginUsd && position.marginUsd > 0
      ? Math.max(1, notional / position.marginUsd)
      : 1;
  const close = await closePlan(wallet.address, position, 1);
  const closeSignature = await sendInstructions(
    ctx,
    wallet,
    close.instructions,
    "reverse-close",
  );
  const price = await currentPhoenixPrice(position.symbol);
  const open = await buildPlaceOrderPlan({
    authority: wallet.address,
    symbol: position.symbol,
    side: position.size > 0 ? "ask" : "bid",
    orderType: "market",
    quantity: notional / price,
    marginUsd: notional / leverage,
  });
  const openSignature = await sendInstructions(
    ctx,
    wallet,
    open.instructions,
    "reverse-open",
  );
  return result(
    ctx,
    input.operation,
    `Reversed ${position.symbol} at approximately $${notional.toFixed(2)} notional`,
    [closeSignature, openSignature],
  );
}

async function closePlan(
  authority: string,
  position: PhoenixPosition,
  fraction: number,
) {
  return buildPlaceOrderPlan({
    authority,
    symbol: position.symbol,
    side: position.size > 0 ? "ask" : "bid",
    orderType: "market",
    quantity: Math.abs(position.size) * fraction,
    reduceOnly: true,
  });
}

async function fetchSpotAsset(symbol: string): Promise<SpotAsset> {
  const key = String(process.env.TOKENS_XYZ_API_KEY ?? "").trim();
  if (!key) throw new Error("tokens-xyz-key-missing");
  const response = await fetch(`${TOKENS_API}/assets/curated`, {
    headers: { "x-api-key": key },
  });
  if (!response.ok) throw new Error(`tokens-xyz-${response.status}`);
  const payload = (await response.json()) as { assets?: unknown };
  const wanted = normalizeSymbol(symbol);
  for (const value of Array.isArray(payload.assets) ? payload.assets : []) {
    if (typeof value !== "object" || value === null) continue;
    const row = value as Record<string, unknown>;
    if (String(row.symbol ?? "").toUpperCase() !== wanted) continue;
    const variant =
      typeof row.primaryVariant === "object" && row.primaryVariant !== null
        ? (row.primaryVariant as Record<string, unknown>)
        : {};
    const market =
      typeof variant.market === "object" && variant.market !== null
        ? (variant.market as Record<string, unknown>)
        : {};
    const stats =
      typeof row.stats === "object" && row.stats !== null
        ? (row.stats as Record<string, unknown>)
        : {};
    const mint = String(variant.mint ?? "");
    const decimals = Number(market.decimals);
    const price = Number(stats.price);
    if (mint && Number.isInteger(decimals) && decimals >= 0) {
      new PublicKey(mint);
      return {
        symbol: wanted,
        mint,
        decimals,
        price: Number.isFinite(price) && price > 0 ? price : null,
      };
    }
  }
  throw new Error(`spot-asset-not-found-${wanted}`);
}

async function placeSpot(
  input: Extract<ExecuteTradeInput, { operation: "place_spot" }>,
  ctx: ToolContext,
): Promise<TradeResult> {
  const principalId = ctx.session.auth.current?.principalId;
  if (!principalId || principalId !== ctx.session.auth.initiator?.principalId) {
    throw new Error("agent-session-owner-mismatch");
  }
  const wallet = getServerWallet(principalId);
  const asset = await fetchSpotAsset(input.symbol);
  const sizeUsd = finitePositive(input.sizeUsd, "size-usd", 1_000_000);
  const inputMint = input.side === "buy" ? USDC_MINT : asset.mint;
  const outputMint = input.side === "buy" ? asset.mint : USDC_MINT;
  const tokenPrice =
    input.orderType === "limit"
      ? finitePositive(Number(input.limitPrice), "limit-price")
      : finitePositive(Number(asset.price), "spot-price");
  const inputAtoms =
    input.side === "buy"
      ? Math.round(sizeUsd * 1e6)
      : Math.round((sizeUsd / tokenPrice) * 10 ** asset.decimals);

  let transactionBase64: string;
  let orderKey = "";
  if (input.orderType === "market") {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(inputAtoms),
      slippageBps: String(
        Math.min(500, Math.max(1, Math.round(input.slippageBps ?? 50))),
      ),
      restrictIntermediateTokens: "true",
    });
    const quoteResponse = await fetch(`${JUPITER_API}/swap/v1/quote?${params}`);
    if (!quoteResponse.ok) {
      throw new Error(`jupiter-quote-${quoteResponse.status}`);
    }
    const quote = await quoteResponse.json();
    const swapResponse = await fetch(`${JUPITER_API}/swap/v1/swap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: wallet.address,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      }),
    });
    const swap = (await swapResponse.json().catch(() => null)) as {
      swapTransaction?: string;
    } | null;
    if (!swapResponse.ok || !swap?.swapTransaction) {
      throw new Error(`jupiter-swap-${swapResponse.status}`);
    }
    transactionBase64 = swap.swapTransaction;
  } else {
    const tokenAtoms = Math.round(
      (sizeUsd / tokenPrice) * 10 ** asset.decimals,
    );
    const response = await fetch(`${JUPITER_API}/trigger/v1/createOrder`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inputMint,
        outputMint,
        maker: wallet.address,
        payer: wallet.address,
        params: {
          makingAmount: String(
            input.side === "buy" ? Math.round(sizeUsd * 1e6) : tokenAtoms,
          ),
          takingAmount: String(
            input.side === "buy" ? tokenAtoms : Math.round(sizeUsd * 1e6),
          ),
        },
        computeUnitPrice: "auto",
      }),
    });
    const created = (await response.json().catch(() => null)) as {
      transaction?: string;
      order?: string;
    } | null;
    if (!response.ok || !created?.transaction || !created.order) {
      throw new Error(`jupiter-trigger-create-${response.status}`);
    }
    transactionBase64 = created.transaction;
    orderKey = created.order;
  }
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(transactionBase64, "base64"),
  );
  const signature = await sendVersioned(
    ctx,
    wallet,
    transaction,
    input.orderType === "market" ? "spot-swap" : "spot-limit",
  );
  return result(
    ctx,
    input.operation,
    `${input.side.toUpperCase()} ${asset.symbol} ${input.orderType} $${sizeUsd.toFixed(2)}${orderKey ? ` (order ${orderKey})` : ""}`,
    [signature],
  );
}

async function cancelSpot(
  orderId: string,
  ctx: ToolContext,
): Promise<TradeResult> {
  new PublicKey(orderId);
  const principalId = ctx.session.auth.current?.principalId;
  if (!principalId || principalId !== ctx.session.auth.initiator?.principalId) {
    throw new Error("agent-session-owner-mismatch");
  }
  const wallet = getServerWallet(principalId);
  const response = await fetch(`${JUPITER_API}/trigger/v1/cancelOrder`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      maker: wallet.address,
      order: orderId,
      computeUnitPrice: "auto",
    }),
  });
  const payload = (await response.json().catch(() => null)) as {
    transaction?: string;
  } | null;
  if (!response.ok || !payload?.transaction) {
    throw new Error(`jupiter-trigger-cancel-${response.status}`);
  }
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(payload.transaction, "base64"),
  );
  const signature = await sendVersioned(
    ctx,
    wallet,
    transaction,
    "cancel-spot-order",
  );
  return result(ctx, "cancel_order", `Cancelled spot order ${orderId}`, [
    signature,
  ]);
}

export async function getPortfolio(ctx: ToolContext) {
  const principalId = ctx.session.auth.current?.principalId;
  if (!principalId || principalId !== ctx.session.auth.initiator?.principalId) {
    throw new Error("agent-session-owner-mismatch");
  }
  const wallet = getServerWallet(principalId);
  const trader = await fetchPhoenixTraderState(wallet.address);
  const connection = createSolanaConnection(rpcUrl());
  const solBalance = await connection.getBalance(new PublicKey(wallet.address));
  return {
    wallet: {
      address: wallet.address,
      serverSigningEnabled: true,
      custody: "eve-server",
      solBalance: solBalance / 1e9,
    },
    phoenix: trader,
  };
}
