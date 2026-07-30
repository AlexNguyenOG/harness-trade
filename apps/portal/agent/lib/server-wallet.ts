import { createHmac } from "node:crypto";
import {
  type Connection,
  Keypair,
  type VersionedTransaction,
} from "@solana/web3.js";

const DERIVATION_CONTEXT = "harness:eve:solana-mainnet:v1";

export type ServerWalletProfile = {
  userId: string;
  address: string;
  serverCustody: true;
};

function masterKey(): Buffer {
  const encoded = String(process.env.AGENT_WALLET_MASTER_SECRET ?? "").trim();
  if (!encoded) throw new Error("agent-wallet-master-secret-missing");
  const key = Buffer.from(encoded, "base64url");
  if (key.byteLength < 32) {
    throw new Error("agent-wallet-master-secret-invalid");
  }
  return key;
}

function keypairFor(userId: string): Keypair {
  const normalized = userId.trim();
  if (!normalized) throw new Error("agent-wallet-user-missing");
  const seed = createHmac("sha256", masterKey())
    .update(DERIVATION_CONTEXT)
    .update("\0")
    .update(normalized)
    .digest();
  return Keypair.fromSeed(seed);
}

/**
 * Each authenticated principal gets a stable server-custody wallet. The key is
 * deterministically derived inside the EVE runtime and is never returned to the
 * browser, the model, tool input, or durable conversation state.
 */
export function getServerWallet(userId: string): ServerWalletProfile {
  const keypair = keypairFor(userId);
  return {
    userId,
    address: keypair.publicKey.toBase58(),
    serverCustody: true,
  };
}

export async function signAndSendWithServerWallet(input: {
  wallet: ServerWalletProfile;
  transaction: VersionedTransaction;
  connection: Connection;
}): Promise<string> {
  const keypair = keypairFor(input.wallet.userId);
  if (keypair.publicKey.toBase58() !== input.wallet.address) {
    throw new Error("agent-wallet-derivation-mismatch");
  }
  input.transaction.sign([keypair]);
  return input.connection.sendRawTransaction(input.transaction.serialize(), {
    maxRetries: 3,
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
}
