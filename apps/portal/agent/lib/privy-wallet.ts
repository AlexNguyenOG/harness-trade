import { PrivyClient } from "@privy-io/node";

const PRIVY_API = "https://api.privy.io/v1";
const SOLANA_MAINNET_CAIP2 =
  "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" as const;

export type ServerWalletProfile = {
  userId: string;
  address: string;
  walletId: string;
  signerAttached: boolean;
};

function credentials(): {
  appId: string;
  appSecret: string;
  authorizationPrivateKey: string;
} {
  const appId = String(
    process.env.PUBLIC_PRIVY_APP_ID ??
      process.env.NEXT_PUBLIC_PRIVY_APP_ID ??
      "",
  ).trim();
  const appSecret = String(process.env.PRIVY_APP_SECRET ?? "").trim();
  const authorizationPrivateKey = String(
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ?? "",
  ).trim();
  if (!appId || !appSecret) throw new Error("privy-server-not-configured");
  if (!authorizationPrivateKey) {
    throw new Error("privy-server-authorization-key-missing");
  }
  return { appId, appSecret, authorizationPrivateKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function getServerWallet(
  userId: string,
): Promise<ServerWalletProfile> {
  const { appId, appSecret } = credentials();
  const response = await fetch(
    `${PRIVY_API}/users/${encodeURIComponent(userId)}`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
        "privy-app-id": appId,
      },
    },
  );
  if (!response.ok) throw new Error(`privy-user-${response.status}`);
  const user = (await response.json()) as {
    id?: unknown;
    linked_accounts?: unknown;
  };
  if (user.id !== userId) throw new Error("privy-user-mismatch");
  const signerId = String(process.env.PUBLIC_PRIVY_SIGNER_ID ?? "").trim();
  const accounts = Array.isArray(user.linked_accounts)
    ? user.linked_accounts.filter(isRecord)
    : [];
  for (const account of accounts) {
    const chain = String(
      account.chain_type ?? account.chainType ?? account.chain ?? "",
    ).toLowerCase();
    const address = String(account.address ?? "").trim();
    const walletId = String(account.id ?? account.wallet_id ?? "").trim();
    const client = String(
      account.wallet_client ?? account.walletClient ?? "",
    ).toLowerCase();
    if (chain !== "solana" || !address || !walletId) continue;
    if (client && !client.includes("privy")) continue;
    const signers = Array.isArray(account.additional_signers)
      ? account.additional_signers.filter(isRecord)
      : [];
    const signerAttached =
      signerId.length > 0
        ? signers.some(
            (signer) =>
              String(signer.signer_id ?? signer.signerId ?? "") === signerId,
          )
        : account.delegated === true || walletId.length > 0;
    return { userId, address, walletId, signerAttached };
  }
  throw new Error("privy-solana-wallet-not-server-enabled");
}

export async function signAndSendWithPrivy(input: {
  wallet: ServerWalletProfile;
  transaction: Uint8Array;
  idempotencyKey: string;
  referenceId: string;
}): Promise<string> {
  const { appId, appSecret, authorizationPrivateKey } = credentials();
  const client = new PrivyClient({
    appId,
    appSecret,
    requestExpiry: { defaultMs: 5 * 60_000 },
  });
  const result = await client
    .wallets()
    .solana()
    .signAndSendTransaction(input.wallet.walletId, {
      caip2: SOLANA_MAINNET_CAIP2,
      transaction: input.transaction,
      idempotency_key: input.idempotencyKey,
      reference_id: input.referenceId.slice(0, 64),
      authorization_context: {
        authorization_private_keys: [authorizationPrivateKey],
      },
    });
  if (!result.hash) throw new Error("privy-transaction-hash-missing");
  return result.hash;
}
