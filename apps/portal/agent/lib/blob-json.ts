import { createHash } from "node:crypto";
import {
  BlobPreconditionFailedError,
  del,
  get,
  type ListBlobResultBlob,
  list,
  put,
} from "@vercel/blob";

const MAX_JSON_BYTES = 256 * 1024;

export type StoredJson<T> = {
  value: T;
  etag: string;
  pathname: string;
};

function token(): string {
  const value = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!value) throw new Error("agent-state-store-unconfigured");
  return value;
}

export function ownerPartition(ownerId: string): string {
  return createHash("sha256").update(ownerId).digest("hex").slice(0, 32);
}

export async function readPrivateJson<T>(
  pathname: string,
): Promise<StoredJson<T> | null> {
  const result = await get(pathname, {
    access: "private",
    token: token(),
  });
  if (!result || result.statusCode !== 200) return null;
  if (result.blob.size > MAX_JSON_BYTES) {
    throw new Error("agent-state-object-too-large");
  }
  const value = (await new Response(result.stream).json()) as T;
  return {
    value,
    etag: result.blob.etag,
    pathname: result.blob.pathname,
  };
}

export async function writePrivateJson<T>(
  pathname: string,
  value: T,
  options: { etag?: string; overwrite?: boolean } = {},
): Promise<{ etag: string; pathname: string }> {
  const body = JSON.stringify(value);
  if (Buffer.byteLength(body, "utf8") > MAX_JSON_BYTES) {
    throw new Error("agent-state-object-too-large");
  }
  const stored = await put(pathname, body, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: options.overwrite ?? options.etag !== undefined,
    cacheControlMaxAge: 60,
    contentType: "application/json",
    ...(options.etag ? { ifMatch: options.etag } : {}),
    token: token(),
  });
  return { etag: stored.etag, pathname: stored.pathname };
}

export async function listPrivateObjects(options: {
  prefix: string;
  limit: number;
  cursor?: string;
}): Promise<{
  blobs: ListBlobResultBlob[];
  cursor?: string;
  hasMore: boolean;
}> {
  return await list({
    prefix: options.prefix,
    limit: options.limit,
    ...(options.cursor ? { cursor: options.cursor } : {}),
    token: token(),
  });
}

export async function deletePrivateObject(pathname: string): Promise<void> {
  await del(pathname, { token: token() });
}

export async function updatePrivateJson<T>(
  pathname: string,
  update: (current: T) => T,
  retries = 4,
): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const stored = await readPrivateJson<T>(pathname);
    if (!stored) throw new Error("agent-state-object-not-found");
    const next = update(stored.value);
    try {
      await writePrivateJson(pathname, next, { etag: stored.etag });
      return next;
    } catch (error) {
      if (
        error instanceof BlobPreconditionFailedError &&
        attempt + 1 < retries
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("agent-state-write-conflict");
}
