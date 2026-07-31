import { json } from "@sveltejs/kit";
import { isLlmProviderId, LLM_PROVIDERS } from "$agent/lib/llm-catalog";
import {
  isLlmProfileStoreConfigured,
  llmProfileStore,
} from "$agent/lib/llm-profile-store";
import { verifyPrivyAccessToken } from "$lib/server/privy";
import type { RequestHandler } from "./$types";

async function requireUser(request: Request): Promise<string | Response> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!token) return json({ error: "auth-required" }, { status: 401 });
  const userId = await verifyPrivyAccessToken(token);
  if (!userId) return json({ error: "auth-invalid" }, { status: 401 });
  return userId;
}

export const GET: RequestHandler = async ({ request, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireUser(request);
  if (user instanceof Response) return user;

  const catalog = LLM_PROVIDERS.map((provider) => ({
    id: provider.id,
    label: provider.label,
    keyHint: provider.keyHint,
    models: provider.models,
  }));

  if (!isLlmProfileStoreConfigured()) {
    return json({
      catalog,
      profiles: [],
      storeConfigured: false,
      platformDefault: {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        label: "Harness default (DeepSeek V4 Pro)",
      },
    });
  }

  try {
    const profiles = await llmProfileStore.list(user);
    return json({
      catalog,
      profiles: llmProfileStore.summarize(profiles),
      storeConfigured: true,
      platformDefault: {
        provider: "deepseek",
        model: "deepseek-v4-pro",
        label: "Harness default (DeepSeek V4 Pro)",
      },
    });
  } catch {
    return json({ error: "llm-store-unavailable" }, { status: 503 });
  }
};

export const POST: RequestHandler = async ({ request, setHeaders }) => {
  setHeaders({ "cache-control": "no-store" });
  const user = await requireUser(request);
  if (user instanceof Response) return user;
  if (!isLlmProfileStoreConfigured()) {
    return json({ error: "llm-store-unconfigured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return json({ error: "invalid-body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : "";
  const provider =
    typeof record.provider === "string" && isLlmProviderId(record.provider)
      ? record.provider
      : null;
  const model = typeof record.model === "string" ? record.model : "";
  const apiKey = typeof record.apiKey === "string" ? record.apiKey : "";
  if (!provider)
    return json({ error: "llm-provider-invalid" }, { status: 400 });

  try {
    const profile = await llmProfileStore.create(user, {
      name,
      provider,
      model,
      apiKey,
      active: record.active !== false,
    });
    return json({ profile: llmProfileStore.summarize([profile])[0] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "llm-store-error";
    const status =
      message === "llm-profile-limit-reached"
        ? 409
        : message.startsWith("llm-")
          ? 400
          : 503;
    return json({ error: message }, { status });
  }
};
