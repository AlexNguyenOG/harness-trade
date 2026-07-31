// Allowlisted LLM providers for user BYOK profiles.
// Keys stay server-side; the browser only sends them on write and never reads them back.

export type LlmProviderId = "deepseek" | "openai" | "anthropic";

export type LlmModelOption = {
  id: string;
  label: string;
};

export type LlmProviderOption = {
  id: LlmProviderId;
  label: string;
  models: LlmModelOption[];
  keyHint: string;
};

export const LLM_PROVIDERS: readonly LlmProviderOption[] = [
  {
    id: "deepseek",
    label: "DeepSeek",
    keyHint: "DEEPSEEK_API_KEY from platform.deepseek.com",
    models: [
      { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    keyHint: "OPENAI_API_KEY from platform.openai.com",
    models: [
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "o4-mini", label: "o4-mini" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyHint: "ANTHROPIC_API_KEY from console.anthropic.com",
    models: [
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
] as const;

export function isLlmProviderId(value: string): value is LlmProviderId {
  return LLM_PROVIDERS.some((provider) => provider.id === value);
}

export function providerModels(provider: LlmProviderId): LlmModelOption[] {
  return (
    LLM_PROVIDERS.find((entry) => entry.id === provider)?.models.slice() ?? []
  );
}

export function isAllowedModel(
  provider: LlmProviderId,
  model: string,
): boolean {
  return providerModels(provider).some((entry) => entry.id === model);
}

export function apiKeyLast4(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length < 4) return "****";
  return trimmed.slice(-4);
}
