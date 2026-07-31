import { createHash, randomBytes } from "node:crypto";
import {
  deletePrivateObject,
  listPrivateObjects,
  ownerPartition,
  readPrivateJson,
  updatePrivateJson,
  writePrivateJson,
} from "./blob-json";
import {
  apiKeyLast4,
  isAllowedModel,
  isLlmProviderId,
  type LlmProviderId,
} from "./llm-catalog";

const ROOT = "agent-state/v1/llm-profiles";
const MAX_PROFILES = 8;
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9 _.-]{0,47}$/;

export type LlmProfileRecord = {
  id: string;
  ownerId: string;
  name: string;
  provider: LlmProviderId;
  model: string;
  /** Server-only. Never returned to the browser or the model. */
  apiKey: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type LlmProfilePublic = {
  id: string;
  name: string;
  provider: LlmProviderId;
  model: string;
  active: boolean;
  hasApiKey: boolean;
  apiKeyLast4: string;
  updatedAt: string;
};

function prefix(ownerId: string): string {
  return `${ROOT}/${ownerPartition(ownerId)}/`;
}

function pathname(ownerId: string, id: string): string {
  if (!/^[0-9a-f]{32}$/i.test(id)) throw new Error("llm-profile-id-invalid");
  return `${prefix(ownerId)}${id}.json`;
}

function newId(): string {
  return createHash("sha256")
    .update(randomBytes(32))
    .digest("hex")
    .slice(0, 32);
}

function assertName(name: string): string {
  const trimmed = name.trim();
  if (!NAME_RE.test(trimmed)) throw new Error("llm-profile-name-invalid");
  return trimmed;
}

function toPublic(profile: LlmProfileRecord): LlmProfilePublic {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    model: profile.model,
    active: profile.active,
    hasApiKey: profile.apiKey.trim().length > 0,
    apiKeyLast4: apiKeyLast4(profile.apiKey),
    updatedAt: profile.updatedAt,
  };
}

export const llmProfileStore = {
  async list(ownerId: string): Promise<LlmProfileRecord[]> {
    const objects = await listPrivateObjects({
      prefix: prefix(ownerId),
      limit: MAX_PROFILES,
    });
    const rows = await Promise.all(
      objects.blobs.map(async (blob) => {
        const stored = await readPrivateJson<LlmProfileRecord>(blob.pathname);
        return stored?.value ?? null;
      }),
    );
    return rows
      .filter(
        (row): row is LlmProfileRecord =>
          row !== null && row.ownerId === ownerId,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async getActive(ownerId: string): Promise<LlmProfileRecord | null> {
    const profiles = await this.list(ownerId);
    return profiles.find((profile) => profile.active && profile.apiKey) ?? null;
  },

  async get(ownerId: string, id: string): Promise<LlmProfileRecord | null> {
    const stored = await readPrivateJson<LlmProfileRecord>(
      pathname(ownerId, id),
    );
    if (!stored || stored.value.ownerId !== ownerId) return null;
    return stored.value;
  },

  async create(
    ownerId: string,
    input: {
      name: string;
      provider: LlmProviderId;
      model: string;
      apiKey: string;
      active?: boolean;
    },
  ): Promise<LlmProfileRecord> {
    if (!isLlmProviderId(input.provider)) {
      throw new Error("llm-provider-invalid");
    }
    if (!isAllowedModel(input.provider, input.model)) {
      throw new Error("llm-model-not-allowed");
    }
    const apiKey = input.apiKey.trim();
    if (apiKey.length < 8 || apiKey.length > 256) {
      throw new Error("llm-api-key-invalid");
    }
    const existing = await this.list(ownerId);
    if (existing.length >= MAX_PROFILES) {
      throw new Error("llm-profile-limit-reached");
    }
    const now = new Date().toISOString();
    const makeActive = input.active !== false;
    if (makeActive) {
      await this.clearActive(ownerId, existing);
    }
    const record: LlmProfileRecord = {
      id: newId(),
      ownerId,
      name: assertName(input.name),
      provider: input.provider,
      model: input.model,
      apiKey,
      active: makeActive,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await writePrivateJson(pathname(ownerId, record.id), record);
    return record;
  },

  async update(
    ownerId: string,
    id: string,
    patch: {
      name?: string;
      provider?: LlmProviderId;
      model?: string;
      apiKey?: string;
      active?: boolean;
    },
  ): Promise<LlmProfileRecord> {
    const current = await this.get(ownerId, id);
    if (!current) throw new Error("agent-state-object-not-found");

    const provider = patch.provider ?? current.provider;
    const model = patch.model ?? current.model;
    if (!isLlmProviderId(provider) || !isAllowedModel(provider, model)) {
      throw new Error("llm-model-not-allowed");
    }
    if (patch.apiKey !== undefined) {
      const apiKey = patch.apiKey.trim();
      if (apiKey.length < 8 || apiKey.length > 256) {
        throw new Error("llm-api-key-invalid");
      }
    }
    if (patch.active === true) {
      await this.clearActive(ownerId, await this.list(ownerId), id);
    }

    return await updatePrivateJson<LlmProfileRecord>(
      pathname(ownerId, id),
      (row) => {
        if (row.ownerId !== ownerId)
          throw new Error("llm-profile-owner-mismatch");
        return {
          ...row,
          name: patch.name !== undefined ? assertName(patch.name) : row.name,
          provider,
          model,
          apiKey: patch.apiKey !== undefined ? patch.apiKey.trim() : row.apiKey,
          active: patch.active ?? row.active,
          updatedAt: new Date().toISOString(),
          version: row.version + 1,
        };
      },
    );
  },

  async remove(ownerId: string, id: string): Promise<boolean> {
    const existing = await this.get(ownerId, id);
    if (!existing) return false;
    await deletePrivateObject(pathname(ownerId, id));
    return true;
  },

  summarize(profiles: LlmProfileRecord[]): LlmProfilePublic[] {
    return profiles.map(toPublic);
  },

  async clearActive(
    ownerId: string,
    profiles: LlmProfileRecord[],
    exceptId?: string,
  ): Promise<void> {
    await Promise.all(
      profiles
        .filter((profile) => profile.active && profile.id !== exceptId)
        .map(async (profile) => {
          await updatePrivateJson<LlmProfileRecord>(
            pathname(ownerId, profile.id),
            (row) => ({
              ...row,
              active: false,
              updatedAt: new Date().toISOString(),
              version: row.version + 1,
            }),
          );
        }),
    );
  },
};

export function isLlmProfileStoreConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}
