// Canonical Privy access-token verification for Eve and SvelteKit.
// ES256 JWTs: iss privy.io, aud = app id, sub = user DID.
// JWKS: https://auth.privy.io/api/v1/apps/{appId}/jwks.json

const PRIVY_ISSUER = "privy.io";
const JWKS_TTL_MS = 10 * 60_000;

type PrivyJwk = JsonWebKey & { kid?: string };
let jwksCache: { keys: PrivyJwk[]; at: number } | null = null;

function appId(): string {
  return String(
    process.env.PUBLIC_PRIVY_APP_ID ??
      process.env.NEXT_PUBLIC_PRIVY_APP_ID ??
      process.env.VITE_PRIVY_APP_ID ??
      "",
  )
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\\n$/, "");
}

function decodeJson(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

async function fetchJwks(id: string): Promise<PrivyJwk[] | null> {
  const cached = jwksCache;
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;
  try {
    const response = await fetch(
      `https://auth.privy.io/api/v1/apps/${encodeURIComponent(id)}/jwks.json`,
    );
    if (!response.ok) return cached ? cached.keys : null;
    const payload = (await response.json()) as { keys?: unknown };
    const keys = Array.isArray(payload.keys)
      ? (payload.keys.filter(
          (key) => typeof key === "object" && key !== null,
        ) as PrivyJwk[])
      : [];
    if (keys.length === 0) return cached ? cached.keys : null;
    jwksCache = { keys, at: Date.now() };
    return keys;
  } catch {
    return cached ? cached.keys : null;
  }
}

/** Verify a Privy access token. Returns the user's DID (sub) or null. */
export async function verifyPrivyToken(token: string): Promise<string | null> {
  const id = appId();
  if (!id || !token.trim()) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = decodeJson(headerB64);
    const payload = decodeJson(payloadB64);
    if (header.alg !== "ES256" || payload.iss !== PRIVY_ISSUER) return null;
    const audience = payload.aud;
    if (
      !(audience === id || (Array.isArray(audience) && audience.includes(id)))
    ) {
      return null;
    }
    if (
      typeof payload.exp !== "number" ||
      payload.exp * 1_000 <= Date.now() ||
      typeof payload.sub !== "string" ||
      !payload.sub
    ) {
      return null;
    }
    // Optional nbf: reject tokens that are not yet valid.
    if (typeof payload.nbf === "number" && payload.nbf * 1_000 > Date.now()) {
      return null;
    }
    const keys = await fetchJwks(id);
    if (!keys || keys.length === 0) return null;
    const kid = typeof header.kid === "string" ? header.kid : "";
    const candidates = kid
      ? [
          ...keys.filter((key) => key.kid === kid),
          ...keys.filter((key) => key.kid !== kid),
        ]
      : keys;
    const signature = Buffer.from(signatureB64, "base64url");
    const message = Buffer.from(`${headerB64}.${payloadB64}`);
    for (const jwk of candidates) {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      if (
        await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          key,
          signature,
          message,
        )
      ) {
        return payload.sub;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Alias used by SvelteKit routes — same verifier as Eve. */
export const verifyPrivyAccessToken = verifyPrivyToken;
