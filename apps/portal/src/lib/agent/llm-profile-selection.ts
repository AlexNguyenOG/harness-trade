import { get, writable } from "svelte/store";

const KEY = "harness.llmProfile.v1";

/** Sentinel: force platform/default model (ignore server-active BYOK). */
export const PLATFORM_LLM_PROFILE = "platform";

export type LlmProfileSelection = {
  /**
   * Profile id for x-harness-llm-profile, PLATFORM_LLM_PROFILE for Harness
   * default, or null before the user has chosen (server-active then platform).
   */
  profileId: string | null;
};

function isProfileId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/i.test(value);
}

function read(): LlmProfileSelection {
  if (typeof localStorage === "undefined") return { profileId: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { profileId: null };
    const parsed = JSON.parse(raw) as { profileId?: unknown };
    if (parsed.profileId === PLATFORM_LLM_PROFILE) {
      return { profileId: PLATFORM_LLM_PROFILE };
    }
    return {
      profileId: isProfileId(parsed.profileId) ? parsed.profileId : null,
    };
  } catch {
    return { profileId: null };
  }
}

export const llmProfileSelection = writable<LlmProfileSelection>(read());

if (typeof localStorage !== "undefined") {
  llmProfileSelection.subscribe((state) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // best-effort
    }
  });
}

export function setLlmProfileId(profileId: string | null): void {
  llmProfileSelection.set({ profileId });
}

export function getLlmProfileId(): string | null {
  return get(llmProfileSelection).profileId;
}

/** Value for the Eve request header, or null to omit (server-active fallback). */
export function llmProfileHeaderValue(): string | null {
  const id = getLlmProfileId();
  if (!id) return null;
  if (id === PLATFORM_LLM_PROFILE) return PLATFORM_LLM_PROFILE;
  return isProfileId(id) ? id : null;
}
