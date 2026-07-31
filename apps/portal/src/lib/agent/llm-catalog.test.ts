import { describe, expect, test } from "bun:test";
import {
  apiKeyLast4,
  isAllowedModel,
  isLlmProviderId,
  LLM_PROVIDERS,
} from "../../../agent/lib/llm-catalog";

describe("llm-catalog", () => {
  test("exposes deepseek, openai, and anthropic", () => {
    expect(LLM_PROVIDERS.map((p) => p.id)).toEqual([
      "deepseek",
      "openai",
      "anthropic",
    ]);
  });

  test("accepts allowlisted models only", () => {
    expect(isLlmProviderId("openai")).toBe(true);
    expect(isLlmProviderId("gemini")).toBe(false);
    expect(isAllowedModel("openai", "gpt-5.4-mini")).toBe(true);
    expect(isAllowedModel("openai", "gpt-malware")).toBe(false);
    expect(isAllowedModel("anthropic", "claude-sonnet-4-6")).toBe(true);
  });

  test("masks api keys to last 4", () => {
    expect(apiKeyLast4("sk-abcdefghij")).toBe("ghij");
    expect(apiKeyLast4("ab")).toBe("****");
  });
});
