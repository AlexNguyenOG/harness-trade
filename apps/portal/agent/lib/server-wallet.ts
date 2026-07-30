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

export type ServerWalletReceipt = {
  signature: string;
  status: "confirmed" | "rejected" | "unknown";
  slot: number | null;
  error: string | null;
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
}): Promise<ServerWalletReceipt> {
  const keypair = keypairFor(input.wallet.userId);
  if (keypair.publicKey.toBase58() !== input.wallet.address) {
    throw new Error("agent-wallet-derivation-mismatch");
  }
  input.transaction.sign([keypair]);
  const signature = await input.connection.sendRawTransaction(
    input.transaction.serialize(),
    {
      maxRetries: 3,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    },
  );

  try {
    const confirmation = await input.connection.confirmTransaction(
      signature,
      "confirmed",
    );
    if (confirmation.value.err) {
      return {
        signature,
        status: "rejected",
        slot: confirmation.context.slot,
        error: JSON.stringify(confirmation.value.err),
      };
    }
    return {
      signature,
      status: "confirmed",
      slot: confirmation.context.slot,
      error: null,
    };
  } catch (error) {
    // Confirmation can time out after a successful broadcast. Reconcile once
    // against history before classifying the receipt as unknown; callers must
    // never retry an unknown signature automatically.
    const reconciled = await input.connection
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .then((response) => response.value[0])
      .catch(() => null);
    if (reconciled?.err) {
      return {
        signature,
        status: "rejected",
        slot: reconciled.slot,
        error: JSON.stringify(reconciled.err),
      };
    }
    if (
      reconciled?.confirmationStatus === "confirmed" ||
      reconciled?.confirmationStatus === "finalized"
    ) {
      return {
        signature,
        status: "confirmed",
        slot: reconciled.slot,
        error: null,
      };
    }
    return {
      signature,
      status: "unknown",
      slot: reconciled?.slot ?? null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
