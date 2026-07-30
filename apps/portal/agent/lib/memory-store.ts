import { createHash } from "node:crypto";
import {
  listPrivateObjects,
  ownerPartition,
  readPrivateJson,
  updatePrivateJson,
  writePrivateJson,
} from "./blob-json";
import type { MemoryKind, PersistentMemory } from "./persistent-types";

const ROOT = "agent-state/v1/memories";
const MAX_MEMORIES_PER_USER = 100;

function prefix(ownerId: string): string {
  return `${ROOT}/${ownerPartition(ownerId)}/`;
}

function pathname(ownerId: string, id: string): string {
  if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error("memory-id-invalid");
  return `${prefix(ownerId)}${id}.json`;
}

function idForKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export const memoryStore = {
  async list(
    ownerId: string,
    options: { limit?: number; includeForgotten?: boolean } = {},
  ): Promise<PersistentMemory[]> {
    const limit = Math.min(
      Math.max(options.limit ?? 50, 1),
      MAX_MEMORIES_PER_USER,
    );
    const objects = await listPrivateObjects({
      prefix: prefix(ownerId),
      limit: MAX_MEMORIES_PER_USER,
    });
    const rows = await Promise.all(
      objects.blobs.map(async (blob) => {
        const stored = await readPrivateJson<PersistentMemory>(blob.pathname);
        return stored?.value ?? null;
      }),
    );
    return rows
      .filter(
        (row): row is PersistentMemory =>
          row !== null &&
          row.ownerId === ownerId &&
          (options.includeForgotten === true || row.status === "active"),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  },

  async remember(
    ownerId: string,
    input: {
      key: string;
      kind: MemoryKind;
      value: string;
      provenance: string;
    },
  ): Promise<PersistentMemory> {
    const id = idForKey(input.key);
    const existing = await readPrivateJson<PersistentMemory>(
      pathname(ownerId, id),
    );
    const now = new Date().toISOString();
    if (existing) {
      return await updatePrivateJson<PersistentMemory>(
        pathname(ownerId, id),
        (current) => {
          if (current.ownerId !== ownerId)
            throw new Error("memory-owner-mismatch");
          return {
            ...current,
            kind: input.kind,
            value: input.value,
            provenance: input.provenance,
            status: "active",
            updatedAt: now,
            version: current.version + 1,
          };
        },
      );
    }
    const activeCount = (
      await this.list(ownerId, {
        limit: MAX_MEMORIES_PER_USER,
      })
    ).length;
    if (activeCount >= MAX_MEMORIES_PER_USER) {
      throw new Error("memory-limit-reached");
    }
    const memory: PersistentMemory = {
      id,
      ownerId,
      key: input.key,
      kind: input.kind,
      value: input.value,
      provenance: input.provenance,
      status: "active",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    try {
      await writePrivateJson(pathname(ownerId, memory.id), memory);
    } catch (error) {
      // A concurrent turn may have created the same deterministic key.
      const concurrent = await readPrivateJson<PersistentMemory>(
        pathname(ownerId, memory.id),
      );
      if (!concurrent) throw error;
      return await updatePrivateJson<PersistentMemory>(
        pathname(ownerId, memory.id),
        (current) => ({
          ...current,
          kind: input.kind,
          value: input.value,
          provenance: input.provenance,
          status: "active",
          updatedAt: now,
          version: current.version + 1,
        }),
      );
    }
    return memory;
  },

  async forget(ownerId: string, id: string): Promise<boolean> {
    const stored = await readPrivateJson<PersistentMemory>(
      pathname(ownerId, id),
    );
    if (!stored || stored.value.ownerId !== ownerId) return false;
    if (stored.value.status === "forgotten") return true;
    await updatePrivateJson<PersistentMemory>(
      pathname(ownerId, id),
      (current) => {
        if (current.ownerId !== ownerId)
          throw new Error("memory-owner-mismatch");
        return {
          ...current,
          status: "forgotten",
          value: "",
          updatedAt: new Date().toISOString(),
          version: current.version + 1,
        };
      },
    );
    return true;
  },
};
