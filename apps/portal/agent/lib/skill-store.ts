import { createHash } from "node:crypto";
import {
  deletePrivateObject,
  listPrivateObjects,
  ownerPartition,
  readPrivateJson,
  updatePrivateJson,
  writePrivateJson,
} from "./blob-json";
import {
  assembleSkillPackage,
  type ParsedSkillPackage,
  RESERVED_SKILL_NAMES,
  SKILL_NAME_RE,
  SkillFormatException,
  toSkillMd,
} from "./skill-format";

const ROOT = "agent-state/v1/skills";
const MAX_SKILLS_PER_USER = 20;

export type UserSkillRecord = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  markdown: string;
  files: Record<string, string>;
  openaiYaml: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export type UserSkillSummary = {
  name: string;
  description: string;
  enabled: boolean;
  updatedAt: string;
  hasOpenaiYaml: boolean;
  fileCount: number;
};

function prefix(ownerId: string): string {
  return `${ROOT}/${ownerPartition(ownerId)}/`;
}

function pathname(ownerId: string, name: string): string {
  if (!SKILL_NAME_RE.test(name)) throw new Error("skill-name-invalid");
  return `${prefix(ownerId)}${name}.json`;
}

function idForName(name: string): string {
  return createHash("sha256").update(name).digest("hex").slice(0, 32);
}

function assertWritableName(name: string): void {
  if (!SKILL_NAME_RE.test(name) || name.length > 64) {
    throw new SkillFormatException("invalid-name");
  }
  if (RESERVED_SKILL_NAMES.has(name)) {
    throw new SkillFormatException("reserved-name");
  }
}

function toSummary(skill: UserSkillRecord): UserSkillSummary {
  return {
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    updatedAt: skill.updatedAt,
    hasOpenaiYaml: skill.openaiYaml !== null,
    fileCount: Object.keys(skill.files).length,
  };
}

export const skillStore = {
  async list(ownerId: string): Promise<UserSkillRecord[]> {
    const objects = await listPrivateObjects({
      prefix: prefix(ownerId),
      limit: MAX_SKILLS_PER_USER,
    });
    const rows = await Promise.all(
      objects.blobs.map(async (blob) => {
        const stored = await readPrivateJson<UserSkillRecord>(blob.pathname);
        return stored?.value ?? null;
      }),
    );
    return rows
      .filter(
        (row): row is UserSkillRecord =>
          row !== null && row.ownerId === ownerId,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async listEnabled(ownerId: string): Promise<UserSkillRecord[]> {
    return (await this.list(ownerId)).filter((skill) => skill.enabled);
  },

  async get(ownerId: string, name: string): Promise<UserSkillRecord | null> {
    assertWritableName(name);
    const stored = await readPrivateJson<UserSkillRecord>(
      pathname(ownerId, name),
    );
    if (!stored || stored.value.ownerId !== ownerId) return null;
    return stored.value;
  },

  async install(
    ownerId: string,
    input: {
      skillMd: string;
      files?: Record<string, string>;
      fallbackName?: string;
      enabled?: boolean;
    },
  ): Promise<UserSkillRecord> {
    const parsed = assembleSkillPackage({
      skillMd: input.skillMd,
      files: input.files,
      fallbackName: input.fallbackName,
    });
    return await this.putParsed(ownerId, parsed, input.enabled ?? true);
  },

  async putParsed(
    ownerId: string,
    parsed: ParsedSkillPackage,
    enabled: boolean,
  ): Promise<UserSkillRecord> {
    assertWritableName(parsed.name);
    const existing = await readPrivateJson<UserSkillRecord>(
      pathname(ownerId, parsed.name),
    );
    const now = new Date().toISOString();
    if (existing) {
      if (existing.value.ownerId !== ownerId) {
        throw new Error("skill-owner-mismatch");
      }
      return await updatePrivateJson<UserSkillRecord>(
        pathname(ownerId, parsed.name),
        (current) => ({
          ...current,
          description: parsed.description,
          markdown: parsed.markdown,
          files: parsed.files,
          openaiYaml: parsed.openaiYaml,
          enabled,
          updatedAt: now,
          version: current.version + 1,
        }),
      );
    }
    const count = (await this.list(ownerId)).length;
    if (count >= MAX_SKILLS_PER_USER) {
      throw new Error("skill-limit-reached");
    }
    const record: UserSkillRecord = {
      id: idForName(parsed.name),
      ownerId,
      name: parsed.name,
      description: parsed.description,
      markdown: parsed.markdown,
      files: parsed.files,
      openaiYaml: parsed.openaiYaml,
      enabled,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    await writePrivateJson(pathname(ownerId, parsed.name), record);
    return record;
  },

  async setEnabled(
    ownerId: string,
    name: string,
    enabled: boolean,
  ): Promise<UserSkillRecord> {
    assertWritableName(name);
    return await updatePrivateJson<UserSkillRecord>(
      pathname(ownerId, name),
      (current) => {
        if (current.ownerId !== ownerId)
          throw new Error("skill-owner-mismatch");
        return {
          ...current,
          enabled,
          updatedAt: new Date().toISOString(),
          version: current.version + 1,
        };
      },
    );
  },

  async remove(ownerId: string, name: string): Promise<boolean> {
    assertWritableName(name);
    const existing = await this.get(ownerId, name);
    if (!existing) return false;
    await deletePrivateObject(pathname(ownerId, name));
    return true;
  },

  summarize(skills: UserSkillRecord[]): UserSkillSummary[] {
    return skills.map(toSummary);
  },

  exportSkillMd(skill: UserSkillRecord): string {
    return toSkillMd(skill);
  },
};

export function isSkillStoreConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}
